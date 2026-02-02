// functions/src/wfConnectAwards.js

const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

function assertAuthed(req) {
    if (!req.auth) throw new Error("unauthenticated");
}
function assertManager(req) {
    const claims = req.auth?.token || {};
    const portal = claims.wfConnectPortal;
    const roles = claims.roles || [];
    if (portal !== "manager" && !roles.includes("SystemAdmin")) throw new Error("permission-denied");
}

async function fetchText(url) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    return await res.text();
}

function parseModernAwardsList(html) {
    // Extract lines like: "Aged Care Award 2010 [MA000018]"
    const re = />\s*([^<\[]+?)\s*\[(MA\d{6})\]\s*</g;
    const out = [];
    let m;
    while ((m = re.exec(html))) {
        const name = String(m[1] || "").trim();
        const awardCode = String(m[2] || "").trim();
        if (!name || !awardCode) continue;
        out.push({
            awardCode,
            name,
            source: "fwc_modern_awards_list",
            awardHtmlUrl: `https://awards.fairwork.gov.au/${awardCode}.html`,
        });
    }
    // De-dupe by awardCode
    const map = new Map();
    out.forEach((x) => map.set(x.awardCode, x));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function defaultComplianceDefaults() {
    return {
        breakRequiredAfterHours: 5,
        minBreakHours: 0.5,
        maxDailyHours: 12,
        overtimeDailyAfterHours: 8,
    };
}

async function maybeCallOpenAI({ prompt }) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const body = {
        model: "gpt-4.1-mini",
        input: prompt,
        temperature: 0.2,
    };

    const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
    const data = await res.json();
    const text =
        data?.output?.[0]?.content?.map((c) => c?.text).filter(Boolean).join("\n") ||
        data?.output_text ||
        null;

    return text;
}

/**
 * Sync awards catalog from FWC modern awards list.
 * Writes to: awardsCatalog/{MAcode}
 */
exports.wfConnectSyncAwardsCatalog = onCall({ cors: true, timeoutSeconds: 120 }, async (req) => {
    assertAuthed(req);
    assertManager(req);

    const url = "https://www.fwc.gov.au/document-search/modern-awards-list";
    const html = await fetchText(url);
    const awards = parseModernAwardsList(html);

    const batch = admin.firestore().batch();
    const col = admin.firestore().collection("awardsCatalog");

    awards.forEach((a) => {
        const ref = col.doc(a.awardCode);
        batch.set(
            ref,
            {
                businessUnit: "LABOURHIRE",
                awardCode: a.awardCode,
                name: a.name,
                awardHtmlUrl: a.awardHtmlUrl,
                source: a.source,
                syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
    });

    await batch.commit();
    return { ok: true, count: awards.length };
});

/**
 * Interpret award text into structured requirements + compliance defaults.
 * Writes to: awardInterpretations/{MAcode}
 */
exports.wfConnectInterpretAward = onCall({ cors: true, timeoutSeconds: 120 }, async (req) => {
    assertAuthed(req);
    assertManager(req);

    const { awardCode } = req.data || {};
    if (!awardCode || !/^MA\d{6}$/.test(awardCode)) throw new Error("invalid-argument: awardCode");

    const awardUrl = `https://awards.fairwork.gov.au/${awardCode}.html`;
    const html = await fetchText(awardUrl);

    // Strip tags lightly for summarisation.
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 180000);

    const prompt = `
You are an employment award interpreter for an Australian labour hire business.
Return STRICT JSON only.

Award code: ${awardCode}
Award URL: ${awardUrl}

Extract:
{
  "awardCode": "${awardCode}",
  "summary": "plain english",
  "coverage": { "whoIsCovered": "...", "whoIsNotCovered": "..." },
  "allowances": [ { "name": "...", "when": "...", "amount": "...", "notes": "..." } ],
  "penalties": [ { "type": "weekend|publicHoliday|shift|other", "when": "...", "rateOrMultiplier": "...", "notes": "..." } ],
  "breaks": { "rules": "...", "minimums": "..." },
  "overtime": { "rules": "...", "multipliers": "..." },
  "classifications": [ { "name": "...", "description": "..." } ],
  "complianceDefaults": {
    "breakRequiredAfterHours": 5,
    "minBreakHours": 0.5,
    "maxDailyHours": 12,
    "overtimeDailyAfterHours": 8
  }
}

Use the award text to populate fields when available; if missing, keep defaults.
Do NOT hallucinate amounts.
  `.trim();

    let aiJsonText = null;
    try {
        aiJsonText = await maybeCallOpenAI({ prompt });
    } catch (e) {
        // keep fallback (store raw + defaults)
        aiJsonText = null;
    }

    let interpreted = null;
    if (aiJsonText) {
        try {
            interpreted = JSON.parse(aiJsonText);
        } catch {
            interpreted = null;
        }
    }

    const doc = interpreted || {
        awardCode,
        summary: "AI not configured or parse failed. Stored raw award text for manual review.",
        coverage: { whoIsCovered: "", whoIsNotCovered: "" },
        allowances: [],
        penalties: [],
        breaks: { rules: "", minimums: "" },
        overtime: { rules: "", multipliers: "" },
        classifications: [],
        complianceDefaults: defaultComplianceDefaults(),
    };

    await admin.firestore().collection("awardInterpretations").doc(awardCode).set(
        {
            businessUnit: "LABOURHIRE",
            awardCode,
            awardHtmlUrl: awardUrl,
            interpretedAt: admin.firestore.FieldValue.serverTimestamp(),
            interpretedBy: req.auth.uid,
            ...doc,
            rawTextSample: text.slice(0, 20000),
        },
        { merge: true }
    );

    return { ok: true, awardCode, usedAI: !!interpreted };
});
