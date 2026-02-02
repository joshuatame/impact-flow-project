// =================================================================================================
// File: src/businessUnits/LABOURHIRE/admin/LabourhireAdminPage.jsx
// =================================================================================================
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader.jsx";
import SystemAdminLinks from "@/components/admin/SystemAdminLinks.jsx";
import { Shield, Users, ClipboardList, Settings, Mail } from "lucide-react";

const NAV = [
    { to: "/Admin/users", label: "Users", icon: Users },
    { to: "/Admin/requests", label: "Requests", icon: ClipboardList },
    { to: "/Admin/emails", label: "Emails", icon: Mail },
    { to: "/Admin/settings", label: "Settings", icon: Settings },
];

function NavButton({ to, label, icon: Icon }) {
    return (
        <NavLink
            to={to}
            end
            className={({ isActive }) =>
                [
                    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm border transition",
                    "bg-slate-900/50 border-slate-800 text-slate-200 hover:bg-slate-800/60",
                    isActive ? "bg-slate-800 border-slate-700" : "",
                ].join(" ")
            }
        >
            <Icon className="h-4 w-4" />
            {label}
        </NavLink>
    );
}

export default function LabourhireAdminPage() {
    return (
        <div className="p-4 md:p-8 space-y-4">
            <PageHeader
                title="Admin"
                subtitle="LabourHire business unit administration"
                icon={Shield}
            />

            <SystemAdminLinks />

            <div className="flex flex-wrap gap-2 p-2 rounded-xl border border-slate-800 bg-slate-900/40">
                {NAV.map((item) => (
                    <NavButton key={item.to} {...item} />
                ))}
            </div>

            <div className="pt-2">
                <Outlet />
            </div>
        </div>
    );
}
