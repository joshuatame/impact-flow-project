"use strict";

/* eslint-env node */
/* eslint-disable no-undef */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

const db = getFirestore();

function requireString(v, name) {
    if (!v || typeof v !== "string") throw new HttpsError("invalid-argument", `${name} is required.`);
    return v.trim();
}

function safeString(v) {
    return typeof v === "string" ? v.trim() : "";
}

function randomCode(len = 9) {
    // base32-ish url safe
    const bytes = crypto.randomBytes(Math.ceil((len * 5) / 8));
    return bytes
        .toString("base64")
        .replace(/[+/=]/g, "")
        .slice(0, len)
        .toLowerCase();
}

async function allocateUniqueCode(entityId, maxAttempts = 8) {
    for (let i = 0; i < maxAttempts; i++) {
        const code = randomCode(10);
        const ref = db.collection("RtoShortLinks").doc(code);
        const snap = await ref.get();
        if (!snap.exists) return { code, ref };
    }
    throw new HttpsError("resource-exhausted", "Unable to allocate a unique code. Try again.");
}

exports.rtoCreateCampaignLink = onCall(
    { region: "australia-southeast1" },
    async (req) => {
        const uid = req.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "You must be signed in.");

        const data = req.data || {};

        const entityId = requireString(data.entityId, "entityId");
        const campaignId = requireString(data.campaignId, "campaignId");
        const intakeId = safeString(data.intakeId) || null;

        const label = safeString(data.label) || "Link";
        const sourceChannel = safeString(data.sourceChannel) || "other";
        const bdUserId = safeString(data.bdUserId) || null;
        const qrVariant = safeString(data.qrVariant) || null;

        const utmDefaults = data.utmDefaults && typeof data.utmDefaults === "object" ? data.utmDefaults : {};
        const cleanUtm = {
            utm_source: safeString(utmDefaults.utm_source),
            utm_medium: safeString(utmDefaults.utm_medium),
            utm_campaign: safeString(utmDefaults.utm_campaign),
            utm_content: safeString(utmDefaults.utm_content),
            utm_term: safeString(utmDefaults.utm_term),
        };

        // Basic permission gate: must have access to this entity
        // Assumes you store user doc in "User" and entity access in entity_access[entityId]
        const meSnap = await db.collection("User").doc(uid).get();
        if (!meSnap.exists) throw new HttpsError("permission-denied", "User profile not found.");
        const me = meSnap.data() || {};
        const access = me?.entity_access?.[entityId];
        const role = access?.role || null;
        const isSystemAdmin = me?.app_role === "SystemAdmin";
        const allowed = isSystemAdmin || ["ContractManager", "Manager", "GeneralManager", "BD"].includes(role);
        if (!allowed) throw new HttpsError("permission-denied", "Not allowed for this business unit.");

        // Create short code and store a canonical link record
        const { code } = await allocateUniqueCode(entityId);

        const linkDoc = {
            entityId,
            businessUnit: "RTO",
            campaignId,
            intakeId,

            label,
            sourceChannel,
            bdUserId,
            qrVariant,

            code,
            utmDefaults: cleanUtm,

            stats: { clicks: 0, enquiries: 0 },
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: uid,
        };

        // Write both the link record and a shortlink resolver doc
        // - RtoCampaignLinks: full metadata
        // - RtoShortLinks: code -> pointers for fast resolve
        const batch = db.batch();

        const linkRef = db.collection("RtoCampaignLinks").doc();
        batch.set(linkRef, linkDoc);

        const shortRef = db.collection("RtoShortLinks").doc(code);
        batch.set(shortRef, {
            entityId,
            businessUnit: "RTO",
            campaignId,
            intakeId,
            linkId: linkRef.id,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
        });

        await batch.commit();

        return {
            ok: true,
            code,
            linkId: linkRef.id,
        };
    }
);
