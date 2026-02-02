// FILE: functions/publicReply.js
// ======================================================
"use strict";

/* eslint-env node */
/* eslint-disable no-undef */

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const REGION = "australia-southeast1";
const db = getFirestore();

function stripHtmlToText(html) {
    return String(html || "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<\/(p|div|br|li|tr|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function serializeTs(v) {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate().toISOString();
    if (typeof v === "string") return v;
    try {
        return new Date(v).toISOString();
    } catch {
        return null;
    }
}

async function getThreadFromToken(token) {
    const tok = String(token || "").trim();
    if (!tok) return null;

    // ✅ Your emailThreads.js stores token here:
    // EmailThread.public_reply_token
    const snap = await db
        .collection("EmailThread")
        .where("public_reply_token", "==", tok)
        .limit(1)
        .get();

    if (snap.empty) return null;

    const doc = snap.docs[0];
    const thread = { id: doc.id, ...(doc.data() || {}) };

    return { threadId: thread.id, thread };
}

function pickPublicSafeMessage(m) {
    return {
        id: m.id,
        direction: m.direction || "",
        subject: m.subject || "",
        from_email: m.from_email || "",
        from_name: m.from_name || "",
        to_email: m.to_email || "",
        html: m.html || null,
        text: m.text || null,
        created_at: serializeTs(m.created_at),
    };
}

// GET: fetch thread + messages for public viewer
exports.publicReplyGet = onRequest({ region: REGION, cors: true }, async (req, res) => {
    try {
        const token = String(req.query.token || "").trim();
        const ctx = await getThreadFromToken(token);
        if (!ctx) return res.status(404).json({ ok: false, error: "Invalid or expired link." });

        // ✅ Your emailThreads.js writes messages here:
        // EmailThread/{threadId}/messages
        const msgsSnap = await db
            .collection("EmailThread")
            .doc(ctx.threadId)
            .collection("messages")
            .orderBy("created_at", "asc")
            .limit(100)
            .get();

        const messages = msgsSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() || {}) }))
            .map(pickPublicSafeMessage);

        return res.json({
            ok: true,
            thread: {
                id: ctx.thread.id,
                subject: ctx.thread.subject || "Email",
                context_type: ctx.thread.context_type || null,
                context_id: ctx.thread.context_id || null,
                participant_id: ctx.thread.participant_id || null,
                program_id: ctx.thread.program_id || null,
            },
            messages,
            expires_at: null
        });
    } catch (e) {
        logger.error("publicReplyGet failed", e);
        return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});

// POST: submit a public reply (creates INBOUND message + Notification)
exports.publicReplyPost = onRequest({ region: REGION, cors: true }, async (req, res) => {
    try {
        if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

        const token = String(req.query.token || "").trim();
        const ctx = await getThreadFromToken(token);
        if (!ctx) return res.status(404).json({ ok: false, error: "Invalid or expired link." });

        const body = req.body || {};
        const name = String(body.name || "").trim().slice(0, 80);
        const email = String(body.email || "").trim().slice(0, 200);
        const text = String(body.text || "").trim();
        const html = String(body.html || "").trim();

        const contentText = text || (html ? stripHtmlToText(html) : "");
        if (!contentText) return res.status(400).json({ ok: false, error: "Reply is empty." });
        if (contentText.length > 8000) return res.status(400).json({ ok: false, error: "Reply too long." });

        // ✅ write to EmailThread/{threadId}/messages so ParticipantEmails.jsx sees it
        const msgRef = db
            .collection("EmailThread")
            .doc(ctx.threadId)
            .collection("messages")
            .doc();

        await msgRef.set({
            direction: "INBOUND",
            from_email: email || null,
            from_name: name || null,
            to_email: null,
            subject: ctx.thread.subject || "Reply",
            html: html || null,
            text: text || (html ? stripHtmlToText(html) : null),
            meta: {
                source: "publicReply",
                ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null,
                userAgent: String(req.headers["user-agent"] || "") || null
            },
            created_at: FieldValue.serverTimestamp(),
        });

        // bump thread timestamps
        await db.collection("EmailThread").doc(ctx.threadId).set(
            {
                updated_at: FieldValue.serverTimestamp(),
                last_message_at: FieldValue.serverTimestamp(),
                last_direction: "INBOUND",
            },
            { merge: true }
        );

        // Notify sender + watchers (in-platform)
        const notifyUids = [];
        if (ctx.thread.created_by_user_id) notifyUids.push(ctx.thread.created_by_user_id);
        if (Array.isArray(ctx.thread.watchers)) notifyUids.push(...ctx.thread.watchers);

        const uniq = Array.from(new Set(notifyUids.filter(Boolean)));

        for (const uid of uniq) {
            await db.collection("Notification").add({
                user_id: uid,
                type: "email_reply",
                notification_type: "email_reply",
                title: "New email reply",
                message: `A reply was received${name ? ` from ${name}` : ""}.`,
                link_url: ctx.thread.context_type === "PARTICIPANT"
                    ? `/Participants?id=${ctx.thread.context_id || ""}`
                    : ctx.thread.context_type === "PROGRAM"
                        ? `/ProgramDetail?id=${ctx.thread.context_id || ""}`
                        : "/",
                created_at: FieldValue.serverTimestamp(),
                is_read: false,
                thread_id: ctx.threadId,
                participant_id: ctx.thread.participant_id || null,
            });
        }

        return res.json({ ok: true, threadId: ctx.threadId, messageId: msgRef.id });
    } catch (e) {
        logger.error("publicReplyPost failed", e);
        return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
});
