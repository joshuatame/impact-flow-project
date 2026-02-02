// =================================================================================================
// File: src/businessUnits/registry.js
// =================================================================================================
import {
    LayoutDashboard,
    Users,
    FolderKanban,
    FileText,
    Settings,
    Building2,
    FolderOpen,
    FileSignature,
    Megaphone,
    CheckSquare,
    MessageSquare,
    ClipboardCheck,
    Target,
    Link as LinkIcon,
    UserCheck,
} from "lucide-react";

export const ENTITY_TYPES = {
    PROGRAMS: "PROGRAMS",
    CASEWORK: "CASEWORK",
    RTO: "RTO",
    LABOURHIRE: "LABOURHIRE",
};

export const ENTITY_TYPE_LABELS = {
    [ENTITY_TYPES.PROGRAMS]: "Programs",
    [ENTITY_TYPES.CASEWORK]: "Casework",
    [ENTITY_TYPES.RTO]: "RTO Lead gen + enrolments",
    [ENTITY_TYPES.LABOURHIRE]: "Labourhire / Subcontracting",
};

const baseCaseworkNav = [
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

// Keep conservative: only show pages that exist today.
const programsNav = [
    { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { name: "Programs", icon: FolderKanban, page: "Programs" },
    { name: "Reports", icon: FileText, page: "Reports" },
    { name: "Resources", icon: FolderOpen, page: "Resources" },
];

// RTO nav must match pageRegistry keys + index.jsx routes (Intakes/Campaigns/Leads).
const rtoNav = [
    { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { name: "Intakes", icon: FolderKanban, page: "Intakes" },
    { name: "Campaigns", icon: LinkIcon, page: "Campaigns" },
    { name: "Leads", icon: Target, page: "Leads" },
];

// Labourhire entity dashboard inside main Layout.
// WF Connect portals are accessed via /labourhire/* (separate router).
const labourhireNav = [
    { name: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
    { name: "WF Connect Portal", icon: UserCheck, page: null, href: "/labourhire" },
];

export function getNavItemsForEntityType(entityType) {
    switch (entityType) {
        case ENTITY_TYPES.PROGRAMS:
            return programsNav;
        case ENTITY_TYPES.RTO:
            return rtoNav;
        case ENTITY_TYPES.LABOURHIRE:
            return labourhireNav;
        case ENTITY_TYPES.CASEWORK:
        default:
            return baseCaseworkNav;
    }
}

export function getEntityTypeLabel(entityType) {
    return ENTITY_TYPE_LABELS[entityType] || "Business Unit";
}

export const ADMIN_EXTRAS = {
    pendingRequests: {
        name: "Pending Requests",
        icon: ClipboardCheck,
        page: "WorkflowApprovals",
        badge: "PendingRequestsBadge",
    },
    settings: { name: "Settings", icon: Settings, page: "Settings" },
    admin: { name: "Admin", icon: Settings, page: "Admin" },
};