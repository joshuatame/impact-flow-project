/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/lib/matching.js  (REPLACE ENTIRE FILE)
 **************************************************************************************************/

/**
 * LabourHire Matching Utilities
 *
 * Exports expected by LabourHire pages:
 * - normalizeSkills / normalizeLicences / normalizeTags
 * - scoreOverlap
 * - computeCandidateRoleMatch (core)
 * - scoreCandidateMatch (compat alias used by ManagerRoleMatching.jsx)
 * - rankCandidatesForRole / rankRolesForCandidate
 * - groupByTier (tier bucketing for UI)
 */

function safeLower(v) {
    return String(v || "").trim().toLowerCase();
}

function uniq(arr) {
    return [...new Set((arr || []).filter(Boolean))];
}

export function normalizeSkills(skills) {
    if (!skills) return [];
    if (Array.isArray(skills)) return uniq(skills.map(safeLower));
    if (typeof skills === "string") {
        return uniq(
            skills
                .split(/[,\n]/g)
                .map((s) => safeLower(s))
                .filter(Boolean)
        );
    }
    return [];
}

export function normalizeLicences(licences) {
    if (!licences) return [];
    if (Array.isArray(licences)) return uniq(licences.map(safeLower));
    if (typeof licences === "string") {
        return uniq(
            licences
                .split(/[,\n]/g)
                .map((s) => safeLower(s))
                .filter(Boolean)
        );
    }
    return [];
}

export function normalizeTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return uniq(tags.map(safeLower));
    if (typeof tags === "string") {
        return uniq(
            tags
                .split(/[,\n]/g)
                .map((s) => safeLower(s))
                .filter(Boolean)
        );
    }
    return [];
}

export function scoreOverlap(a, b) {
    const A = new Set((a || []).map(safeLower).filter(Boolean));
    const B = new Set((b || []).map(safeLower).filter(Boolean));
    if (A.size === 0 || B.size === 0) return { score: 0, matched: [], missing: [] };

    const matched = [];
    const missing = [];

    for (const x of B) {
        if (A.has(x)) matched.push(x);
        else missing.push(x);
    }

    const score = matched.length / B.size;
    return { score, matched, missing };
}

/**
 * Core scorer used everywhere.
 * Returns { score, breakdown } where score is 0..1.
 */
export function computeCandidateRoleMatch(candidate, role) {
    const candidateSkills = normalizeSkills(candidate?.skills || candidate?.profile?.skills);
    const candidateLic = normalizeLicences(candidate?.licences || candidate?.profile?.licences);
    const candidateTags = normalizeTags(candidate?.tags || candidate?.profile?.tags);

    const roleSkills = normalizeSkills(role?.skills || role?.requirements?.skills);
    const roleLic = normalizeLicences(role?.licences || role?.requirements?.licences);
    const roleTags = normalizeTags(role?.tags || role?.requirements?.tags);

    const skills = scoreOverlap(candidateSkills, roleSkills);
    const licences = scoreOverlap(candidateLic, roleLic);
    const tags = scoreOverlap(candidateTags, roleTags);

    const weights = { skills: 0.6, licences: 0.3, tags: 0.1 };
    const score =
        skills.score * weights.skills +
        licences.score * weights.licences +
        tags.score * weights.tags;

    return {
        score,
        breakdown: { skills, licences, tags, weights },
    };
}

/**
 * ✅ Compatibility export used by ManagerRoleMatching.jsx
 * Some screens import scoreCandidateMatch(candidate, role).
 */
export function scoreCandidateMatch(candidate, role) {
    return computeCandidateRoleMatch(candidate, role);
}

export function rankCandidatesForRole(candidates, role, limit = 50) {
    return (Array.isArray(candidates) ? candidates : [])
        .map((c) => ({
            candidate: c,
            ...computeCandidateRoleMatch(c, role),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

export function rankRolesForCandidate(roles, candidate, limit = 50) {
    return (Array.isArray(roles) ? roles : [])
        .map((r) => ({
            role: r,
            ...computeCandidateRoleMatch(candidate, r),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

/**
 * Group items into tiers by score.
 *
 * Default tiers:
 * - A: score >= 0.80
 * - B: score >= 0.60
 * - C: score >= 0.40
 * - D: score <  0.40
 *
 * @param {Array<any>} items
 * @param {Object} [options]
 * @param {(item:any)=>number} [options.getScore] - default: item.score
 * @param {Array<{key:string,min:number}>} [options.tiers] - ordered by min desc
 * @param {boolean} [options.includeEmpty] - default false
 * @returns {Record<string, Array<any>>}
 */
export function groupByTier(items, options = {}) {
    const arr = Array.isArray(items) ? items : [];

    const getScore =
        typeof options.getScore === "function"
            ? options.getScore
            : (it) => Number(it?.score ?? 0);

    const tiers =
        Array.isArray(options.tiers) && options.tiers.length
            ? options.tiers
            : [
                { key: "A", min: 0.8 },
                { key: "B", min: 0.6 },
                { key: "C", min: 0.4 },
                { key: "D", min: -Infinity },
            ];

    const buckets = {};
    for (const t of tiers) buckets[t.key] = [];

    for (const it of arr) {
        const s = getScore(it);
        const tier = tiers.find((t) => s >= t.min) || tiers[tiers.length - 1];
        buckets[tier.key].push(it);
    }

    if (!options.includeEmpty) {
        for (const k of Object.keys(buckets)) {
            if (!buckets[k].length) delete buckets[k];
        }
    }

    return buckets;
}
