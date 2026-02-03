"use strict";

/* eslint-env node */
/* eslint-disable no-undef */

const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const db = getFirestore();

function getCodeFromPath(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean);
    const rIndex = parts.indexOf("r");
    if (rIndex === -1) return "";
    return parts[rIndex + 1] || "";
}

function setNoCache(res) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
}

module.exports = function rtoRedirectFactory(REGION) {
    return onRequest({ region: REGION }, async (req, res) => {
        try {
            setNoCache(res);

            const code = getCodeFromPath(req.path);
            if (!code) {
                return res.redirect(302, "/enquiry");
            }

            const shortSnap = await db.collection("RtoShortLinks").doc(code).get();
            if (!shortSnap.exists) {
                return res.redirect(302, "/enquiry?code=" + encodeURIComponent(code));
            }

            const shortData = shortSnap.data() || {};
            const linkId = shortData.linkId || "";
            const campaignId = shortData.campaignId || "";
            const intakeId = shortData.intakeId || "";

            let utmDefaults = {};
            if (linkId) {
                const linkRef = db.collection("RtoCampaignLinks").doc(linkId);
                const linkSnap = await linkRef.get();

                if (linkSnap.exists) {
                    const linkData = linkSnap.data() || {};
                    utmDefaults = linkData.utmDefaults || {};

                    // Increment click stats (best-effort)
                    await linkRef.set(
                        {
                            stats: {
                                clicks: FieldValue.increment(1),
                            },
                            updatedAt: FieldValue.serverTimestamp(),
                        },
                        { merge: true }
                    );
                }
            }

            const params = new URLSearchParams();

            params.set("code", code);
            if (intakeId) params.set("intakeId", intakeId);
            if (campaignId) params.set("campaignId", campaignId);
            if (linkId) params.set("campaignLinkId", linkId);

            // Include stored UTM defaults if present
            const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
            for (const k of utmKeys) {
                const v = utmDefaults?.[k] || "";
                if (v) params.set(k, String(v));
            }

            // Preserve any query params on the incoming request (do not overwrite above)
            for (const [k, v] of Object.entries(req.query || {})) {
                if (!params.has(k) && typeof v !== "undefined") {
                    params.set(k, String(v));
                }
            }

            return res.redirect(302, "/enquiry?" + params.toString());
        } catch (e) {
            return res.redirect(302, "/enquiry");
        }
    });
};
