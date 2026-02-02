"use strict";

/* eslint-env node */
/* eslint-disable no-undef */

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const _logger = require("firebase-functions/logger");
const logger = _logger; // ✅ SECTION 1.1 — Fix logger being undefined
const OpenAI = require("openai");
const { defineSecret } = require("firebase-functions/params");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");

const { PDFDocument, StandardFonts } = require("pdf-lib");

const { computeFilledData } = require("./pdf/mapping");
const { renderPdfWithSchema } = require("./pdf/render");
// eslint-disable-next-line no-unused-vars
const { buildDocumentRecord } = require("./pdf/documents");
const { migratePdfFormsCore } = require("./pdf/migrate");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();
const storage = getStorage();
const messaging = getMessaging();

const REGION = "australia-southeast1";
const DIGEST_TZ = "Australia/Brisbane";
const emailThreads = require("./emailThreads");
const publicReply = require("./publicReply");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const { rtoCreateCampaignLink } = require("./rtoCreateCampaignLink");
exports.rtoCreateCampaignLink = rtoCreateCampaignLink;

// ==============================
// EMAIL (Postmark) — outbound delivery
// ==============================
const POSTMARK_SERVER_TOKEN = defineSecret("POSTMARK_SERVER_TOKEN");
const MAIL_SENDER = defineSecret("MAIL_SENDER"); // verified sender, e.g. admin@impact-central.com.au
const MAIL_REPLY_TO = defineSecret("MAIL_REPLY_TO"); // default reply-to, e.g. support@impact-central.com.au

// ✅ EMAIL THREADS + PUBLIC REPLY EXPORTS (ADDED)
exports.sendParticipantEmail = emailThreads.sendParticipantEmail;
exports.sendProgramEmail = emailThreads.sendProgramEmail;
exports.publicReplyGet = publicReply.publicReplyGet;
exports.publicReplyPost = publicReply.publicReplyPost;

function normalizeToArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.map((x) => String(x || "").trim()).filter(Boolean);
    return [String(v).trim()].filter(Boolean);
}
// functions/index.js (near the declarations)
void computeFilledData;
void renderPdfWithSchema;
void migratePdfFormsCore;
void crypto;
void storage;

function stripHtmlToText(html) {
    return String(html || "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<\/(p|div|br|li|tr|h\d)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function buildImpactCentralSignatureHtml() {
    const logoUrl =
        "https://firebasestorage.googleapis.com/v0/b/impact-flow-jpc.firebasestorage.app/o/logo-2.png?alt=media&token=be4ccc72-66dc-4911-b934-78cac05f4d21";

    // NOTE: For true crispness, upload a higher-res logo and keep display width ~260-300px.
    const displayWidth = 200;

    return `
  <table align="left" cellpadding="0" cellspacing="0" role="presentation"
    style="margin:18px 0 0 0; width:100%; max-width:680px;">
    <tr>
      <td align="left" style="padding:0;">
        <table cellpadding="0" cellspacing="0" role="presentation"
          style="width:100%; font-family: Arial, sans-serif; text-align:left;">
          <tr>
            <td style="padding-right:16px; vertical-align:top; width:${displayWidth}px;">
              <img
                src="${logoUrl}"
                alt="Impact Central Logo"
                width="${displayWidth}"
                style="display:block; width:${displayWidth}px; height:auto; border-radius:4px; border:0; outline:none; text-decoration:none;"
              />
            </td>

            <td style="vertical-align:top;">
              <div style="font-size:15px; font-weight:700; color:#111111; line-height:1.3;">
                Impact Central — Admin Team
              </div>

              <div style="font-size:12px; color:#51545E; margin:6px 0 10px 0; line-height:1.35;">
                Where change begins, and impact ripples through generations.
                Creating lasting outcomes for individuals, families, and communities through opportunity, accountability, and connection
              </div>

              <div style="font-size:13px; color:#51545E; line-height:1.35;">
                <strong>Admin:</strong>
                <a href="mailto:admin@impact-central.com.au" style="color:#3869D4; text-decoration:none;">
                  admin@impact-central.com.au
                </a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  `;
}

function extractEmailAddress(input) {
    if (!input) return "";

    // If stored as object like { emailAddress: { address: "x@y.com" } }
    if (typeof input === "object") {
        const addr = input?.emailAddress?.address || input?.address || "";
        return String(addr || "").trim();
    }

    let s = String(input).trim();

    // Handle "Name <email@domain.com>"
    const m = s.match(/<([^>]+)>/);
    if (m?.[1]) s = m[1].trim();

    return s;
}

function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

async function sendPostmarkMail({ from, to, subject, html, text, replyTo }) {
    const token = String(POSTMARK_SERVER_TOKEN.value() || "").trim();
    if (!token) throw new Error("POSTMARK_SERVER_TOKEN secret not set.");

    const toList = normalizeToArray(to)
        .map((addr) => String(addr).trim())
        .filter((addr) => isValidEmail(addr));

    if (!toList.length) throw new Error("No valid recipients.");

    const fromAddr = String(from || "").trim();
    if (!fromAddr) throw new Error("Missing From address.");

    const subjectStr = String(subject || "Impact Central");
    const htmlStr = html ? String(html) : null;
    const replyToEmail = extractEmailAddress(replyTo);
    const replyToClean = isValidEmail(replyToEmail) ? replyToEmail : "";
    const htmlWithSignature = htmlStr ? `${htmlStr}\n${buildImpactCentralSignatureHtml()}` : null;

    const textStr = text
        ? String(text)
        : htmlWithSignature
            ? stripHtmlToText(htmlWithSignature)
            : "";

    const payload = {
        From: fromAddr,
        To: toList.join(","),
        Subject: subjectStr,
        ...(htmlWithSignature ? { HtmlBody: htmlWithSignature } : {}),
        ...(textStr ? { TextBody: textStr } : {}),
        ...(replyToClean ? { ReplyTo: replyToClean } : {}),
        ...(process.env.POSTMARK_MESSAGE_STREAM
            ? { MessageStream: String(process.env.POSTMARK_MESSAGE_STREAM) }
            : {}),
    };

    const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": token,
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Postmark send failed (${res.status}): ${t}`);
    }

    return { ok: true };
}

function normalizeEmailList(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input.map((x) => String(x || "").trim()).filter(Boolean);

    return String(input)
        .split(/[;,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
}

/**
 * Enqueue email to Firestore "mail" collection.
 * IMPORTANT: Do NOT set `from` here. deliverMailQueue always uses MAIL_SENDER secret.
 * `replyTo` is optional. If omitted/invalid, deliverMailQueue uses MAIL_REPLY_TO secret.
 */
async function enqueueMail({ to, subject, html, text, replyTo, meta, type }) {
    const recipients = normalizeEmailList(to);
    if (!recipients.length) return { ok: false, reason: "no_recipients" };

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

function formatDateKeyBrisbane(d = new Date()) {
    // Brisbane is UTC+10 (no DST)
    const offsetMinutes = 10 * 60;
    const ms = d.getTime() + offsetMinutes * 60 * 1000;
    const bne = new Date(ms);
    const y = bne.getUTCFullYear();
    const m = String(bne.getUTCMonth() + 1).padStart(2, "0");
    const day = String(bne.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}


function addDaysToDateKey(dateKey, days) {
    const [y, m, d] = String(dateKey).split("-").map((x) => Number(x));
    const baseUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
    const plusUtc = baseUtc + Number(days) * 24 * 60 * 60 * 1000;
    const dt = new Date(plusUtc);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}

function isCompletedStatus(v) {
    const s = String(v || "").toLowerCase();
    return ["done", "completed", "complete", "closed", "cancelled", "canceled"].includes(s);
}

// -------------------- AI helpers (unchanged) --------------------

function asJsonSchemaFormat(responseJsonSchema) {
    if (!responseJsonSchema || typeof responseJsonSchema !== "object") return null;
    return {
        type: "json_schema",
        name: "lsir_report",
        strict: true,
        schema: responseJsonSchema,
    };
}

// -------------------- FCM PUSH HELPERS --------------------

function isDeadTokenError(code) {
    return (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
    );
}

async function getUserFcmTokens(uid) {
    const snap = await db.collection("User").doc(uid).collection("fcmTokens").get();
    return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((t) => !!t.token && t.disabled !== true);
}
async function sendPushToUser({ uid, title, body, data }) {
    if (!uid) return { ok: false, reason: "no_uid" };

    // Optional: respect your existing toggle field
    const userSnap = await db.collection("User").doc(uid).get();
    const userProfile = userSnap.exists ? userSnap.data() : null;
    if (userProfile && userProfile.browser_notifications_enabled === false) {
        return { ok: true, sent: 0, reason: "disabled" };
    }

    const tokens = await getUserFcmTokens(uid);
    if (!tokens.length) return { ok: true, sent: 0, reason: "no_tokens" };

    const tokenStrings = tokens.map((t) => t.token);

    const result = await messaging.sendEachForMulticast({
        tokens: tokenStrings,
        notification: {
            title: String(title || "ImpactCentral"),
            body: String(body || ""),
        },
        data:
            data && typeof data === "object"
                ? Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v)]))
                : {},
    });

    // cleanup invalid tokens
    const batch = db.batch();
    result.responses.forEach((r, i) => {
        if (!r.success && isDeadTokenError(r.error?.code)) {
            const ref = db.collection("User").doc(uid).collection("fcmTokens").doc(tokens[i].id);
            batch.delete(ref);
        }
    });
    await batch.commit();

    return { ok: true, sent: result.successCount, failed: result.failureCount };
}

// Push whenever a Notification doc is created
exports.onNotificationCreatedPush = onDocumentWritten(
    {
        document: "Notification/{id}",
        region: REGION,
    },
    async (event) => {
        const before = event.data?.before?.data?.() || null;
        const after = event.data?.after?.data?.() || null;

        // only on create
        if (before || !after) return;

        const uid = after.user_id || after.userId || after.recipient_id || null;
        if (!uid) return;

        const title = after.title || "Notification";
        const body = after.message || after.body || after.description || "";

        const data = {
            link_url: String(after.link_url || "/"),
            type: String(after.type || after.notification_type || "notification"),
        };

        try {
            await sendPushToUser({ uid, title, body, data });

            // mark we pushed (prevents double pushes if doc re-written)
            await db.collection("Notification").doc(event.params.id).set(
                { pushed_at: FieldValue.serverTimestamp() },
                { merge: true }
            );
        } catch (e) {
            logger.warn("Push send failed", e);
        }
    }
);

// -------------------- AI (HTTP onRequest) --------------------
exports.ai = onRequest(
    { region: REGION, cors: true, secrets: [OPENAI_API_KEY] },
    async (req, res) => {
        try {
            if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

            const apiKey = OPENAI_API_KEY.value(); // ✅ secret value at runtime
            if (!apiKey || !apiKey.startsWith("sk-")) {
                return res.status(500).json({
                    error: "OpenAI API key missing or invalid. Set OPENAI_API_KEY secret in Firebase Functions.",
                });
            }

            const body = req.body || {};
            const prompt = body.prompt || body.input || "";
            const model =
                typeof body.model === "string" && body.model.trim() ? body.model.trim() : "gpt-4.1-mini";
            const responseJsonSchema = body.response_json_schema || null;

            if (!prompt || typeof prompt !== "string") {
                return res.status(400).json({ error: "Missing prompt (string) in request body" });
            }

            const client = new OpenAI({ apiKey });
            const textFormat = asJsonSchemaFormat(responseJsonSchema);

            const createArgs = {
                model,
                input: prompt,
                ...(textFormat ? { text: { format: textFormat } } : {}),
            };

            const response = await client.responses.create(createArgs);
            const outputText = response.output_text || "";

            if (textFormat) {
                try {
                    return res.json(JSON.parse(outputText));
                } catch (err) {
                    logger.warn("AI returned invalid JSON despite schema", { outputText });
                    return res.status(502).json({
                        error: "AI returned invalid JSON despite schema.",
                        raw_text: outputText,
                    });
                }
            }

            return res.json({ text: outputText });
        } catch (e) {
            logger.error("AI function failed", e);
            const status = e?.status || e?.response?.status || 500;
            const message = e?.message || e?.response?.data?.error?.message || "AI request failed";
            return res.status(status).json({ error: message });
        }
    }
);

// -------------------- Daily Digest (Callable + Scheduled) --------------------

function assertRoleAllowed(role) {
    return ["SystemAdmin", "Manager", "ContractsAdmin"].includes(role);
}

async function getUserProfile(uid) {
    const snap = await db.collection("User").doc(uid).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ==============================
// BUSINESS UNIT INVITES (Auth user + Postmark via mail queue)
// ==============================

const ROLE_ORDER = ["SystemAdmin", "GeneralManager", "Manager", "ContractManager", "User"];
function roleRank(role) {
    const idx = ROLE_ORDER.indexOf(String(role || ""));
    return idx === -1 ? 999 : idx;
}
function isBelowRole(targetRole, myRole) {
    return roleRank(targetRole) > roleRank(myRole);
}

function getEntityRoleFromUserDoc(userDoc, entityId) {
    if (!userDoc) return "User";
    if (String(userDoc.app_role || "") === "SystemAdmin") return "SystemAdmin";
    const scoped = userDoc?.entity_access?.[entityId]?.role;
    return scoped || userDoc.app_role || "User";
}

function hasEntityAccessFromUserDoc(userDoc, entityId) {
    if (!userDoc) return false;
    if (String(userDoc.app_role || "") === "SystemAdmin") return true;
    return userDoc?.entity_access?.[entityId]?.active === true;
}

function buildInviteEmailHtml({ entityName, resetLink }) {
    const safeEntity = String(entityName || "Business Unit");
    const link = String(resetLink || "");
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.45">
        <h2 style="margin:0 0 10px 0;">You’ve been invited to ${safeEntity}</h2>
        <p style="margin:0 0 12px 0;">
          Click the button below to set your password and sign in:
        </p>
        <p style="margin:0 0 18px 0;">
          <a href="${link}"
             style="display:inline-block;padding:10px 16px;background:#2563eb;color:white;border-radius:10px;text-decoration:none;">
            Set password
          </a>
        </p>
        <p style="color:#64748b;font-size:12px;margin:0;">
          If you didn’t expect this invite, you can ignore this email.
        </p>
      </div>
    `;
}

async function ensureAuthUserByEmail(email) {
    const authAdmin = getAuth();
    try {
        const existing = await authAdmin.getUserByEmail(email);
        return existing;
    } catch (e) {
        // create if not found
        const created = await authAdmin.createUser({
            email,
            emailVerified: false,
            disabled: false,
        });
        return created;
    }
}

function getAppPublicUrlFallback() {
    return (
        process.env.APP_PUBLIC_URL ||
        process.env.STAFF_BASE_URL ||
        process.env.PUBLIC_BASE_URL ||
        "http://localhost:5173/Landing"
    );
}

// ✅ SECTION 1.2 — Add entity member upsert helper (after invite helpers)
async function upsertEntityMember({ entityId, entityName, userId, email, role, active = true }) {
    if (!entityId || !userId) return;

    const memberId = `${entityId}_${userId}`;
    await db.collection("entityMembers").doc(memberId).set(
        {
            entity_id: String(entityId),
            entity_name: String(entityName || "Business Unit"),
            user_id: String(userId),
            email: String(email || "").trim().toLowerCase(),
            role: String(role || "User"),
            active: active === true,
            updated_at: FieldValue.serverTimestamp(),
            created_at: FieldValue.serverTimestamp(), // merge keeps original
        },
        { merge: true }
    );
}

async function getActiveManagerRecipients() {
    const snap = await db.collection("User").where("is_active", "==", true).get();
    return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => !!u.email)
        .filter((u) => u.app_role === "Manager" || u.app_role === "SystemAdmin");
}
// Digest stats (ActivityLog + due tasks + approvals + DEX)
async function computeDigestStatsForToday() {
    const offsetMinutes = 10 * 60; // Brisbane UTC+10
    const offsetMs = offsetMinutes * 60 * 1000;

    const nowUtc = Date.now();
    const nowBrisbane = new Date(nowUtc + offsetMs);

    const startBrisbaneUtcMs = Date.UTC(
        nowBrisbane.getUTCFullYear(),
        nowBrisbane.getUTCMonth(),
        nowBrisbane.getUTCDate(),
        0,
        0,
        0,
        0
    );

    const startUtcMs = startBrisbaneUtcMs - offsetMs;
    const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

    const start = new Date(startUtcMs);
    const end = new Date(endUtcMs);

    const activitySnap = await db
        .collection("ActivityLog")
        .where("createdAt", ">=", start)
        .where("createdAt", "<", end)
        .get();

    const byUser = new Map();
    const byType = new Map();

    activitySnap.docs.forEach((d) => {
        const a = d.data() || {};
        const userKey = a.actor_name || a.actor_email || a.actor_user_id || "Unknown";
        const typeKey = a.activity_type || `${a.collection || "Unknown"}.${a.action || "write"}`;
        byUser.set(userKey, (byUser.get(userKey) || 0) + 1);
        byType.set(typeKey, (byType.get(typeKey) || 0) + 1);
    });

    const totalsByUser = Array.from(byUser.entries())
        .map(([user, count]) => ({ user, count }))
        .sort((a, b) => b.count - a.count);

    const totalsByType = Array.from(byType.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

    const todayKey = formatDateKeyBrisbane();
    const dueKey = addDaysToDateKey(todayKey, 3);

    // Tasks due within 3 days (Task.due_date is YYYY-MM-DD string)
    const dueSnap = await db
        .collection("Task")
        .where("due_date", ">=", todayKey)
        .where("due_date", "<=", dueKey)
        .get();

    const dueTasks = dueSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((t) => !isCompletedStatus(t.status || t.task_status));

    // Outstanding approvals
    const pendingStatuses = ["Pending", "SubmittedForManagerApproval"];
    const approvalsSnap = await db.collection("WorkflowRequest").where("status", "in", pendingStatuses).get();
    const pendingApprovals = approvalsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

    // DEX activity today
    const dexSnap = await db.collection("DEXActivityRecord").where("activity_date", "==", todayKey).get();
    const dexRecords = dexSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

    return { todayKey, dueKey, totalsByUser, totalsByType, dueTasks, pendingApprovals, dexRecords };
}

function buildDigestHtml({ dateLabel, stats }) {
    const row = (cells) =>
        `<tr>${cells
            .map(
                (c) =>
                    `<td style="padding:10px;border-top:1px solid #1f2937;color:#e5e7eb;font-size:13px;vertical-align:top;">${c}</td>`
            )
            .join("")}</tr>`;

    const table = (headers, rowsHtml) => `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #1f2937;border-radius:12px;overflow:hidden;background:#0b1220;">
      <tr>
        ${headers
            .map(
                (h) =>
                    `<th align="left" style="padding:10px;background:#0f172a;color:#94a3b8;font-weight:600;font-size:12px;border-bottom:1px solid #1f2937;">${h}</th>`
            )
            .join("")}
      </tr>
      ${rowsHtml}
    </table>
  `;

    const userRows = stats.totalsByUser.length
        ? stats.totalsByUser.map((u) => row([String(u.user), String(u.count || 0)])).join("")
        : row(["No activity", "0"]);

    const typeRows = stats.totalsByType.length
        ? stats.totalsByType.map((t) => row([String(t.type), String(t.count || 0)])).join("")
        : row(["No activity", "0"]);

    const dueRows = stats.dueTasks.length
        ? stats.dueTasks
            .slice(0, 50)
            .map((t) =>
                row([
                    String(t.description || t.title || "Task"),
                    String(t.assigned_to_name || t.assigned_to_id || ""),
                    String(t.due_date || ""),
                ])
            )
            .join("")
        : row([`No tasks due by ${stats.dueKey}`, "", ""]);

    const approvalRows = stats.pendingApprovals.length
        ? stats.pendingApprovals
            .slice(0, 50)
            .map((w) =>
                row([
                    String(w.request_type || "WorkflowRequest"),
                    String(w.created_by_name || w.created_by_email || ""),
                    String(w.status || ""),
                    String(w.created_date || w.created_at || ""),
                ])
            )
            .join("")
        : row(["No pending approvals", "", "", ""]);

    const dexRows = stats.dexRecords.length
        ? stats.dexRecords
            .slice(0, 50)
            .map((r) =>
                row([
                    String(r.activity_type || ""),
                    String(r.created_by_name || r.created_by_email || ""),
                    String(r.participant_id || ""),
                    String(r.activity_date || ""),
                ])
            )
            .join("")
        : row(["No DEX activity logged today", "", "", stats.todayKey]);

    return `
  <div style="font-family:Inter,Arial,sans-serif;background:#0b1220;padding:24px;">
    <div style="max-width:900px;margin:0 auto;">
      <div style="padding:18px;border:1px solid #1f2937;border-radius:16px;background:#0f172a;">
        <div style="color:#e5e7eb;font-size:18px;font-weight:700;">Impact Central - Daily Digest</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:4px;">${dateLabel}</div>
      </div>

      <div style="height:14px"></div>

      <div style="color:#e5e7eb;font-size:14px;font-weight:700;margin:6px 0 8px;">Activity by user</div>
      ${table(["User", "Actions"], userRows)}

      <div style="height:14px"></div>

      <div style="color:#e5e7eb;font-size:14px;font-weight:700;margin:6px 0 8px;">Activity by type</div>
      ${table(["Type", "Count"], typeRows)}

      <div style="height:14px"></div>

      <div style="color:#e5e7eb;font-size:14px;font-weight:700;margin:6px 0 8px;">Tasks due within 3 days</div>
      ${table(["Task", "Assigned to", "Due"], dueRows)}

      <div style="height:14px"></div>

      <div style="color:#e5e7eb;font-size:14px;font-weight:700;margin:6px 0 8px;">Outstanding approvals</div>
      ${table(["Type", "Created by", "Status", "Created"], approvalRows)}

      <div style="height:14px"></div>

      <div style="color:#e5e7eb;font-size:14px;font-weight:700;margin:6px 0 8px;">DEX activity (today)</div>
      ${table(["Activity", "Created by", "Participant", "Date"], dexRows)}

      <div style="height:18px"></div>
      <div style="color:#64748b;font-size:12px;">This is an automated message from Impact Central.</div>
    </div>
  </div>`;
}

async function runDigestSend({ invokedBy }) {
    const recipients = await getActiveManagerRecipients();
    const stats = await computeDigestStatsForToday();

    const subject = "Impact Central - Daily Digest";
    const dateLabel = `Today (${stats.todayKey})`;
    const html = buildDigestHtml({ dateLabel, stats });

    // EMAIL: route through enqueueMail so From/Reply-To are always set
    for (const u of recipients) {
        await enqueueMail({
            to: u.email,
            subject,
            html,
            type: "dailyDigest",
            meta: { invokedBy: invokedBy || "system", dateKey: stats.todayKey },
        });
    }

    await db.collection("SystemLog").add({
        type: "dailyDigest",
        invokedBy: invokedBy || "system",
        recipients: recipients.length,
        createdAt: FieldValue.serverTimestamp(),
    });

    return { emailsSent: recipients.length };
}

// ==============================
// Callable: submitUserInvite
// - SystemAdmin / GeneralManager: creates Auth user, writes User doc, sends invite email via enqueueMail
// - Manager: creates a request for General Manager approval (no email yet)
// ==============================
exports.submitUserInvite = onCall({ region: REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required.");

    const data = req.data || {};
    const email = String(data.email || "").trim().toLowerCase();
    const entityId = String(data.entityId || "").trim();
    const role = String(data.role || "").trim();

    if (!email || !isValidEmail(email)) throw new HttpsError("invalid-argument", "Valid email is required.");
    if (!entityId) throw new HttpsError("invalid-argument", "entityId is required.");
    if (!role) throw new HttpsError("invalid-argument", "role is required.");

    const caller = await getUserProfile(uid);
    if (!caller) throw new HttpsError("permission-denied", "User profile not found.");

    // must have access to this entity (or SystemAdmin)
    if (!hasEntityAccessFromUserDoc(caller, entityId)) {
        throw new HttpsError("permission-denied", "No access to this business unit.");
    }

    const myRole = getEntityRoleFromUserDoc(caller, entityId);

    // Load entity for name/type
    const entSnap = await db.collection("businessEntities").doc(entityId).get();
    if (!entSnap.exists) throw new HttpsError("not-found", "Business entity not found.");
    const ent = entSnap.data() || {};
    const entityName = ent.name || "Business Unit";
    const entityType = ent.type || "";

    // Manager -> request approval only
    if (myRole === "Manager") {
        // Managers can only request roles below Manager
        if (!isBelowRole(role, "Manager")) {
            throw new HttpsError("permission-denied", "Managers can only request roles below Manager.");
        }

        const ref = await db.collection("userInviteRequests").add({
            email,
            entity_id: entityId,
            role,
            status: "Pending", // Pending | Approved | Rejected
            requested_by_uid: uid,
            requested_by_name: caller.full_name || caller.display_name || caller.email || "Unknown",
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp(),
        });

        return { ok: true, mode: "requested", requestId: ref.id };
    }

    // Only SystemAdmin or GeneralManager can send actual invites
    if (!(myRole === "SystemAdmin" || myRole === "GeneralManager")) {
        throw new HttpsError("permission-denied", "You cannot invite users.");
    }

    // GeneralManager cannot assign same-or-higher roles
    if (myRole === "GeneralManager" && !isBelowRole(role, "GeneralManager")) {
        throw new HttpsError(
            "permission-denied",
            "General Managers can only assign roles below GeneralManager."
        );
    }

    // Create/reuse Auth user
    const userRecord = await ensureAuthUserByEmail(email);
    const targetUid = userRecord.uid;

    // Generate password reset link
    const authAdmin = getAuth();
    const resetLink = await authAdmin.generatePasswordResetLink(email, {
        url: getAppPublicUrlFallback(),
        handleCodeInApp: false,
    });

    // Write Firestore User doc (merge)
    const nowIso = new Date().toISOString();
    await db.collection("User").doc(targetUid).set(
        {
            email,
            status: "Active",
            is_active: true,
            app_role: "User", // legacy fallback (entity-scoped is authoritative)
            last_active_entity_id: entityId,
            last_login: nowIso,
            created_at: nowIso,
            [`entity_access.${entityId}`]: {
                active: true,
                role,
                added_by_uid: uid,
                added_at: FieldValue.serverTimestamp(),
            },
        },
        { merge: true }
    );

    // ✅ SECTION 2 — Maintain queryable unit membership list
    await upsertEntityMember({
        entityId,
        entityName,
        userId: targetUid,
        email,
        role,
        active: true,
    });

    // Record invite
    const inviteRef = await db.collection("userInvites").add({
        email,
        entity_id: entityId,
        entity_name: entityName,
        entity_type: entityType,
        role,
        status: "sent",
        created_at: FieldValue.serverTimestamp(),
        invited_by_uid: uid,
        invited_by_name: caller.full_name || caller.display_name || caller.email || "Unknown",
        auth_uid: targetUid,
    });

    // Send email via your queue (Postmark delivered by deliverMailQueue)
    const html = buildInviteEmailHtml({ entityName, resetLink });
    await enqueueMail({
        to: email,
        subject: `You’ve been invited to ${entityName}`,
        html,
        text: `You’ve been invited to ${entityName}. Set password: ${resetLink}`,
        type: "userInvite",
        meta: { entityId, role, inviteId: inviteRef.id },
    });

    return { ok: true, mode: "sent", inviteId: inviteRef.id };
});

// ==============================
// Callable: approveUserInviteRequest
// - GeneralManager/SystemAdmin approves Manager request -> creates Auth user + sends invite email
// ==============================
exports.approveUserInviteRequest = onCall({ region: REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required.");

    const requestId = String(req.data?.requestId || "").trim();
    if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");

    const caller = await getUserProfile(uid);
    if (!caller) throw new HttpsError("permission-denied", "User profile not found.");

    const reqSnap = await db.collection("userInviteRequests").doc(requestId).get();
    if (!reqSnap.exists) throw new HttpsError("not-found", "Invite request not found.");

    const inviteReq = reqSnap.data() || {};
    if (inviteReq.status !== "Pending") {
        throw new HttpsError("failed-precondition", "Request is not pending.");
    }

    const email = String(inviteReq.email || "").trim().toLowerCase();
    const entityId = String(inviteReq.entity_id || "").trim();
    const role = String(inviteReq.role || "").trim();

    if (!email || !isValidEmail(email)) throw new HttpsError("invalid-argument", "Invalid email on request.");
    if (!entityId) throw new HttpsError("invalid-argument", "Invalid entity on request.");
    if (!role) throw new HttpsError("invalid-argument", "Invalid role on request.");

    if (!hasEntityAccessFromUserDoc(caller, entityId)) {
        throw new HttpsError("permission-denied", "No access to this business unit.");
    }

    const myRole = getEntityRoleFromUserDoc(caller, entityId);
    if (!(myRole === "SystemAdmin" || myRole === "GeneralManager")) {
        throw new HttpsError("permission-denied", "Only SystemAdmin or GeneralManager can approve requests.");
    }

    // GeneralManager cannot approve same-or-higher
    if (myRole === "GeneralManager" && !isBelowRole(role, "GeneralManager")) {
        throw new HttpsError(
            "permission-denied",
            "General Managers can only assign roles below GeneralManager."
        );
    }

    // Load entity
    const entSnap = await db.collection("businessEntities").doc(entityId).get();
    if (!entSnap.exists) throw new HttpsError("not-found", "Business entity not found.");
    const ent = entSnap.data() || {};
    const entityName = ent.name || "Business Unit";
    const entityType = ent.type || "";

    // Create/reuse Auth user
    const userRecord = await ensureAuthUserByEmail(email);
    const targetUid = userRecord.uid;

    // Reset link
    const authAdmin = getAuth();
    const resetLink = await authAdmin.generatePasswordResetLink(email, {
        url: getAppPublicUrlFallback(),
        handleCodeInApp: false,
    });

    // Write/merge Firestore user doc
    const nowIso = new Date().toISOString();
    await db.collection("User").doc(targetUid).set(
        {
            email,
            status: "Active",
            is_active: true,
            app_role: "User",
            last_active_entity_id: entityId,
            last_login: nowIso,
            created_at: nowIso,
            [`entity_access.${entityId}`]: {
                active: true,
                role,
                added_by_uid: uid,
                added_at: FieldValue.serverTimestamp(),
            },
        },
        { merge: true }
    );

    // ✅ SECTION 3 — Maintain queryable unit membership list
    await upsertEntityMember({
        entityId,
        entityName,
        userId: targetUid,
        email,
        role,
        active: true,
    });

    // Mark request approved
    await db.collection("userInviteRequests").doc(requestId).set(
        {
            status: "Approved",
            approved_by_uid: uid,
            approved_by_name: caller.full_name || caller.display_name || caller.email || "Unknown",
            updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    // Record invite
    const inviteRef = await db.collection("userInvites").add({
        email,
        entity_id: entityId,
        entity_name: entityName,
        entity_type: entityType,
        role,
        status: "sent",
        created_at: FieldValue.serverTimestamp(),
        invited_by_uid: uid,
        invited_by_name: caller.full_name || caller.display_name || caller.email || "Unknown",
        auth_uid: targetUid,
        source_request_id: requestId,
    });

    // Send email via queue
    const html = buildInviteEmailHtml({ entityName, resetLink });
    await enqueueMail({
        to: email,
        subject: `You’ve been invited to ${entityName}`,
        html,
        text: `You’ve been invited to ${entityName}. Set password: ${resetLink}`,
        type: "userInvite",
        meta: { entityId, role, inviteId: inviteRef.id, sourceRequestId: requestId },
    });

    return { ok: true, mode: "sent", inviteId: inviteRef.id };
});

// ==============================
// Callable: addExistingUserToEntity
// - SystemAdmin / GeneralManager only
// - Adds an already-existing Firebase Auth user (by email) into a business unit
// - Writes User.entity_access + entityMembers
// ==============================
exports.addExistingUserToEntity = onCall({ region: REGION }, async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login required.");

    const data = req.data || {};
    const email = String(data.email || "").trim().toLowerCase();
    const entityId = String(data.entityId || "").trim();
    const role = String(data.role || "").trim();
    const notify = data.notify === true;

    if (!email || !isValidEmail(email)) throw new HttpsError("invalid-argument", "Valid email is required.");
    if (!entityId) throw new HttpsError("invalid-argument", "entityId is required.");
    if (!role) throw new HttpsError("invalid-argument", "role is required.");

    const caller = await getUserProfile(callerUid);
    if (!caller) throw new HttpsError("permission-denied", "User profile not found.");

    // must have access to this entity (or SystemAdmin)
    if (!hasEntityAccessFromUserDoc(caller, entityId)) {
        throw new HttpsError("permission-denied", "No access to this business unit.");
    }

    const myRole = getEntityRoleFromUserDoc(caller, entityId);

    // Only SystemAdmin or GeneralManager can directly add existing users
    if (!(myRole === "SystemAdmin" || myRole === "GeneralManager")) {
        throw new HttpsError("permission-denied", "Only SystemAdmin or GeneralManager can add existing users.");
    }

    // GeneralManager cannot assign same-or-higher roles
    if (myRole === "GeneralManager" && !isBelowRole(role, "GeneralManager")) {
        throw new HttpsError("permission-denied", "General Managers can only assign roles below GeneralManager.");
    }

    // Load entity for name/type
    const entSnap = await db.collection("businessEntities").doc(entityId).get();
    if (!entSnap.exists) throw new HttpsError("not-found", "Business entity not found.");
    const ent = entSnap.data() || {};
    const entityName = ent.name || "Business Unit";

    // Find existing Auth user
    const authAdmin = getAuth();
    let userRecord;
    try {
        userRecord = await authAdmin.getUserByEmail(email);
    } catch (e) {
        throw new HttpsError("not-found", "No Firebase Auth user exists for that email.");
    }

    const targetUid = userRecord.uid;
    const nowIso = new Date().toISOString();

    // Write Firestore User doc (merge)
    await db.collection("User").doc(targetUid).set(
        {
            email,
            status: "Active",
            is_active: true,
            app_role: "User", // legacy fallback; entity-scoped role is authoritative
            last_active_entity_id: entityId,
            last_login: nowIso,
            created_at: nowIso,
            [`entity_access.${entityId}`]: {
                active: true,
                role,
                added_by_uid: callerUid,
                added_at: FieldValue.serverTimestamp(),
            },
        },
        { merge: true }
    );

    // ✅ Maintain queryable unit membership list
    await upsertEntityMember({
        entityId,
        entityName,
        userId: targetUid,
        email,
        role,
        active: true,
    });

    // Optional notify (FYI email)
    if (notify) {
        await enqueueMail({
            to: email,
            subject: `You’ve been added to ${entityName}`,
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.45">
                <h2 style="margin:0 0 10px 0;">You’ve been added to ${String(entityName)}</h2>
                <p style="margin:0 0 10px 0;">
                  You now have access to this business unit in Impact Central.
                </p>
                <p style="margin:0;color:#64748b;font-size:12px;">
                  If you didn’t expect this, please contact your administrator.
                </p>
              </div>
            `,
            text: `You’ve been added to ${entityName} in Impact Central.`,
            type: "entityMembershipNotice",
            meta: { entityId, role, addedBy: callerUid },
        });
    }

    return { ok: true, userId: targetUid };
});

exports.dailyDigest = onCall({ region: REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required.");

    const caller = await getUserProfile(uid);
    if (!caller) throw new HttpsError("permission-denied", "User profile not found.");

    if (!assertRoleAllowed(caller.app_role)) {
        throw new HttpsError("permission-denied", "Not allowed.");
    }

    const details = await runDigestSend({ invokedBy: uid });
    return { ok: true, details };
});

// 5pm Brisbane time
exports.dailyDigestScheduler = onSchedule(
    { region: REGION, schedule: "0 17 * * *", timeZone: DIGEST_TZ },
    async () => {
        await runDigestSend({ invokedBy: "scheduler" });
    }
);
// -------------------- workflowNotifications (Callable) --------------------
exports.workflowNotifications = onCall({ region: REGION }, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required.");

    const caller = await getUserProfile(uid);
    if (!caller) throw new HttpsError("permission-denied", "User profile not found.");

    const data = req.data || {};
    const type = String(data.type || "").trim() || "unknown";
    const requestId = String(data.requestId || "").trim() || null;

    logger.info("workflowNotifications invoked", { type, requestId, by: uid });

    try {
        await db.collection("Notification").add({
            type: "workflow",
            subtype: type,
            title: "Workflow update",
            message:
                type === "status_change"
                    ? `Workflow request updated${requestId ? `: ${requestId}` : ""}.`
                    : `Workflow notification (${type}).`,
            linked_workflow_request_id: requestId,
            created_by_user_id: uid,
            created_by_name: caller.full_name || caller.display_name || caller.email || "Unknown",
            created_date: new Date().toISOString(),
            created_at: FieldValue.serverTimestamp(),
            is_read: false,
        });
    } catch (e) {
        logger.warn("workflowNotifications: failed to write Notification doc", e);
    }

    return { ok: true };
});

// ==============================
// EMAIL: Workflow approval email (instant)
// ==============================

function buildWorkflowRequestEmailHtml(req) {
    const type = req.request_type || "Workflow Request";
    const submittedBy = req.submitted_by_name || req.submitted_by_email || req.submitted_by_id || "Unknown";
    const created = req.created_date || req.created_at || req.createdAt || "";
    let details = "";

    if (req.request_type === "ParticipantRequest") {
        const p = req.participant_data || {};
        const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "(no name)";
        details = `
      <p><b>Participant:</b> ${name}</p>
      <p><b>Preferred Program:</b> ${p.preferred_program || ""}</p>
      <p><b>Referral Source:</b> ${p.referral_source || ""}</p>
    `;
    } else if (req.request_type === "FundingRequest") {
        const f = req.funding_data || {};
        details = `
      <p><b>Amount:</b> $${Number(f.amount || 0).toLocaleString()}</p>
      <p><b>Category:</b> ${f.category || ""}</p>
      <p><b>Supplier:</b> ${f.supplier_name || ""}</p>
      <p><b>Description:</b> ${f.description || ""}</p>
    `;
    }

    return `
    <div style="font-family: Arial, sans-serif; line-height: 1.4">
      <h2>${type} requires your action</h2>
      <p><b>Submitted by:</b> ${submittedBy}</p>
      ${created ? `<p><b>Created:</b> ${created}</p>` : ""}
      ${details}
      <p>Please log into Impact Central to review and action this request.</p>
    </div>
  `;
}

exports.onWorkflowRequestPendingNotify = onDocumentWritten(
    {
        document: "WorkflowRequest/{requestId}",
        region: REGION,
    },
    async (event) => {
        const before = event.data?.before?.data?.() || null;
        const after = event.data?.after?.data?.() || null;

        if (!after) return; // deleted

        const status = after.status;
        const wasStatus = before?.status;

        const isPending = status === "Pending" || status === "SubmittedForManagerApproval";
        const becamePending = isPending && status !== wasStatus;
        const createdPending = !before && isPending;

        if (!becamePending && !createdPending) return;
        if (after.approver_notified_at) return;

        const approverSnap = await db
            .collection("User")
            .where("is_active", "==", true)
            .where("app_role", "in", ["SystemAdmin", "Manager", "ContractsAdmin"])
            .get();

        const approvers = approverSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.email);

        const html = buildWorkflowRequestEmailHtml(after);
        const subject = `Impact Central: ${after.request_type || "Approval"} requires action`;

        const batch = db.batch();

        for (const approver of approvers) {
            const notifRef = db.collection("Notification").doc();
            batch.set(notifRef, {
                user_id: approver.id,
                notification_type: "approval_required",
                type: "approval_required",
                title: subject,
                message: `You have an approval request pending your action.`,
                link_url: "/WorkflowApprovals",
                is_read: false,
                request_id: event.params.requestId,
                created_at: FieldValue.serverTimestamp(),
            });

            // EMAIL: goes through enqueueMail so FROM/Reply-To are set
            await enqueueMail({
                to: approver.email,
                subject,
                html,
                text: `You have an approval request pending your action. Please log into Impact Central to review. Request ID: ${event.params.requestId}`,
                type: "workflowApproval",
                meta: { requestId: event.params.requestId, status: after.status || null },
            });
        }

        batch.set(db.collection("ActivityLog").doc(), {
            activity_type: "approval_required",
            message: `Approval request created: ${event.params.requestId}`,
            actor_id: after.submitted_by_id || null,
            actor_name: after.submitted_by_name || null,
            metadata: { request_type: after.request_type || null },
            createdAt: FieldValue.serverTimestamp(),
        });

        batch.set(
            db.collection("WorkflowRequest").doc(event.params.requestId),
            {
                approver_notified_at: FieldValue.serverTimestamp(),
                approver_notified_count: approvers.length,
            },
            { merge: true }
        );

        await batch.commit();
    }
);

// ==============================
// MAIL THROTTLING (global)
// ==============================
// Safe defaults. You can tune via env vars if you want.
const MAIL_THROTTLE_MS = Number(process.env.MAIL_THROTTLE_MS || 1500); // ~40/min if alone
const MAIL_MAX_PER_MIN = Number(process.env.MAIL_MAX_PER_MIN || 30);   // hard cap per minute
const MAIL_THROTTLE_REF = db.collection("System").doc("mailThrottle");

/**
 * Reserve a global send slot.
 * - Spaces sends by MAIL_THROTTLE_MS
 * - Caps sends per minute at MAIL_MAX_PER_MIN
 * Returns { action: "SEND_NOW" | "DEFER", retryAtMs }
 */
async function reserveMailSendSlot() {
    const now = Date.now();

    return await db.runTransaction(async (tx) => {
        const snap = await tx.get(MAIL_THROTTLE_REF);
        const data = snap.exists ? snap.data() || {} : {};

        let nextAllowedAtMs = Number(data.nextAllowedAtMs || 0);
        let windowStartMs = Number(data.windowStartMs || 0);
        let sentInWindow = Number(data.sentInWindow || 0);

        // reset window if older than 60s
        if (!windowStartMs || now - windowStartMs >= 60 * 1000) {
            windowStartMs = now;
            sentInWindow = 0;
        }

        // minute cap
        if (sentInWindow >= MAIL_MAX_PER_MIN) {
            const retryAtMs = windowStartMs + 60 * 1000;
            return { action: "DEFER", retryAtMs };
        }

        // spacing
        const scheduledAtMs = Math.max(now, nextAllowedAtMs);
        const retryAtMs = scheduledAtMs;

        // Reserve the slot
        tx.set(
            MAIL_THROTTLE_REF,
            {
                nextAllowedAtMs: scheduledAtMs + MAIL_THROTTLE_MS,
                windowStartMs,
                sentInWindow: sentInWindow + 1,
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        if (scheduledAtMs > now) {
            return { action: "DEFER", retryAtMs };
        }

        return { action: "SEND_NOW", retryAtMs };
    });
}

/** Normalize to array for querying */
function NORMALIZE_TO_ARRAY_FOR_QUERY(v) {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
}

// ==============================
// Firestore -> Microsoft Graph mail delivery
// Collection: "mail"
// ==============================
exports.deliverMailQueue = onDocumentWritten(
    {
        document: "mail/{id}",
        region: REGION,
        secrets: [POSTMARK_SERVER_TOKEN, MAIL_SENDER, MAIL_REPLY_TO],
    },
    async (event) => {
        const before = event.data?.before?.data?.() || null;
        const after = event.data?.after?.data?.() || null;

        // Only on create
        if (before || !after) return;

        const mailId = event.params.id;
        const mailRef = db.collection("mail").doc(mailId);

        // Idempotency: if already marked, do nothing
        if (after.delivery?.state || after.sentAt || after.error) return;

        try {
            // Global best-effort throttle (shared across instances)
            const slot = await reserveMailSendSlot();
            if (slot?.action === "DEFER") {
                await mailRef.set(
                    {
                        delivery: {
                            state: "DEFERRED",
                            provider: "postmark",
                            nextAttemptAt: new Date(Number(slot.retryAtMs || Date.now() + 1500)),
                            attempts: FieldValue.increment(1),
                            deferredAt: FieldValue.serverTimestamp(),
                        },
                    },
                    { merge: true }
                );
                return;
            }

            const from = String(MAIL_SENDER.value() || "").trim();
            const replyToDefault = String(MAIL_REPLY_TO.value() || "").trim();

            if (!from) throw new Error("MAIL_SENDER secret not set.");

            const to = after.to;
            const subject = after?.message?.subject || after?.subject || "Impact Central";
            const html = after?.message?.html || null;
            const text = after?.message?.text || null;

            // reply-to: only include if valid, else fallback to secret
            const replyToCandidate = extractEmailAddress(after.replyTo) || extractEmailAddress(replyToDefault);
            const replyToClean = isValidEmail(replyToCandidate) ? replyToCandidate : "";

            await sendPostmarkMail({
                from,
                to,
                subject,
                html,
                text,
                replyTo: replyToClean,
            });

            await mailRef.set(
                {
                    delivery: {
                        state: "SENT",
                        provider: "postmark",
                        sentAt: FieldValue.serverTimestamp(),
                        from,
                        replyTo: replyToClean || null,
                    },
                    sentAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
        } catch (e) {
            logger.error("deliverMailQueue failed", e);

            await mailRef.set(
                {
                    delivery: {
                        state: "ERROR",
                        provider: "postmark",
                        error: String(e?.message || e),
                        failedAt: FieldValue.serverTimestamp(),
                    },
                    error: String(e?.message || e),
                },
                { merge: true }
            );
        }
    }
);

// ==============================
// Deferred mail sender (runs every minute)
// ==============================
exports.mailDeferredSender = onSchedule(
    {
        region: REGION,
        schedule: "every 1 minutes",
        timeZone: DIGEST_TZ,
        secrets: [POSTMARK_SERVER_TOKEN, MAIL_SENDER, MAIL_REPLY_TO],
    },
    async () => {
        const now = new Date();

        // Pick a small batch of deferred mails due now
        const snap = await db
            .collection("mail")
            .where("delivery.state", "==", "DEFERRED")
            .where("delivery.nextAttemptAt", "<=", now)
            .orderBy("delivery.nextAttemptAt", "asc")
            .limit(25)
            .get();

        for (const docSnap of snap.docs) {
            const mailId = docSnap.id;
            const mailRef = docSnap.ref;
            const data = docSnap.data() || {};

            try {
                // Claim the doc (idempotent lock)
                await mailRef.set(
                    {
                        delivery: {
                            state: "SENDING",
                            provider: "postmark",
                            claimedAt: FieldValue.serverTimestamp(),
                        },
                    },
                    { merge: true }
                );

                // Global best-effort throttle
                const slot = await reserveMailSendSlot();
                if (slot?.action === "DEFER") {
                    const nextMs = Number(slot.retryAtMs || (Date.now() + 1500));
                    await mailRef.set(
                        {
                            delivery: {
                                state: "DEFERRED",
                                provider: "postmark",
                                nextAttemptAt: new Date(nextMs),
                                attempts: FieldValue.increment(1),
                            },
                        },
                        { merge: true }
                    );
                    continue;
                }

                const from = String(MAIL_SENDER.value() || "").trim();
                const replyToDefault = String(MAIL_REPLY_TO.value() || "").trim();
                if (!from) throw new Error("MAIL_SENDER secret not set.");

                const to = data.to;
                const subject = data?.message?.subject || data?.subject || "Impact Central";
                const html = data?.message?.html || null;
                const text = data?.message?.text || null;

                const replyToCandidate = extractEmailAddress(data.replyTo) || extractEmailAddress(replyToDefault);
                const replyToClean = isValidEmail(replyToCandidate) ? replyToCandidate : "";

                await sendPostmarkMail({
                    from,
                    to,
                    subject,
                    html,
                    text,
                    replyTo: replyToClean,
                });

                await mailRef.set(
                    {
                        delivery: {
                            state: "SENT",
                            provider: "postmark",
                            sentAt: FieldValue.serverTimestamp(),
                            from,
                            replyTo: replyToClean || null,
                        },
                        sentAt: FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
            } catch (e) {
                logger.error("mailDeferredSender failed", { mailId, err: e });

                const nextMs = Date.now() + 60000; // retry in 60s
                await mailRef.set(
                    {
                        delivery: {
                            state: "DEFERRED",
                            provider: "postmark",
                            error: String(e?.message || e),
                            nextAttemptAt: new Date(nextMs),
                            attempts: FieldValue.increment(1),
                        },
                        error: String(e?.message || e),
                    },
                    { merge: true }
                );
            }
        }
    }
);



[
    "Participant",
    "Program",
    "CaseNote",
    "FundingRecord",
    "TrainingActivity",
    "ParticipantTraining",
    "EmploymentPlacement",
    "SurveyResponse",
    "Document",
    "PdfFormInstance",
]
