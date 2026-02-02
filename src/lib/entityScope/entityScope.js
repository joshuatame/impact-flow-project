import { getActiveEntity } from "@/lib/activeEntity";

/**
 * Use this in components where entityId is not passed.
 */
export function requireEntityId() {
    const e = getActiveEntity();
    if (!e?.id) throw new Error("No active entity selected");
    return e.id;
}

/**
 * Base44 safe pattern: list then filter client-side (works even if filter() is inconsistent).
 */
export async function listScoped(base44Entity, entityId, order = "-created_date", limit = 1000) {
    const all = await base44Entity.list(order, limit);
    return (all || []).filter((r) => r?.entity_id === entityId);
}
