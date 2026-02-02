// src/pages/OnboardingPending.jsx
import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createPageUrl } from "@/utils";

export default function OnboardingPending() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const canProceed = useMemo(() => {
        if (!user) return false;

        const effectiveRole = user.view_as_role || user.app_role;

        return (
            user.is_active !== false &&
            (user.status || "").toLowerCase() === "active" &&
            !!effectiveRole &&
            effectiveRole !== "Pending"
        );
    }, [user]);

    useEffect(() => {
        if (canProceed) {
            navigate(createPageUrl("Dashboard"), { replace: true });
        }
    }, [canProceed, navigate]);

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto">
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Welcome 👋</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-slate-300">
                        Your account is created, but it still needs to be allocated by your manager.
                    </p>

                    <div className="text-sm text-slate-400 space-y-1">
                        <div>
                            <span className="text-slate-300">Status:</span>{" "}
                            {user?.status || "Pending"}
                        </div>
                        <div>
                            <span className="text-slate-300">Role:</span>{" "}
                            {(user?.view_as_role || user?.app_role) || "Pending"}
                        </div>
                        <div>
                            <span className="text-slate-300">Active:</span>{" "}
                            {user?.is_active ? "true" : "false"}
                        </div>
                    </div>

                    <p className="text-slate-400 text-sm">
                        You’ll be able to continue automatically as soon as your user profile is set to:
                        <span className="text-slate-200"> Active</span>.
                    </p>

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={logout} className="border-slate-700">
                            Logout
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
