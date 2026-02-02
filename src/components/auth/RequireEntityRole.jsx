// src/components/auth/RequireEntityRole.jsx
import React, { useMemo } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getActiveEntityId } from "@/lib/activeEntity";
import { getEntityRoleForUser, GLOBAL_ROLES } from "@/lib/rbac";

export default function RequireEntityRole({ allowed = [] }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    const entityId = useMemo(() => getActiveEntityId(), []);
    const role = useMemo(() => getEntityRoleForUser(user, entityId), [user, entityId]);

    if (loading) return null;

    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

    if (!entityId) return <Navigate to="/Launchpad" replace />;

    if (role === GLOBAL_ROLES.SystemAdmin) return <Outlet />;

    if (!allowed.includes(role)) return <Navigate to="/Dashboard" replace />;

    return <Outlet />;
}
