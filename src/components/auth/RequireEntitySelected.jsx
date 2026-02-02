// src/components/auth/RequireEntitySelected.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasActiveEntity } from "@/lib/activeEntity";

const BYPASS_PATHS = new Set(["/", "/Landing", "/Launchpad", "/login", "/OnboardingPending"]);

export default function RequireEntitySelected() {
    const location = useLocation();

    if (BYPASS_PATHS.has(location.pathname)) {
        return <Outlet />;
    }

    if (!hasActiveEntity()) {
        return <Navigate to="/Launchpad" replace state={{ from: location }} />;
    }

    return <Outlet />;
}
