// src/businessUnits/sidebars/RtoSidebar.jsx
import React from "react";
import { LayoutDashboard, FileText, FolderOpen } from "lucide-react";

export const RTO_SIDEBAR_ID = "RTO";

export default function RtoSidebar() {
    return null;
}

export const rtoNavItems = [
    { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { name: "Reports", icon: FileText, page: "Reports" },
    { name: "Resources", icon: FolderOpen, page: "Resources" },
];

