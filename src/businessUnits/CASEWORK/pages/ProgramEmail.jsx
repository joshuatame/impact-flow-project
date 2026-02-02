// src/pages/ProgramEmail.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Search, Users, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmailComposerDialog from "@/components/email/EmailComposerDialog.jsx";

// small helper
function isValidEmail(s) {
    const v = String(s || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function safeGetProgram(id) {
    if (!id) return null;
    try {
        // if your base44 supports .get
        const doc = await base44.entities.Program.get(id);
        return doc || null;
    } catch (_) {
        try {
            const list = await base44.entities.Program.filter({ id });
            return Array.isArray(list) && list.length ? list[0] : null;
        } catch (_) {
            return null;
        }
    }
}

export default function ProgramEmail() {
    const urlParams = new URLSearchParams(window.location.search);
    const programId = urlParams.get("id");

    const [emailOpen, setEmailOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedIds, setSelectedIds] = useState(() => new Set());

    const { data: program, isLoading: loadingProgram } = useQuery({
        queryKey: ["program", programId],
        queryFn: () => safeGetProgram(programId),
        enabled: !!programId,
        staleTime: 60_000,
    });

    const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
        queryKey: ["enrollments", programId],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.filter({ program_id: programId }),
        enabled: !!programId,
        staleTime: 30_000,
    });

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 5000),
        staleTime: 60_000,
    });

    const enrolled = useMemo(() => {
        const ids = new Set((enrollments || []).map((e) => String(e.participant_id || "")).filter(Boolean));
        return (participants || [])
            .filter((p) => ids.has(String(p.id)))
            .map((p) => ({
                id: String(p.id),
                name: `${String(p.first_name || "").trim()} ${String(p.last_name || "").trim()}`.trim() || "Participant",
                email: String(p.contact_email || "").trim(),
                status: String(p.status || ""),
            }))
            .filter((p) => isValidEmail(p.email)); // only those we can email
    }, [enrollments, participants]);

    const filtered = useMemo(() => {
        const q = String(search || "").trim().toLowerCase();
        if (!q) return enrolled;
        return enrolled.filter((r) => (r.name + " " + r.email).toLowerCase().includes(q));
    }, [enrolled, search]);

    const selectedRecipients = useMemo(() => {
        const set = selectedIds;
        return enrolled.filter((r) => set.has(r.id));
    }, [enrolled, selectedIds]);

    const toList = useMemo(() => selectedRecipients.map((r) => r.email), [selectedRecipients]);

    const toggle = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllFiltered = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            filtered.forEach((r) => next.add(r.id));
            return next;
        });
    };

    const clearAll = () => setSelectedIds(new Set());

    if (loadingProgram) return <LoadingSpinner />;

    if (!program) {
        return (
            <div className="p-6">
                <div className="text-slate-300">Program not found.</div>
                <Link to={createPageUrl("Programs")}>
                    <Button variant="outline" className="mt-4">
                        Back to Programs
                    </Button>
                </Link>
            </div>
        );
    }

    const busy = loadingEnrollments || loadingParticipants;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <EmailComposerDialog
                open={emailOpen}
                onOpenChange={setEmailOpen}
                mode="program"
                programId={programId}
                participantIds={Array.from(selectedIds)}
                defaultSubject={`Update re: ${String(program.program_name || "Program")}`}
            />

            <div className="mb-6">
                <Link
                    to={createPageUrl(`ProgramDetail?id=${programId}`)}
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Program
                </Link>

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
                            <Mail className="h-6 w-6" />
                            Email Program Participants
                        </h1>
                        <div className="text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                            <span>{program.program_name}</span>
                            <Badge className="bg-slate-800/60 text-slate-300 border border-slate-700/60">
                                {enrolled.length} emailable
                            </Badge>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="border-slate-700 hover:bg-slate-800"
                            onClick={selectAllFiltered}
                            disabled={busy || filtered.length === 0}
                        >
                            Select all shown
                        </Button>
                        <Button
                            variant="outline"
                            className="border-slate-700 hover:bg-slate-800"
                            onClick={clearAll}
                            disabled={busy || selectedIds.size === 0}
                        >
                            Clear
                        </Button>

                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => setEmailOpen(true)}
                            disabled={busy || toList.length === 0}
                        >
                            Compose ({toList.length})
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or email..."
                            className="pl-9 bg-slate-800 border-slate-700 text-white"
                        />
                    </div>

                    <div className="text-sm text-slate-400 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Selected: <span className="text-white font-semibold">{toList.length}</span>
                    </div>
                </div>

                {busy ? (
                    <div className="py-10">
                        <LoadingSpinner />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-slate-400 py-6">No emailable participants found.</div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((r) => {
                            const checked = selectedIds.has(r.id);
                            return (
                                <div
                                    key={r.id}
                                    className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700/60 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <div className="text-white font-medium truncate">{r.name}</div>
                                        <div className="text-slate-400 text-sm truncate">{r.email}</div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {checked ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : null}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 hover:bg-slate-800"
                                            onClick={() => toggle(r.id)}
                                        >
                                            {checked ? "Selected" : "Select"}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
