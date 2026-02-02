/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/_entity.js  (NEW FILE)
 **************************************************************************************************/
import { getActiveEntity } from "@/lib/activeEntity";

export function getEntityIdOrThrow() {
    const e = getActiveEntity?.() || null;
    const entityId = e?.id || e?.entityId || e?.uid || e?._id || null;
    if (!entityId) throw new Error("No active entity selected. Go to Launchpad and select an entity.");
    return entityId;
}