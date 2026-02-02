// src/components/auth/RequireSystemAdmin.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function RequireSystemAdmin() {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return null;

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (user?.app_role !== "SystemAdmin") {
        return <Navigate to="/Dashboard" replace />;
    }

    return <Outlet />;
}
