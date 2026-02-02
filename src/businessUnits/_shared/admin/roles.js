// src/businessUnits/_shared/admin/roles.js

/**
 * Unit-scoped roles live at: user.entity_access[entityId] = { role, active }
 * SystemAdmin is global at: user.app_role
 */

// Include "User" because your UI uses it as a lowest/default role.
export const ENTITY_ROLE_LADDER = [
    "User",
    "ClientCaseWorker",
    "Manager",
    "ContractManager",
    "GeneralManager",
    "SystemAdmin",
];

export function roleRank(role) {
    const idx = ENTITY_ROLE_LADDER.indexOf(role || "");
    return idx === -1 ? -1 : idx;
}

export function isSystemAdmin(user) {
    return user?.app_role === "SystemAdmin";
}

/**
 * Returns the user's effective role for a unit.
 * - SystemAdmin always returns "SystemAdmin"
 * - If no access or inactive, returns null
 */
export function getActorUnitRole(user, entityId) {
    if (!user || !entityId) return null;
    if (isSystemAdmin(user)) return "SystemAdmin";
    const access = user?.entity_access?.[entityId];
    if (!access || access.active !== true) return null;
    return access.role || "User";
}

/**
 * Back-compat name (some code may call this)
 */
export function getEntityRole(user, entityId) {
    return getActorUnitRole(user, entityId);
}

export function hasEntityAccess(user, entityId) {
    if (!user || !entityId) return false;
    if (isSystemAdmin(user)) return true;
    return user?.entity_access?.[entityId]?.active === true;
}

export function isAtLeast(roleA, roleB) {
    return roleRank(roleA) >= roleRank(roleB);
}

export function isHigherThan(roleA, roleB) {
    return roleRank(roleA) > roleRank(roleB);
}

/**
 * Assignable roles are strictly below inviter role.
 */
export function getAssignableRoles(inviterRole) {
    const r = inviterRole || "";
    if (r === "SystemAdmin") return ["GeneralManager", "ContractManager", "Manager", "ClientCaseWorker", "User"];
    const maxRank = roleRank(r);
    if (maxRank <= 0) return [];
    return ENTITY_ROLE_LADDER.filter((candidate) => roleRank(candidate) < maxRank && candidate !== "SystemAdmin");
}

/**
 * Back-compat: older panels import this name
 * Support BOTH call styles:
 *  - allowedAssignableRoles(inviterRoleString)
 *  - allowedAssignableRoles(userObj, entityId)
 */
export function allowedAssignableRoles(a, b) {
    const inviterRole = typeof a === "string" ? a : getActorUnitRole(a, b);
    return getAssignableRoles(inviterRole);
}

/**
 * Some panels import canAssignRole(me, entityId, role)
 */
export function canAssignRole(user, entityId, targetRole) {
    if (!user) return false;
    if (isSystemAdmin(user)) return targetRole !== "SystemAdmin"; // keep unit UI from assigning SystemAdmin
    const myRole = getActorUnitRole(user, entityId);
    if (!myRole) return false;
    return getAssignableRoles(myRole).includes(targetRole);
}

/**
 * Admin visibility (unit admin, not system admin section)
 */
export function canSeeAdmin(user, entityId) {
    if (!user) return false;
    const r = typeof user === "string" ? user : getActorUnitRole(user, entityId);
    return r === "SystemAdmin" || r === "GeneralManager" || r === "ContractManager" || r === "Manager";
}

export function canStartInvites(user, entityId) {
    const r = typeof user === "string" ? user : getActorUnitRole(user, entityId);
    return r === "SystemAdmin" || r === "GeneralManager" || r === "ContractManager" || r === "Manager";
}

export function canApproveRequests(user, entityId) {
    const r = typeof user === "string" ? user : getActorUnitRole(user, entityId);
    return r === "SystemAdmin" || r === "GeneralManager";
}

/**
 * RequestsPanelBase was importing this earlier in your logs.
 * Keep it for compatibility.
 */
export function canCreateRequests(user, entityId) {
    const r = typeof user === "string" ? user : getActorUnitRole(user, entityId);
    return r === "SystemAdmin" || r === "GeneralManager" || r === "ContractManager" || r === "Manager";
}

/**
 * Optional helpers (safe to keep)
 */
export function canSendEmails(user, entityId) {
    const r = typeof user === "string" ? user : getActorUnitRole(user, entityId);
    return r === "SystemAdmin" || r === "GeneralManager" || r === "ContractManager";
}

export function canEditSettings(user, entityId) {
    const r = typeof user === "string" ? user : getActorUnitRole(user, entityId);
    return r === "SystemAdmin" || r === "GeneralManager" || r === "ContractManager";
}
