// src/businessUnits/sidebars/SystemAdminSidebar.jsx
import React from "react";
import { LayoutDashboard, Users, Shield, Building2, Download, UploadCloud } from "lucide-react";

export const SYSTEMADMIN_SIDEBAR_ID = "SYSTEMADMIN";

export default function SystemAdminSidebar() {
    return null;
}

export const systemAdminNavItems = [
    { name: "Dashboard", icon: LayoutDashboard, page: "SystemAdmin/dashboard" },
    { name: "Users", icon: Users, page: "SystemAdmin/users" },
    { name: "Access", icon: Shield, page: "SystemAdmin/access" },
    { name: "Entities", icon: Building2, page: "SystemAdmin/entities" },
    { name: "Exports", icon: Download, page: "SystemAdmin/exports" },
    { name: "Bulk Import", icon: UploadCloud, page: "SystemAdmin/imports" },
];