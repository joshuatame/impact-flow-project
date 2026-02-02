// src/components/auth/RequireOnboarded.jsx
import React, { useMemo } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

function canProceedFromOnboarding(userDoc) {
    if (!userDoc) return false;
    const effectiveRole = userDoc.view_as_role || userDoc.app_role;

    return (
        userDoc.is_active !== false &&
        (userDoc.status || "").toLowerCase() === "active" &&
        !!effectiveRole &&
        effectiveRole !== "Pending"
    );
}

export default function RequireOnboarded() {
    const { user, loading } = useAuth();
    const location = useLocation();

    const ok = useMemo(() => canProceedFromOnboarding(user), [user]);

    if (loading) return <LoadingSpinner />;

    if (!ok) {
        return (
            <Navigate
                to="/OnboardingPending"
                replace
                state={{ from: location }}
            />
        );
    }

    return <Outlet />;
}
