// src/components/admin/SystemAdminLinks.jsx
import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Building2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function SystemAdminLinks() {
    const { user } = useAuth();

    if (user?.app_role !== "SystemAdmin") return null;

    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-300" />
                        <div className="font-semibold">System Admin</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                        Manage platform-wide business entities (logo, type, signature, active status).
                    </div>
                </div>

                <Button asChild className="bg-blue-600 hover:bg-blue-700 shrink-0">
                    <Link to="/BusinessEntitiesAdmin">
                        <Building2 className="mr-2 h-4 w-4" />
                        Business Entities
                    </Link>
                </Button>
            </div>
        </div>
    );
}
