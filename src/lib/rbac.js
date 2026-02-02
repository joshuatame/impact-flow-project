// src/lib/rbac.js

export const GLOBAL_ROLES = {
    SystemAdmin: "SystemAdmin",
    User: "User",
};

export const ENTITY_ROLES = {
    GeneralManager: "GeneralManager",
    Manager: "Manager",
    ContractManager: "ContractManager",
    User: "User",
};

export const ENTITY_ROLE_RANK = {
    GeneralManager: 3,
    Manager: 2,
    ContractManager: 1,
    User: 0,
};

export function isSystemAdmin(user) {
    return user?.app_role === GLOBAL_ROLES.SystemAdmin;
}

export function getEntityRoleForUser(user, entityId) {
    if (!user || !entityId) return null;
    if (isSystemAdmin(user)) return GLOBAL_ROLES.SystemAdmin;

    const access = user.entity_access?.[entityId];
    if (!access?.active) return null;

    return access.role || ENTITY_ROLES.User;
}

export function canAssignEntityRole(actorRole, targetRole) {
    if (!actorRole || !targetRole) return false;
    if (actorRole === GLOBAL_ROLES.SystemAdmin) return true;

    const a = ENTITY_ROLE_RANK[actorRole] ?? -1;
    const t = ENTITY_ROLE_RANK[targetRole] ?? -1;

    // strictly below
    return t < a;
}

export function canAddUsersDirectly(actorRoleOrGlobal) {
    if (actorRoleOrGlobal === GLOBAL_ROLES.SystemAdmin) return true;
    if (actorRoleOrGlobal === ENTITY_ROLES.GeneralManager) return true;
    return false;
}

export function canRequestUsers(actorRoleOrGlobal) {
    return actorRoleOrGlobal === ENTITY_ROLES.Manager;
}

export function canManageEntityUsers(actorRoleOrGlobal) {
    return (
        actorRoleOrGlobal === GLOBAL_ROLES.SystemAdmin ||
        actorRoleOrGlobal === ENTITY_ROLES.GeneralManager
    );
}
