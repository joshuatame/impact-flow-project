"use strict";

/* eslint-env node */
/* eslint-disable no-undef */

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const crypto = require("crypto");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

function requireAuth(context) {
    if (!context.auth || !context.auth.uid) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    return context.auth.uid;
}

function isPrivilegedRole(role) {
    return ["SystemAdmin", "GeneralManager", "Manager", "ContractManager", "Admin"].includes(role);
}

async function getUserProfile(uid) {
    const snap = await db.collection("User").doc(uid).get();
    return snap.exists ? snap.data() : null;
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizePhoneAU(phone) {
    const raw = String(phone || "").trim();
    if (!raw) return "";
    if (raw.startsWith("+")) return raw;
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.startsWith("0")) return `+61${digits.slice(1)}`;
    if (digits.startsWith("61")) return `+${digits}`;
    return raw;
}

function sha256Hex(s) {
    return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex");
}

function makeIdentityKeys({ emailNorm, phoneNorm, dob }) {
    const keys = [];
    if (emailNorm) keys.push(`em:${sha256Hex(emailNorm)}`);
    if (phoneNorm) keys.push(`ph:${sha256Hex(phoneNorm)}`);
    if (emailNorm && phoneNorm) keys.push(`ep:${sha256Hex(`${emailNorm}|${phoneNorm}`)}`);
    if (emailNorm && dob) keys.push(`ed:${sha256Hex(`${emailNorm}|${dob}`)}`);
    if (phoneNorm && dob) keys.push(`pd:${sha256Hex(`${phoneNorm}|${dob}`)}`);
    return keys;
}

function randomBase62(len) {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const bytes = crypto.randomBytes(len);
    let out = "";
    for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
    return out;
}

async function requireEntityAccess(user, entityId) {
    if (!user) return false;
    if (user.app_role === "SystemAdmin") return true;
    const access = user.entity_access || {};
    return !!access[entityId];
}

async function requireEntityRole(user, entityId, allowedRoles) {
    if (!user) return false;
    if (user.app_role === "SystemAdmin") return true;
    const access = user.entity_access || {};
    const role = access[entityId] || null;
    if (!role) return false;
    return allowedRoles.includes(role) || allowedRoles.includes(user.app_role);
}

function auditFields(uid) {
    return {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
    };
}

function createFields(uid) {
    return {
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: uid,
    };
}

// ------------------------------
// Create campaign link with collision-safe short code
// ------------------------------
exports.rtoCreateCampaignLink = onCall(async (request) => {
    const uid = requireAuth(request);
    const user = await getUserProfile(uid);

    const { entityId, campaignId, intakeId, label, sourceChannel, bdUserId, qrVariant, utmDefaults } = request.data || {};
    if (!entityId || !campaignId || !intakeId) throw new HttpsError("invalid-argument", "Missing entityId/campaignId/intakeId.");

    const allowed = await requireEntityRole(user, entityId, ["GeneralManager", "Manager", "ContractManager"]);
    if (!allowed) throw new HttpsError("permission-denied", "Insufficient permissions.");

    const campaignRef = db.collection("RtoCampaigns").doc(campaignId);
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) throw new HttpsError("not-found", "Campaign not found.");

    // collision-safe code allocation using dedicated doc ids
    let code = "";
    let codeDocRef = null;

    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = randomBase62(6);
        const ref = db.collection("RtoLinkCodes").doc(candidate);
        const snap = await ref.get();
        if (!snap.exists) {
            code = candidate;
            codeDocRef = ref;
            break;
        }
    }
    if (!code || !codeDocRef) throw new HttpsError("resource-exhausted", "Failed to allocate a unique code.");

    const linkRef = db.collection("RtoCampaignLinks").doc();
    const payload = {
        entityId,
        businessUnit: "RTO",
        campaignId,
        intakeId,
        code,
        label: String(label || "").trim(),
        sourceChannel: String(sourceChannel || "other"),
        bdUserId: bdUserId || null,
        qrVariant: qrVariant || null,
        utmDefaults: utmDefaults || {},
        landingPath: "/enquiry",
        state: "ACTIVE",
        stats: { clicks: 0, enquiries: 0, enrollments: 0 },
        ...createFields(uid),
    };

    await db.runTransaction(async (tx) => {
        tx.create(codeDocRef, {
            entityId,
            businessUnit: "RTO",
            campaignLinkId: linkRef.id,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
        });
        tx.create(linkRef, payload);
    });

    return { linkId: linkRef.id, code };
});

// ------------------------------
// Resolve code for client redirect route
// ------------------------------
exports.rtoResolveCodeForClientRedirect = onCall(async (request) => {
    const { code } = request.data || {};
    if (!code) throw new HttpsError("invalid-argument", "Missing code.");

    const codeSnap = await db.collection("RtoLinkCodes").doc(String(code)).get();
    if (!codeSnap.exists) throw new HttpsError("not-found", "Code not found.");

    const { campaignLinkId } = codeSnap.data() || {};
    const linkSnap = await db.collection("RtoCampaignLinks").doc(String(campaignLinkId)).get();
    if (!linkSnap.exists) throw new HttpsError("not-found", "Link not found.");

    const link = linkSnap.data();

    // Lightweight click log (client-side). Primary click logging should happen in onRequest redirect.
    // This is still useful for SPA environments without hosting rewrite.
    await db.collection("RtoClickEvents").add({
        entityId: link.entityId,
        businessUnit: "RTO",
        code: String(code),
        campaignLinkId: campaignLinkId,
        campaignId: link.campaignId,
        intakeId: link.intakeId,
        sourceChannel: link.sourceChannel || null,
        bdUserId: link.bdUserId || null,
        qrVariant: link.qrVariant || null,
        utmDefaults: link.utmDefaults || {},
        at: FieldValue.serverTimestamp(),
        client: { referrer: request.rawRequest?.headers?.referer || "", ua: request.rawRequest?.headers?.["user-agent"] || "" },
    });

    return {
        entityId: link.entityId,
        campaignLinkId,
        campaignId: link.campaignId,
        intakeId: link.intakeId,
        sourceChannel: link.sourceChannel || null,
        bdUserId: link.bdUserId || null,
        qrVariant: link.qrVariant || null,
        utmDefaults: link.utmDefaults || {},
    };
});

// ------------------------------
// Resolve Person + create Lead (public enquiry submission)
// ------------------------------
exports.rtoResolvePersonAndCreateLead = onCall(async (request) => {
    const { intakeId, person, enquiry, attribution } = request.data || {};
    if (!intakeId) throw new HttpsError("invalid-argument", "Missing intakeId.");
    if (!person || !person.firstName || !person.lastName || !person.dob) {
        throw new HttpsError("invalid-argument", "Missing person details.");
    }

    // Identify entityId from intake (public form does not know entityId reliably)
    const intakeSnap = await db.collection("RtoCourseIntakes").doc(String(intakeId)).get();
    if (!intakeSnap.exists) throw new HttpsError("not-found", "Intake not found.");
    const intake = intakeSnap.data();
    const entityId = intake.entityId;

    const emailNorm = normalizeEmail(person.email || "");
    const phoneNorm = normalizePhoneAU(person.phone || "");
    const dob = String(person.dob || "").trim();

    const keys = makeIdentityKeys({ emailNorm, phoneNorm, dob });
    if (!keys.length) throw new HttpsError("invalid-argument", "Email or phone required.");

    const leadRef = db.collection("RtoLeads").doc();
    const personRef = db.collection("Persons").doc();

    const nowAt = FieldValue.serverTimestamp();

    const utm = (attribution && attribution.utm) ? attribution.utm : {};
    const sourceChannel = attribution?.sourceChannel || null;
    const campaignId = attribution?.campaignId || null;
    const campaignLinkId = attribution?.campaignLinkId || null;
    const bdUserId = attribution?.bdUserId || null;
    const qrVariant = attribution?.qrVariant || null;

    let resolvedPersonId = null;

    await db.runTransaction(async (tx) => {
        // Try resolve existing person via keys (highest confidence: email, phone)
        let existingPersonId = null;
        for (const k of keys) {
            const keySnap = await tx.get(db.collection("PersonKeys").doc(k));
            if (keySnap.exists) {
                existingPersonId = keySnap.data().personId;
                break;
            }
        }

        let personIdToUse = existingPersonId || personRef.id;

        if (!existingPersonId) {
            const personDoc = {
                entityId,
                businessUnit: "MASTER",
                firstName: String(person.firstName || "").trim(),
                lastName: String(person.lastName || "").trim(),
                dob,
                email: person.email || null,
                phone: person.phone || null,
                normalized: { email: emailNorm || null, phoneE164: phoneNorm || null },
                identityKeys: keys,
                consent: {
                    marketing: !!person.marketingConsent,
                    privacyAcceptedAt: nowAt,
                    source: "enquiryForm",
                },
                links: { rto: true, programs: false },
                mergedIntoPersonId: null,
                mergeHistory: [],
                ...createFields(null), // public create
            };

            tx.create(db.collection("Persons").doc(personIdToUse), personDoc);

            for (const k of keys) {
                tx.create(db.collection("PersonKeys").doc(k), {
                    entityId,
                    personId: personIdToUse,
                    ...createFields(null),
                });
            }
        } else {
            // Update minimal fields if missing
            const pSnap = await tx.get(db.collection("Persons").doc(personIdToUse));
            if (pSnap.exists) {
                const p = pSnap.data();
                const patch = {};
                if (!p.normalized?.email && emailNorm) patch["normalized.email"] = emailNorm;
                if (!p.normalized?.phoneE164 && phoneNorm) patch["normalized.phoneE164"] = phoneNorm;
                if (!p.email && person.email) patch.email = person.email;
                if (!p.phone && person.phone) patch.phone = person.phone;
                if (!p.links?.rto) patch["links.rto"] = true;
                if (Object.keys(patch).length) tx.update(db.collection("Persons").doc(personIdToUse), { ...patch, updatedAt: nowAt, updatedBy: null });
            }
        }

        const leadDoc = {
            entityId,
            businessUnit: "RTO",
            personId: personIdToUse,
            intakeId,

            campaignId,
            campaignLinkId,
            sourceChannel: sourceChannel || "other",
            bdUserId: bdUserId || null,
            qrVariant: qrVariant || null,
            utm: {
                utm_source: String(utm.utm_source || ""),
                utm_medium: String(utm.utm_medium || ""),
                utm_campaign: String(utm.utm_campaign || ""),
                utm_content: String(utm.utm_content || ""),
                utm_term: String(utm.utm_term || ""),
            },

            click: {
                referrer: String(attribution?.client?.referrer || ""),
                uaHash: sha256Hex(String(attribution?.client?.userAgent || "")),
                ipHash: null,
                firstClickAt: nowAt,
                lastClickAt: nowAt,
                clickCount: 1,
            },

            status: "OPEN",
            stage: "ENQUIRY",
            stageUpdatedAt: nowAt,

            qualification: { score: 0, notes: "" },
            contact: { preferred: "phone", consentToContact: !!person.consentToContact },
            assignedToUserId: bdUserId || null,

            flags: { suspectedSpam: false },
            drop: { reason: null, notes: null },
            documents: { idUploads: [] },

            publicEnquiry: {
                notes: String(enquiry?.notes || "").trim(),
            },

            createdAt: nowAt,
            createdBy: null,
            updatedAt: nowAt,
            updatedBy: null,
        };

        tx.create(leadRef, leadDoc);

        tx.create(db.collection("RtoLeadEvents").doc(), {
            entityId,
            businessUnit: "RTO",
            leadId: leadRef.id,
            personId: personIdToUse,
            type: "ENQUIRY_CREATED",
            at: nowAt,
            byUserId: null,
            data: { intakeId, campaignId, campaignLinkId, sourceChannel, bdUserId, qrVariant },
        });

        resolvedPersonId = personIdToUse;

        // Update counters (best-effort)
        if (campaignLinkId) {
            const linkRef = db.collection("RtoCampaignLinks").doc(String(campaignLinkId));
            const linkSnap = await tx.get(linkRef);
            if (linkSnap.exists) {
                tx.update(linkRef, {
                    "stats.enquiries": FieldValue.increment(1),
                    updatedAt: nowAt,
                    updatedBy: null,
                });
            }
        }
    });

    return { leadId: leadRef.id, personId: resolvedPersonId, entityId };
});

// ------------------------------
// Register uploads (staff-only in rules, callable keeps it safe)
// ------------------------------
exports.rtoRegisterLeadUploads = onCall(async (request) => {
    const uid = requireAuth(request);
    const user = await getUserProfile(uid);

    const { leadId, entityId, uploads } = request.data || {};
    if (!leadId || !entityId) throw new HttpsError("invalid-argument", "Missing leadId/entityId.");
    if (!Array.isArray(uploads) || !uploads.length) return { ok: true };

    const allowed = await requireEntityAccess(user, entityId);
    if (!allowed) throw new HttpsError("permission-denied", "No entity access.");

    const leadRef = db.collection("RtoLeads").doc(String(leadId));
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found.");

    const nowAt = FieldValue.serverTimestamp();

    // Append uploads and create events
    await db.runTransaction(async (tx) => {
        const lSnap = await tx.get(leadRef);
        const lead = lSnap.data();
        const existing = (lead.documents && lead.documents.idUploads) ? lead.documents.idUploads : [];
        const next = existing.concat(
            uploads.map((u) => ({
                fileId: u.fileId,
                path: u.path,
                contentType: u.contentType,
                size: u.size,
                uploadedAt: nowAt,
                uploadedBy: uid,
            }))
        );

        tx.update(leadRef, {
            "documents.idUploads": next,
            ...auditFields(uid),
        });

        for (const u of uploads) {
            tx.create(db.collection("RtoLeadEvents").doc(), {
                entityId,
                businessUnit: "RTO",
                leadId: leadId,
                personId: lead.personId,
                type: "DOC_UPLOADED",
                at: nowAt,
                byUserId: uid,
                data: { fileId: u.fileId, path: u.path, contentType: u.contentType, size: u.size },
            });
        }
    });

    return { ok: true };
});

// ------------------------------
// Stage update with audit
// ------------------------------
exports.rtoUpdateLeadStage = onCall(async (request) => {
    const uid = requireAuth(request);
    const user = await getUserProfile(uid);

    const { leadId, entityId, toStage, reason, note } = request.data || {};
    if (!leadId || !entityId || !toStage) throw new HttpsError("invalid-argument", "Missing leadId/entityId/toStage.");

    const hasAccess = await requireEntityAccess(user, entityId);
    if (!hasAccess) throw new HttpsError("permission-denied", "No entity access.");

    const leadRef = db.collection("RtoLeads").doc(String(leadId));
    const nowAt = FieldValue.serverTimestamp();

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(leadRef);
        if (!snap.exists) throw new HttpsError("not-found", "Lead not found.");
        const lead = snap.data();

        // BD restrictions: can only update if assigned to them (unless privileged)
        const role = (user.app_role === "SystemAdmin") ? "SystemAdmin" : (user.entity_access || {})[entityId] || user.app_role || "";
        if (!isPrivilegedRole(role)) {
            if (lead.assignedToUserId !== uid) throw new HttpsError("permission-denied", "Lead not assigned to you.");
        }

        const fromStage = lead.stage;

        const patch = {
            stage: toStage,
            stageUpdatedAt: nowAt,
            ...auditFields(uid),
        };

        if (toStage === "DROPPED") {
            patch.drop = { reason: reason || "unspecified", notes: note || "" };
            patch.status = "CLOSED";
        }

        if (toStage === "COMPLETED") {
            patch.status = "CONVERTED";
        }

        tx.update(leadRef, patch);

        tx.create(db.collection("RtoLeadEvents").doc(), {
            entityId,
            businessUnit: "RTO",
            leadId: leadId,
            personId: lead.personId,
            type: "STAGE_CHANGED",
            at: nowAt,
            byUserId: uid,
            data: { from: fromStage, to: toStage, reason: reason || null, note: note || null },
        });
    });

    return { ok: true };
});

// ------------------------------
// Server-side redirect endpoint: /r/:code
// Recommended as primary for tracking. Configure Hosting rewrite to this function.
// ------------------------------
exports.rtoRedirect = onRequest(async (req, res) => {
    try {
        const parts = String(req.path || "").split("/").filter(Boolean);
        const code = parts.length ? parts[parts.length - 1] : null;

        if (!code) {
            res.status(400).send("Missing code.");
            return;
        }

        const codeSnap = await db.collection("RtoLinkCodes").doc(String(code)).get();
        if (!codeSnap.exists) {
            res.status(404).send("Not found.");
            return;
        }

        const { campaignLinkId } = codeSnap.data() || {};
        const linkSnap = await db.collection("RtoCampaignLinks").doc(String(campaignLinkId)).get();
        if (!linkSnap.exists) {
            res.status(404).send("Not found.");
            return;
        }

        const link = linkSnap.data();

        // Log click
        await db.collection("RtoClickEvents").add({
            entityId: link.entityId,
            businessUnit: "RTO",
            code: String(code),
            campaignLinkId: campaignLinkId,
            campaignId: link.campaignId,
            intakeId: link.intakeId,
            sourceChannel: link.sourceChannel || null,
            bdUserId: link.bdUserId || null,
            qrVariant: link.qrVariant || null,
            utmDefaults: link.utmDefaults || {},
            at: FieldValue.serverTimestamp(),
            server: {
                ipHash: sha256Hex(String(req.ip || "")),
                uaHash: sha256Hex(String(req.headers["user-agent"] || "")),
                referrer: String(req.headers.referer || ""),
            },
        });

        // Increment click counters best-effort
        await db.collection("RtoCampaignLinks").doc(String(campaignLinkId)).update({
            "stats.clicks": FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: null,
        });

        const qs = new URLSearchParams();
        qs.set("code", String(code));
        qs.set("intakeId", String(link.intakeId || ""));
        qs.set("campaignId", String(link.campaignId || ""));
        qs.set("campaignLinkId", String(campaignLinkId));
        if (link.sourceChannel) qs.set("sourceChannel", String(link.sourceChannel));
        if (link.bdUserId) qs.set("bdUserId", String(link.bdUserId));
        if (link.qrVariant) qs.set("qrVariant", String(link.qrVariant));

        const utm = link.utmDefaults || {};
        for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
            if (utm[k]) qs.set(k, String(utm[k]));
        }

        const dest = `${req.protocol}://${req.get("host")}/enquiry?${qs.toString()}`;

        res.set("Cache-Control", "no-store");
        res.redirect(302, dest);
    } catch (e) {
        logger.error("rtoRedirect failed", e);
        res.status(500).send("Server error.");
    }
});
