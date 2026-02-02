// src/businessUnits/admin/shared/RoleGate.js
import React from "react";
import { useEntityRole } from "./useEntityRole";

export default function RoleGate({ allow = [], fallback = null, children }) {
    const { role, isSystemAdmin, isLoading } = useEntityRole();

    if (isLoading) return null;
    if (isSystemAdmin) return <>{children}</>;
    if (!allow?.length) return <>{children}</>;

    const ok = allow.includes(role);
    if (!ok) return fallback;

    return <>{children}</>;
}
