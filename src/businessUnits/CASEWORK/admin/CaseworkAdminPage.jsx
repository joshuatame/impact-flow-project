import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader.jsx";
import SystemAdminLinks from "@/components/admin/SystemAdminLinks.jsx";
import { Shield, Users, ClipboardList, Database, FileText, Settings, BookOpen } from "lucide-react";

const NAV = [
    { to: "/Admin/users", label: "Users", icon: Users },
    { to: "/Admin/requests", label: "Requests", icon: ClipboardList },
    { to: "/Admin/reports-exports", label: "Reports / Exports", icon: Database },
    { to: "/Admin/surveys", label: "Surveys", icon: ClipboardList },
    { to: "/Admin/pdfs", label: "PDFs", icon: FileText },
    { to: "/Admin/settings", label: "Settings", icon: Settings },
    { to: "/Admin/guide", label: "Guide", icon: BookOpen },
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

export default function CaseworkAdminShell() {
    return (
        <div className="p-4 md:p-8 space-y-4">
            <PageHeader title="Admin" subtitle="CASEWORK business unit administration" icon={Shield} />

            {/* keep this at top as requested */}
            <SystemAdminLinks />

            {/* wrapped bar of buttons */}
            <div className="flex flex-wrap gap-2 p-2 rounded-xl border border-slate-800 bg-slate-900/40">
                {NAV.map((item) => (
                    <NavButton key={item.to} {...item} />
                ))}
            </div>

            {/* content renders underneath */}
            <div className="pt-2">
                <Outlet />
            </div>
        </div>
    );
}
