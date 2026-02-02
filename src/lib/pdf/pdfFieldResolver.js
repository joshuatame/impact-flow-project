// src/lib/pdf/pdfFieldResolver.js

function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    const parts = String(path).split(".").map((p) => p.trim()).filter(Boolean);
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function formatISODateToAU(iso) {
    if (!iso || typeof iso !== "string") return "";
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    const [, yyyy, mm, dd] = m;
    return `${dd}/${mm}/${yyyy}`;
}

function compute(mapKey, ctx) {
    const key = String(mapKey || "").toLowerCase();

    if (key === "computed.full_name") {
        const first = getByPath(ctx, "Participant.first_name") || "";
        const last = getByPath(ctx, "Participant.last_name") || "";
        return `${String(first).trim()} ${String(last).trim()}`.trim();
    }

    if (key === "computed.today_au") {
        const d = new Date();
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = String(d.getFullYear());
        return `${dd}/${mm}/${yyyy}`;
    }

    if (key === "computed.dob_au") {
        const dob = getByPath(ctx, "Participant.date_of_birth");
        return formatISODateToAU(dob);
    }

    return "";
}

export function resolveFieldValue({ field, ctx, manualValues }) {
    const id = field?.id;
    if (!id) return "";

    // Manual override always wins
    if (manualValues && Object.prototype.hasOwnProperty.call(manualValues, id)) {
        const mv = manualValues[id];
        return mv == null ? "" : mv;
    }

    const mapKey = String(field?.map_key || "").trim();
    if (!mapKey) return "";

    if (mapKey.toLowerCase().startsWith("computed.")) {
        return compute(mapKey, ctx);
    }

    // MapKey is like: Participant.first_name, User.email
    let v = getByPath(ctx, mapKey);

    // Backward-compat: allow participant./user. prefixes
    if (v === undefined) {
        const legacy = mapKey
            .replace(/^participant\./i, "Participant.")
            .replace(/^user\./i, "User.");
        v = getByPath(ctx, legacy);
    }

    // Optional helper fallback
    if (v === undefined && mapKey === "User.full_name") {
        v = getByPath(ctx, "User.display_name");
    }

    if (v === undefined || v === null) return "";
    return v;
}

export function resolveAllFieldValues({ schema, ctx, manualValues }) {
    const out = {};
    for (const f of schema || []) {
        if (!f?.id) continue;
        out[f.id] = resolveFieldValue({ field: f, ctx, manualValues });
    }
    return out;
}
