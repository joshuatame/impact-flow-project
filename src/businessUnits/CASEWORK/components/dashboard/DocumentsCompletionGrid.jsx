import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Circle } from "lucide-react";
import { DOCUMENT_TYPES } from "@/constants/documentTypes";

function normalizeRaw(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9 ]/g, "");
}

/**
 * Returns the canonical DOCUMENT_TYPES label for a given input string,
 * or null if it cannot be mapped.
 */
function canonicalDocType(input, canonicalMap) {
    const key = normalizeRaw(input);

    // Fix known typos and common variations (extend as needed)
    const aliases = {
        "photo id": "Photo ID",
        "photoid": "Photo ID",
        "id": "Photo ID",

        "birth cert": "Birth Cert",
        "birth certificate": "Birth Cert",

        "residential address": "Residental Address", // your constant spelling
        "residental address": "Residental Address",
        "address": "Residental Address",

        "training certificate": "Training Certifcate", // your constant spelling
        "training cert": "Training Certifcate",
        "training certifcate": "Training Certifcate",

        "employment contract": "Employment Contract",
        "contract": "Employment Contract",

        "resume": "Resume",
        "isep": "ISEP",
        "program": "Program",
        "media": "Media",
        "consent": "Consent",
        "medical": "Medical",
        "reference": "Reference",
        "concession": "Concession",
        "other": "Other",
    };

    const aliasHit = aliases[key];
    if (aliasHit) return aliasHit;

    // Direct match to one of DOCUMENT_TYPES (after normalization)
    return canonicalMap.get(key) || null;
}

export default function DocumentsCompletionDashboardGrid({ filterMode = 'all', selectedProgramId = '', userId = null } = {}) {
    const queryClient = useQueryClient();

    const pageSize = 7;
    const [page, setPage] = useState(0);

    const [docTypeFilter, setDocTypeFilter] = useState("All");
    const [completionFilter, setCompletionFilter] = useState("All"); // All | Complete | Missing
    const [search, setSearch] = useState("");

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list(),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: () => queryClient.getQueryData(["participants"]) || [],
    });

    const { data: programEnrollments = [] } = useQuery({
        queryKey: ["enrollmentsByProgram", selectedProgramId],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.filter({ program_id: selectedProgramId }),
        enabled: filterMode === "program" && !!selectedProgramId,
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });


    const { data: documents = [], isLoading: loadingDocuments } = useQuery({
        queryKey: ["documentsAll"],
        queryFn: () => base44.entities.Document.list(),
        staleTime: 10 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        // optional safety net so tiles flip without manual refresh
        refetchInterval: 10 * 1000,
        placeholderData: () => queryClient.getQueryData(["documentsAll"]) || [],
    });

    const canonicalMap = useMemo(() => {
        // Map normalized DOCUMENT_TYPES -> canonical label
        const map = new Map();
        for (const t of DOCUMENT_TYPES) map.set(normalizeRaw(t), t);
        return map;
    }, []);

    const docsByParticipant = useMemo(() => {
        const map = new Map();
        for (const d of documents || []) {
            const pid = d?.linked_participant_id || d?.participant_id || null;
            if (!pid) continue;
            if (!map.has(pid)) map.set(pid, []);
            map.get(pid).push(d);
        }
        return map;
    }, [documents]);

    const completionForParticipant = (pid) => {
        const docs = docsByParticipant.get(pid) || [];
        const completedCanonical = new Set();

        for (const d of docs) {
            const canonical = canonicalDocType(d?.category, canonicalMap);
            if (canonical) completedCanonical.add(canonical);
        }

        const res = {};
        for (const t of DOCUMENT_TYPES) res[t] = completedCanonical.has(t);
        return res;
    };

    useEffect(() => {
        setPage(0);
    }, [docTypeFilter, selectedProgramId, search]);

    const filteredParticipants = useMemo(() => {
        const s = search.trim().toLowerCase();

        let allowedIds = null;
        if (filterMode === "my" && userId) {
            allowedIds = new Set(
                (participants || [])
                    .filter((p) => p.primary_case_worker_id === userId)
                    .map((p) => p.id)
            );
        } else if (filterMode === "program" && selectedProgramId) {
            allowedIds = new Set((programEnrollments || []).map((e) => e.participant_id));
        }

        return (participants || []).filter((p) => {
            if (allowedIds && !allowedIds.has(p.id)) return false;

            const name = `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase();
            if (s && !name.includes(s)) return false;

            if (docTypeFilter === "All") return true;

            const grid = completionForParticipant(p.id);
            const done = !!grid[docTypeFilter];

            if (completionFilter === "Complete") return done;
            if (completionFilter === "Missing") return !done;
            return true;
        });
    }, [participants, programEnrollments, userId, filterMode, selectedProgramId, search, docTypeFilter, completionFilter, docsByParticipant]);

    const pageCount = Math.max(1, Math.ceil(((filteredParticipants || []).length) / pageSize));
    const safePage = Math.min(page, pageCount - 1);
    const startIdx = safePage * pageSize;
    const endIdx = startIdx + pageSize;
    const pagedParticipants = (filteredParticipants || []).slice(startIdx, endIdx);

    useEffect(() => {
        if (page !== safePage) setPage(safePage);
    }, [page, safePage]);

   


    if (loadingParticipants || loadingDocuments) return null;

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-white font-semibold">Documents Completion - All Participants</h3>
                    <p className="text-sm text-slate-400">Filter by document type and completion state.</p>
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
                        {DOCUMENT_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
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
                            <th className="text-left text-slate-300 font-medium p-3 border-b border-slate-800">
                                Participant
                            </th>
                            {DOCUMENT_TYPES.map((t) => (
                                <th
                                    key={t}
                                    className="text-left text-slate-300 font-medium p-3 border-b border-slate-800"
                                >
                                    {t}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody>
                        {pagedParticipants.map((p) => {
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
                                                <div
                                                    className={`inline-flex items-center gap-2 ${ok ? "text-emerald-400" : "text-slate-500"
                                                        }`}
                                                >
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


{filteredParticipants.length > 0 && (
    <div className="flex items-center justify-between mt-3">
        <div className="text-xs text-slate-400">
            Showing {Math.min(filteredParticipants.length, startIdx + 1)}–{Math.min(filteredParticipants.length, endIdx)} of {filteredParticipants.length}
        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="px-3 py-1 rounded-md border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                disabled={safePage === 0}
                            >
                                Previous
                            </button>

                            <div className="text-xs text-slate-400 px-2">
                                Page {safePage + 1} / {pageCount}
                            </div>

                            <button
                                type="button"
                                className="px-3 py-1 rounded-md border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
                                onClick={() =>
                                    setPage((p) => ((p + 1) * pageSize >= filteredParticipants.length ? p : p + 1))
                                }
                                disabled={(safePage + 1) * pageSize >= filteredParticipants.length}
                            >
                                Next
                            </button>
                        </div>

    </div>
)}
            </div>
        </div>
    );
}
