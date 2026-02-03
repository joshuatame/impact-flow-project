// src/components/auth/RequireSystemAdmin.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

function isSystemAdmin(userDoc) {
    return userDoc?.app_role === "SystemAdmin";
}

export default function RequireSystemAdmin() {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <LoadingSpinner />;

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (!isSystemAdmin(user)) {
        return <Navigate to="/Landing" replace />;
    }

    return <Outlet />;
}