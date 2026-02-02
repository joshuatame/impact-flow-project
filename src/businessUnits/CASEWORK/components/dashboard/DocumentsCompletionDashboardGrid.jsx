import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Circle } from "lucide-react";

import { DOCUMENT_TYPES } from "@/constants/documentTypes";

function normalize(s) {
    return String(s || "").trim().toLowerCase();
}

export default function DocumentsCompletionDashboardGrid() {
    const [docTypeFilter, setDocTypeFilter] = useState("All");
    const [completionFilter, setCompletionFilter] = useState("All"); // All | Complete | Missing
    const [search, setSearch] = useState("");

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list(),
    });

    const { data: documents = [], isLoading: loadingDocuments } = useQuery({
        queryKey: ["documentsAll"],
        queryFn: () => base44.entities.Document.list(),
    });

    const docsByParticipant = useMemo(() => {
        const map = new Map();
        for (const d of documents || []) {
            const pid = d?.linked_participant_id;
            if (!pid) continue;
            if (!map.has(pid)) map.set(pid, []);
            map.get(pid).push(d);
        }
        return map;
    }, [documents]);

    const completionForParticipant = (pid) => {
        const docs = docsByParticipant.get(pid) || [];
        const set = new Set(docs.map(d => normalize(d?.category)));
        const res = {};
        for (const t of DOCUMENT_TYPES) res[t] = set.has(normalize(t));
        return res;
    };

    const filteredParticipants = useMemo(() => {
        const s = search.trim().toLowerCase();

        return (participants || []).filter(p => {
            const name = `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase();
            if (s && !name.includes(s)) return false;

            if (docTypeFilter === "All") return true;

            const grid = completionForParticipant(p.id);
            const done = !!grid[docTypeFilter];

            if (completionFilter === "Complete") return done;
            if (completionFilter === "Missing") return !done;
            return true;
        });
    }, [participants, search, docTypeFilter, completionFilter, docsByParticipant]);

    if (loadingParticipants || loadingDocuments) return null;

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-white font-semibold">Documents Completion - All Participants</h3>
                    <p className="text-sm text-slate-400">
                        Filter by document type and completion state.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 px-3 rounded-lg bg-slate-950/50 border border-slate-800 text-white"
                        placeholder="Search participant..."
                    />

                    <select
                        value={docTypeFilter}
                        onChange={(e) => setDocTypeFilter(e.target.value)}
                        className="h-9 px-3 rounded-lg bg-slate-950/50 border border-slate-800 text-white"
                    >
                        <option value="All">All document types</option>
                        {DOCUMENT_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>

                    <select
                        value={completionFilter}
                        onChange={(e) => setCompletionFilter(e.target.value)}
                        className="h-9 px-3 rounded-lg bg-slate-950/50 border border-slate-800 text-white"
                    >
                        <option value="All">All</option>
                        <option value="Complete">Complete</option>
                        <option value="Missing">Missing</option>
                    </select>
                </div>
            </div>

            <div className="overflow-auto border border-slate-800 rounded-xl">
                <table className="min-w-[1100px] w-full text-sm">
                    <thead className="bg-slate-950/40">
                        <tr>
                            <th className="text-left text-slate-300 font-medium p-3 border-b border-slate-800">Participant</th>
                            {DOCUMENT_TYPES.map((t) => (
                                <th key={t} className="text-left text-slate-300 font-medium p-3 border-b border-slate-800">
                                    {t}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {filteredParticipants.map((p) => {
                            const grid = completionForParticipant(p.id);
                            const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unnamed";

                            return (
                                <tr key={p.id} className="hover:bg-slate-800/30">
                                    <td className="p-3 text-white border-b border-slate-800">{name}</td>
                                    {DOCUMENT_TYPES.map((t) => {
                                        const ok = !!grid[t];
                                        const Icon = ok ? CheckCircle2 : Circle;
                                        return (
                                            <td key={t} className="p-3 border-b border-slate-800">
                                                <div className={`inline-flex items-center gap-2 ${ok ? "text-emerald-400" : "text-slate-500"}`}>
                                                    <Icon className="h-4 w-4" />
                                                    <span>{ok ? "Yes" : "No"}</span>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}

                        {filteredParticipants.length === 0 ? (
                            <tr>
                                <td className="p-4 text-slate-400" colSpan={DOCUMENT_TYPES.length + 1}>
                                    No participants match the current filters.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
