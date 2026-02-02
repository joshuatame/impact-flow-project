// src/lib/withBusinessEntity.js
import { getActiveEntity } from "@/lib/activeEntity";

export function withBusinessEntity(payload = {}) {
    const active = getActiveEntity();

    if (!active?.id) {
        return { ...payload };
    }

    return {
        ...payload,
        business_entity_id: active.id,
        business_entity_type: active.type || "",
        business_entity_name: active.name || "",
    };
}
