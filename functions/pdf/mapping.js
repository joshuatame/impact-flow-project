/**
 * functions/pdf/mapping.js
 *
 * Pure mapping helpers used by Cloud Functions and unit tests.
 */
"use strict";

function get(obj, path) {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function cleanText(v) {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function isTruthy(v) {
  if (typeof v === "boolean") return v;
  const s = cleanText(v).toLowerCase();
  return ["1", "true", "yes", "y", "on", "checked"].includes(s);
}

function formatDateAU(isoOrDate) {
  const s = cleanText(isoOrDate);
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function computeComputedValue(key, { participant }) {
  const now = new Date();
  if (key === "computed.full_name") {
    const fn = cleanText(participant?.first_name);
    const ln = cleanText(participant?.last_name);
    return cleanText([fn, ln].filter(Boolean).join(" "));
  }
  if (key === "computed.dob_au") return formatDateAU(participant?.date_of_birth);
  if (key === "computed.today_au") return formatDateAU(now.toISOString());
  return "";
}

function resolveMapKey(mapKey, { workflowRequest, participant, caller }) {
  const raw = cleanText(mapKey);
  if (!raw) return "";

  // Normalize common legacy casing to match frontend behavior.
  const normalized = raw
    .replace(/^participant\./i, "Participant.")
    .replace(/^user\./i, "User.")
    .replace(/^workflowrequest\./i, "WorkflowRequest.")
    .replace(/^computed\./i, "computed.");

  if (normalized.toLowerCase().startsWith("participant.")) {
    return cleanText(get(participant, normalized.replace(/^Participant\./, "")));
  }
  if (normalized.toLowerCase().startsWith("user.")) {
    const key = normalized.replace(/^User\./, "");
    return cleanText(get(caller, key));
  }
  if (normalized.toLowerCase().startsWith("workflowrequest.")) {
    return cleanText(get(workflowRequest, normalized.replace(/^WorkflowRequest\./, "")));
  }
  if (normalized.toLowerCase().startsWith("computed.")) {
    return cleanText(computeComputedValue(normalized, { participant }));
  }

  return cleanText(get(participant, normalized));
}

function computeFilledData({ schema, manualValues, instance, workflowRequest, caller }) {
  const safeSchema = Array.isArray(schema) ? schema : [];
  const mv = manualValues && typeof manualValues === "object" ? manualValues : {};

  const participant = workflowRequest?.participant_data || workflowRequest?.participant || {};
  const ctx = { workflowRequest, participant, caller };

  const out = {};

  for (const f of safeSchema) {
    const fieldId = cleanText(f?.id || f?.key);
    if (!fieldId) continue;

    if (String(f?.type || "").toLowerCase() === "signature") continue;

    const manualCandidate = mv[fieldId];
    const hasManualCandidate = manualCandidate !== undefined && cleanText(manualCandidate) !== "";

    const mapKey = cleanText(f?.map_key);
    const isManual = !mapKey || mapKey === "__manual__";

    if (hasManualCandidate && (isManual || f?.editable_after_prefill)) {
      out[fieldId] = manualCandidate;
      continue;
    }

    if (!isManual) {
      out[fieldId] = resolveMapKey(mapKey, ctx);
      continue;
    }

    out[fieldId] =
      manualCandidate ??
      instance?.values?.[fieldId] ??
      instance?.filled_data?.[fieldId] ??
      instance?.filledData?.[fieldId] ??
      "";
  }

  return out;
}

module.exports = {
  cleanText,
  isTruthy,
  formatDateAU,
  resolveMapKey,
  computeFilledData,
};
