"use strict";

/* eslint-env node */
/* eslint-disable no-undef */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const REGION = "australia-southeast1";
const db = getFirestore();

/**
 * Helpers
 */
function normalizeEmailList(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input.map((x) => String(x || "").trim()).filter(Boolean);
    return String(input)
        .split(/[;,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
}

function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

function pickFirstValidEmail(obj, keys) {
    for (const k of keys) {
        const v = obj?.[k];
        if (v && isValidEmail(v)) return String(v).trim();
    }
    return "";
}

/**
 * Allow ANY authenticated user to send.
 * (No role restrictions.)
 * Profile doc is optional; we fall back to auth token.
 */
async function getUserProfile(uid) {
    if (!uid) return null;
    const snap = await db.collection("User").doc(uid).get();
    return snap.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
}

function getCallerFallback(req) {
    const token = req?.auth?.token || {};
    const email = String(token.email || "").trim();
    const name =
        String(token.name || "").trim() ||
        (email ? email : "User");

    return {
        id: req.auth.uid,
        email: email || null,
        full_name: name || null,
        display_name: name || null,
        app_role: token.app_role || "User",
    };
}

async function getOrCreateThread({ contextType, contextId, subject, createdByUid, createdByName }) {
    const key = `${String(contextType)}:${String(contextId)}:${String(subject || "").trim().toLowerCase()}`;

    const existing = await db.collection("EmailThread").where("key", "==", key).limit(1).get();
    if (!existing.empty) {
        const doc = existing.docs[0];
        return { id: doc.id, ...(doc.data() || {}) };
    }

    const ref = db.collection("EmailThread").doc();
    const payload = {
        key,
        context_type: contextType,
        context_id: contextId,
        subject: String(subject || "Impact Central"),
        created_by_user_id: createdByUid || null,
        created_by_name: createdByName || null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        status: "OPEN",
    };
    await ref.set(payload);
    return { id: ref.id, ...payload };
}

async function addThreadMessage({
    threadId,
    direction,
    from_email,
    from_name,
    to_email,
    subject,
    text,
    html,
    meta,
}) {
    const ref = db.collection("EmailThread").doc(threadId).collection("messages").doc();
    const payload = {
        direction: direction || "OUTBOUND",
        from_email: from_email || null,
        from_name: from_name || null,
        to_email: to_email || null,
        subject: String(subject || ""),
        text: text ? String(text) : null,
        html: html ? String(html) : null,
        meta: meta && typeof meta === "object" ? meta : {},
        created_at: FieldValue.serverTimestamp(),
    };
    await ref.set(payload);

    await db
        .collection("EmailThread")
        .doc(threadId)
        .set(
            { updated_at: FieldValue.serverTimestamp(), last_message_at: FieldValue.serverTimestamp() },
            { merge: true }
        );

    return { id: ref.id, ...payload };
}

async function enqueueMail({ to, subject, html, text, replyTo, type, meta }) {
    const recipients = normalizeEmailList(to).filter(isValidEmail);
    if (!recipients.length) throw new Error("No valid recipients");

    const doc = {
        to: recipients.length === 1 ? recipients[0] : recipients,
        message: {
            subject: String(subject || "Impact Central"),
            ...(html ? { html: String(html) } : {}),
            ...(text ? { text: String(text) } : {}),
        },
        createdAt: FieldValue.serverTimestamp(),
        ...(type ? { type: String(type) } : {}),
        ...(meta && typeof meta === "object" ? { meta } : {}),
        ...(replyTo ? { replyTo } : {}),
    };

    await db.collection("mail").add(doc);
    return { ok: true, recipients: recipients.length };
}

function newToken() {
    return require("crypto").randomUUID();
}

async function ensureThreadPublicToken(threadId) {
    const ref = db.collection("EmailThread").doc(threadId);
    const snap = await ref.get();
    if (!snap.exists) return { token: null };

    const data = snap.data() || {};
    if (data.public_reply_token) return { token: data.public_reply_token };

    const token = newToken();
    await ref.set({ public_reply_token: token }, { merge: true });
    return { token };
}

function buildReplyLink(token) {
    const base = process.env.PUBLIC_BASE_URL || "https://impact-central.com.au";
    return `${base.replace(/\/+$/, "")}/reply?token=${encodeURIComponent(token)}`;
}

/**
 * FAST batch loader for participants (admin SDK supports getAll)
 */
async function getParticipantsByIds(participantIds) {
    const refs = participantIds.map((pid) => db.collection("Participant").doc(String(pid)));
    const snaps = await db.getAll(...refs);
    return snaps.map((s) => (s.exists ? { id: s.id, ...(s.data() || {}) } : null)).filter(Boolean);
}

/**
 * Callable: send email to selected program participants
 * ✅ IMPORTANT CHANGE:
 * We now create/write messages into EACH PARTICIPANT thread,
 * so ParticipantEmails.jsx will show program emails too.
 *
 * data: { programId, participantIds[], subject, html, text }
 */
exports.sendProgramEmail = onCall({ region: REGION, cors: true }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required.");

    let caller = await getUserProfile(uid);
    if (!caller) caller = getCallerFallback(req);

    const data = req.data || {};
    const programId = String(data.programId || "").trim();
    const participantIds = Array.isArray(data.participantIds) ? data.participantIds.map(String) : [];
    const subject = String(data.subject || "Impact Central").trim();
    const html = data.html ? String(data.html) : "";
    const text = data.text ? String(data.text) : "";

    if (!programId) throw new HttpsError("invalid-argument", "programId is required.");
    if (!participantIds.length) throw new HttpsError("invalid-argument", "participantIds is required.");

    const programSnap = await db.collection("Program").doc(programId).get();
    const program = programSnap.exists ? { id: programSnap.id, ...(programSnap.data() || {}) } : { id: programId };
    const programName = String(program.program_name || program.name || "Program");

    const participants = await getParticipantsByIds(participantIds);

    const recipients = participants
        .map((p) => ({
            id: p.id,
            name: `${String(p.first_name || "").trim()} ${String(p.last_name || "").trim()}`.trim(),
            email: pickFirstValidEmail(p, ["contact_email", "email", "email_address"]),
        }))
        .filter((x) => isValidEmail(x.email));

    if (!recipients.length) throw new HttpsError("failed-precondition", "No participants with valid emails.");

    // Reply-To should be staff member (caller)
    const replyToStaff = isValidEmail(caller.email) ? caller.email : undefined;

    const senderLabel = `${caller.full_name || caller.display_name || "Staff"}${caller.email ? ` (${caller.email})` : ""}`;
    const senderBlockHtml = `<p style="font-size:12px;color:#6b7280;margin:12px 0 0 0;">Sent by: <strong>${senderLabel}</strong></p>`;
    const senderBlockText = `\n\nSent by: ${senderLabel}\n`;

    // Use a consistent subject stored in participant threads
    const finalSubject = `${programName}: ${subject}`;

    let sent = 0;
    const participantThreadIds = {};

    for (const r of recipients) {
        // ✅ Thread is now PARTICIPANT-based (so it appears in Participant Emails)
        const thread = await getOrCreateThread({
            contextType: "PARTICIPANT",
            contextId: r.id,
            subject: finalSubject,
            createdByUid: uid,
            createdByName: caller.full_name || caller.display_name || caller.email || "User",
        });

        participantThreadIds[r.id] = thread.id;

        // ✅ Token + reply link is per participant thread
        const { token } = await ensureThreadPublicToken(thread.id);
        const replyLink = token ? buildReplyLink(token) : "";

        const replyBlockHtml = replyLink
            ? `<hr/><p style="font-size:12px;color:#6b7280">To reply, use this link: <a href="${replyLink}">${replyLink}</a></p>`
            : "";

        const outgoingHtml = html ? `${html}${senderBlockHtml}${replyBlockHtml}` : `${senderBlockHtml}${replyBlockHtml}`;
        const outgoingText = text
            ? `${text}${senderBlockText}${replyLink ? `Reply here: ${replyLink}` : ""}`.trim()
            : `${senderBlockText}${replyLink ? `Reply here: ${replyLink}` : ""}`.trim();

        await enqueueMail({
            to: r.email,
            subject: finalSubject,
            html: outgoingHtml,
            text: outgoingText,
            replyTo: replyToStaff,
            type: "programEmail",
            meta: { programId, participantId: r.id, threadId: thread.id },
        });

        await addThreadMessage({
            threadId: thread.id,
            direction: "OUTBOUND",
            from_email: caller.email || null,
            from_name: caller.full_name || caller.display_name || null,
            to_email: r.email,
            subject: finalSubject,
            text: outgoingText || null,
            html: outgoingHtml || null,
            meta: { programId, participantId: r.id, context: "PROGRAM" },
        });

        sent += 1;
    }

    return { ok: true, sent, participantThreadIds };
});

/**
 * Callable: send email to a single participant
 * data: { participantId, subject, html, text }
 */
exports.sendParticipantEmail = onCall({ region: REGION, cors: true }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required.");

    let caller = await getUserProfile(uid);
    if (!caller) caller = getCallerFallback(req);

    const data = req.data || {};
    const participantId = String(data.participantId || "").trim();
    const subject = String(data.subject || "Impact Central").trim();
    const html = data.html ? String(data.html) : "";
    const text = data.text ? String(data.text) : "";

    if (!participantId) throw new HttpsError("invalid-argument", "participantId is required.");

    const pSnap = await db.collection("Participant").doc(participantId).get();
    if (!pSnap.exists) throw new HttpsError("not-found", "Participant not found.");

    const p = { id: pSnap.id, ...(pSnap.data() || {}) };
    const email = pickFirstValidEmail(p, ["contact_email", "email", "email_address"]);
    if (!isValidEmail(email)) throw new HttpsError("failed-precondition", "Participant has no valid email.");

    const thread = await getOrCreateThread({
        contextType: "PARTICIPANT",
        contextId: participantId,
        subject,
        createdByUid: uid,
        createdByName: caller.full_name || caller.display_name || caller.email || "User",
    });

    const { token } = await ensureThreadPublicToken(thread.id);
    const replyLink = token ? buildReplyLink(token) : "";

    const replyToStaff = isValidEmail(caller.email) ? caller.email : undefined;

    const senderLabel = `${caller.full_name || caller.display_name || "Staff"}${caller.email ? ` (${caller.email})` : ""}`;
    const senderBlockHtml = `<p style="font-size:12px;color:#6b7280;margin:12px 0 0 0;">Sent by: <strong>${senderLabel}</strong></p>`;
    const senderBlockText = `\n\nSent by: ${senderLabel}\n`;

    const replyBlockHtml = replyLink
        ? `<hr/><p style="font-size:12px;color:#6b7280">To reply, use this link: <a href="${replyLink}">${replyLink}</a></p>`
        : "";

    const outgoingHtml = html ? `${html}${senderBlockHtml}${replyBlockHtml}` : `${senderBlockHtml}${replyBlockHtml}`;
    const outgoingText = text
        ? `${text}${senderBlockText}${replyLink ? `Reply here: ${replyLink}` : ""}`.trim()
        : `${senderBlockText}${replyLink ? `Reply here: ${replyLink}` : ""}`.trim();

    await enqueueMail({
        to: email,
        subject,
        html: outgoingHtml,
        text: outgoingText,
        replyTo: replyToStaff,
        type: "participantEmail",
        meta: { participantId, threadId: thread.id },
    });

    await addThreadMessage({
        threadId: thread.id,
        direction: "OUTBOUND",
        from_email: caller.email || null,
        from_name: caller.full_name || caller.display_name || null,
        to_email: email,
        subject,
        text: outgoingText || null,
        html: outgoingHtml || null,
        meta: { participantId },
    });

    return { ok: true, threadId: thread.id, sent: 1 };
});
