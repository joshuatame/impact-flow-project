// =================================================================================================
// File: src/components/QuickAddMenu.jsx
// (UPDATED: supports action.href for LABOURHIRE portal routes)
// =================================================================================================
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
    Plus,
    Briefcase,
    GraduationCap,
    FileText,
    DollarSign,
    CheckCircle2,
    Megaphone,
    Users,
    ClipboardList,
    Layers,
    Calculator,
    FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveEntity } from "@/lib/activeEntity";

// Existing (CASEWORK style) actions
const caseworkQuickActions = [
    { name: "Case Note", icon: FileText, page: "CaseNoteForm", color: "from-violet-500 to-purple-600" },
    { name: "Funding", icon: DollarSign, page: "FundingForm", color: "from-pink-500 to-rose-600" },
    { name: "Training", icon: GraduationCap, page: "TrainingForm", color: "from-amber-500 to-orange-600" },
    { name: "Bulk Training Complete", icon: CheckCircle2, page: "TrainingBulkComplete", color: "from-sky-500 to-cyan-600" },
    { name: "Employment", icon: Briefcase, page: "EmploymentForm", color: "from-emerald-500 to-green-600" },
];

// RTO-specific actions (different requirements, same layout)
const rtoQuickActions = [
    { name: "Course", icon: ClipboardList, page: "RtoCourseCreate", color: "from-indigo-500 to-blue-600" },
    { name: "Course Intake", icon: GraduationCap, page: "Intakes", color: "from-amber-500 to-orange-600" },
    { name: "Campaign", icon: Megaphone, page: "Campaigns", color: "from-pink-500 to-rose-600" },
    { name: "Manual Lead", icon: Users, page: "RtoLeadCreate", color: "from-emerald-500 to-green-600" },
];

// LABOURHIRE / WF Connect quick actions (routes live under /labourhire/*)
const labourhireQuickActions = [
    { name: "WF Connect Portal", icon: Users, href: "/labourhire", color: "from-indigo-500 to-blue-600" },
    { name: "Manager: Timecards", icon: Layers, href: "/labourhire/manager/timecards", color: "from-sky-500 to-cyan-600" },
    { name: "Manager: Generate Quote", icon: Calculator, href: "/labourhire/manager/generate/quote", color: "from-emerald-500 to-green-600" },
    { name: "Manager: Awards", icon: FileSignature, href: "/labourhire/manager/awards", color: "from-amber-500 to-orange-600" },
];

function resolveActionTo(action) {
    if (action?.href) return action.href;
    return createPageUrl(action.page);
}

// Shared menu renderer (same look and layout)
function QuickAddMenuBase({ label = "Add New", actions = [] }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200",
                    "text-slate-400 hover:text-white hover:bg-slate-800/50",
                    isOpen && "bg-blue-600/20 text-blue-400"
                )}
                type="button"
            >
                <Plus className={cn("h-5 w-5 transition-transform", isOpen && "rotate-45")} />
                <span className="font-medium">{label}</span>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 top-full mt-2 z-50 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                        {actions.map((action) => (
                            <Link
                                key={action.name}
                                to={resolveActionTo(action)}
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors"
                            >
                                <div className={cn("p-1.5 rounded-lg bg-gradient-to-br", action.color)}>
                                    <action.icon className="h-4 w-4 text-white" />
                                </div>
                                <span className="text-white text-sm">{action.name}</span>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// Exported explicit RTO menu (separate component, same UI)
export function RtoQuickAddMenu() {
    return <QuickAddMenuBase label="Add New" actions={rtoQuickActions} />;
}

// Default export keeps backwards compatibility
export default function QuickAddMenu() {
    const active = getActiveEntity();
    const entityType = useMemo(() => String(active?.type || "").toUpperCase(), [active?.type]);

    if (entityType === "RTO") return <RtoQuickAddMenu />;
    if (entityType === "LABOURHIRE") return <QuickAddMenuBase label="Add New" actions={labourhireQuickActions} />;

    return <QuickAddMenuBase label="Add New" actions={caseworkQuickActions} />;
}