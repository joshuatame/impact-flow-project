/* File: src/lib/entityScopeBase44.js */

import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";

export function getActiveEntityIdStrict() {
    const active = getActiveEntity?.();
    const entityId = active?.id || active?.entityId || active?._id || null;
    if (!entityId) throw new Error("No active business unit selected.");
    return entityId;
}

function getEntityApi(entityName) {
    return base44?.entities?.[entityName] || null;
}

async function tryList(api, sort, limit, filters) {
    if (!api?.list) return null;

    // We don't know Base44's exact signature, so attempt the common ones.
    const attempts = [
        () => api.list(sort, limit, filters),
        () => api.list(sort, limit),
        () => api.list({ sort, limit, ...filters }),
        () => api.list({ sort, limit }),
    ];

    let lastErr = null;
    for (const fn of attempts) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const res = await fn();
            return res;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

export async function entityListMaybe(entityName, sort, limit, entityId, extraFilters = {}) {
    const api = getEntityApi(entityName);
    if (!api?.list) return [];

    const filters = { ...extraFilters, entity_id: entityId };

    try {
        const res = await tryList(api, sort, limit, filters);
        const list = Array.isArray(res) ? res : [];
        // If Base44 didn't support server-side filters, client-filter as a safe fallback.
        return list.filter((d) => d?.entity_id === entityId || !d?.entity_id ? d?.entity_id === entityId : true);
    } catch {
        // Safe fallback: keep UI alive even if entity isn't wired yet.
        return [];
    }
}

export async function entityCreateMaybe(entityName, entityId, payload) {
    const api = getEntityApi(entityName);
    if (!api) throw new Error(`Unknown entity: ${entityName}`);

    const doc = { ...payload, entity_id: entityId };

    // Try common create method names.
    const fns = [api.create, api.insert, api.add].filter(Boolean);

    let lastErr = null;
    for (const fn of fns) {
        try {
            // eslint-disable-next-line no-await-in-loop
            return await fn.call(api, doc);
        } catch (e) {
            lastErr = e;
        }
    }

    throw lastErr || new Error(`No create/insert/add available for ${entityName}`);
}