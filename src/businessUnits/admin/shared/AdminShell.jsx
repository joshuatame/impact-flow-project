// src/businessUnits/admin/shared/AdminShell.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Button } from "@/components/ui/button";
import SystemAdminLinks from "@/components/admin/SystemAdminLinks.jsx";

export default function AdminShell({ title = "Admin", subtitle = "", icon: Icon, nav = [] }) {
    return (
        <div className="p-4 md:p-8 space-y-6">
            <PageHeader title={title} subtitle={subtitle} icon={Icon} />

            {/* Keep this at the top as requested */}
            <SystemAdminLinks />

            {/* Wrapped button bar */}
            <div className="flex flex-wrap gap-2">
                {nav.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end}>
                        {({ isActive }) => (
                            <Button
                                type="button"
                                variant={isActive ? "default" : "outline"}
                                className={
                                    isActive
                                        ? "bg-slate-800 text-white"
                                        : "border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                                }
                            >
                                {item.icon ? <item.icon className="h-4 w-4 mr-2" /> : null}
                                {item.label}
                            </Button>
                        )}
                    </NavLink>
                ))}
            </div>

            {/* Content underneath */}
            <div className="pt-2">
                <Outlet />
            </div>
        </div>
    );
}
