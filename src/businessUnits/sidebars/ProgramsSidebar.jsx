// src/businessUnits/sidebars/CaseworkSidebar.jsx
import React from "react";
import {
    LayoutDashboard,
    Users,
    FolderKanban,
    FileText,
    Building2,
    FolderOpen,
    FileSignature,
    Megaphone,
} from "lucide-react";
import { CheckSquare, MessageSquare } from "lucide-react";

export const PROGRAMS_SIDEBAR_ID = "PROGRAMS";

export default function ProgramsSidebar() {
    return null;
}

export const programsNavItems = [
    { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { name: "Participants", icon: Users, page: "Participants" },
    { name: "Programs", icon: FolderKanban, page: "Programs" },
    { name: "Reports", icon: FileText, page: "Reports" },
    { name: "Resources", icon: FolderOpen, page: "Resources" },
    { name: "Job Blast", icon: Megaphone, page: "JobBlast" },
];

