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

export const CASEWORK_SIDEBAR_ID = "CASEWORK";

export default function CaseworkSidebar() {
    return null;
}

export const caseworkNavItems = [
    { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { name: "Participants", icon: Users, page: "Participants" },
    { name: "Programs", icon: FolderKanban, page: "Programs" },
    { name: "Case Notes", icon: FileText, page: "CaseNotes" },
    { name: "Employers", icon: Building2, page: "EmployerAcademy" },
    { name: "Tasks", icon: CheckSquare, page: "Tasks", badge: "TaskBadge" },
    { name: "Forum", icon: MessageSquare, page: "Forum", badge: "ForumBadge" },
    { name: "Document Designer", icon: FileSignature, page: "DocumentDesigner" },
    { name: "Reports", icon: FileText, page: "Reports" },
    { name: "Resources", icon: FolderOpen, page: "Resources" },
    { name: "Job Blast", icon: Megaphone, page: "JobBlast" },
];
