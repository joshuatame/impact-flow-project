// src/lib/entityStorage.js
const ACTIVE_ENTITY_ID = "active_entity_id";
const ACTIVE_ENTITY_TYPE = "active_entity_type";
const ACTIVE_ENTITY_NAME = "active_entity_name";

export function getActiveEntityId() {
    return localStorage.getItem(ACTIVE_ENTITY_ID);
}

export function getActiveEntity() {
    const id = localStorage.getItem(ACTIVE_ENTITY_ID);
    if (!id) return null;

    return {
        id,
        type: localStorage.getItem(ACTIVE_ENTITY_TYPE) || "",
        name: localStorage.getItem(ACTIVE_ENTITY_NAME) || "",
    };
}

export function hasActiveEntity() {
    return Boolean(localStorage.getItem(ACTIVE_ENTITY_ID));
}

export function setActiveEntity(entity) {
    if (!entity?.id) return;

    localStorage.setItem(ACTIVE_ENTITY_ID, entity.id);
    localStorage.setItem(ACTIVE_ENTITY_TYPE, entity.type || "");
    localStorage.setItem(ACTIVE_ENTITY_NAME, entity.name || "");
}

export function clearActiveEntity() {
    localStorage.removeItem(ACTIVE_ENTITY_ID);
    localStorage.removeItem(ACTIVE_ENTITY_TYPE);
    localStorage.removeItem(ACTIVE_ENTITY_NAME);
}
