import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Search } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeOutcome(v) {
    return safeText(v).trim().toLowerCase().replace(/\s+/g, " ");
}

function isInProgressOutcome(v) {
    const n = normalizeOutcome(v);
    return n === "in progress" || n === "in-progress" || n === "inprogress" || n.includes("progress");
}

function isCompletedLike(v) {
    const n = normalizeOutcome(v);
    return (
        n === "completed" ||
        n === "complete" ||
        n === "withdrawn" ||
        n === "incomplete" ||
        n === "cancelled" ||
        n === "canceled"
    );
}

// tolerant "in progress" logic
function isEnrollmentInProgress(e) {
    const outcomeOrStatus = e?.outcome ?? e?.status ?? "";
    const completionDate = safeText(e?.completion_date).trim();

    if (isInProgressOutcome(outcomeOrStatus)) return true;
    if (!completionDate && !isCompletedLike(outcomeOrStatus)) return true;

    return false;
}

function participantFullName(p) {
    const fn = safeText(p?.first_name).trim();
    const ln = safeText(p?.last_name).trim();
    const full = `${fn} ${ln}`.trim();
    return full || safeText(p?.full_name).trim() || "Unknown";
}

function todayISO() {
    return new Date().toISOString().split("T")[0];
}

// Your rule: level drives DEX outcome
function dexOutcomeFromTrainingLevel(level) {
    const v = safeText(level).toLowerCase().trim();

    if (v.includes("non")) return "Training Outcome Achieved - Non Accredited";
    if (v.includes("short")) return "Training Outcome Achieved - Short Course";

    // Certificate I-IV, Diploma, Adv Diploma, Uni -> Long Course
    if (
        v.includes("certificate") ||
        v.includes("cert ") ||
        v.includes("certi") ||
        v.includes("diploma") ||
        v.includes("advanced diploma") ||
        v.includes("university")
    ) {
        return "Training Outcome Achieved - Long Course";
    }

    // default if unknown
    return "Training Outcome Achieved - Short Course";
}

const BULK_OUTCOME_OPTIONS = ["Completed", "Withdrawn", "Incomplete", "Cancelled"];

export default function TrainingBulkComplete() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");

    // bulk controls
    const [bulkOutcome, setBulkOutcome] = useState("Completed");
    const [bulkCompletionDate, setBulkCompletionDate] = useState(() => todayISO());

    const { data: trainings = [], isLoading: isLoadingTrainings } = useQuery({
        queryKey: ["trainingActivitiesAll"],
        queryFn: () => base44.entities.TrainingActivity.list("-created_date", 2000),
    });

    // Load all enrollments so we can tolerate db variations
    const { data: allEnrollments = [], isLoading: isLoadingEnrollments } = useQuery({
        queryKey: ["participantTrainingAllForBulk"],
        queryFn: () => base44.entities.ParticipantTraining.list("-enrollment_date", 5000),
    });

    const { data: participants = [], isLoading: isLoadingParticipants } = useQuery({
        queryKey: ["participantsAllForBulk"],
        queryFn: () => base44.entities.Participant.list("-created_date", 5000),
    });

    const participantsById = useMemo(() => {
        const m = new Map();
        (participants || []).forEach((p) => m.set(p.id, p));
        return m;
    }, [participants]);

    const trainingById = useMemo(() => {
        const m = new Map();
        (trainings || []).forEach((t) => m.set(t.id, t));
        return m;
    }, [trainings]);

    const outcomeCounts = useMemo(() => {
        const counts = new Map();
        for (const e of allEnrollments || []) {
            const key = safeText(e?.outcome || e?.status || "Unknown").trim() || "Unknown";
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    }, [allEnrollments]);

    // tolerant in-progress rows
    const enrollmentsInProgress = useMemo(() => {
        return (allEnrollments || []).filter(isEnrollmentInProgress);
    }, [allEnrollments]);

    const rows = useMemo(() => {
        const s = safeText(search).toLowerCase().trim();

        return (enrollmentsInProgress || [])
            .map((e) => {
                const t = trainingById.get(e.training_activity_id);
                const p = participantsById.get(e.participant_id);
                const name = participantFullName(p);

                return {
                    enrollment: e,
                    training: t,
                    key: e.id,
                    participant_id: e.participant_id,
                    participant_name: name,
                    training_activity_id: e.training_activity_id,
                    training_name: safeText(t?.training_name || t?.title || "Training"),
                    level_of_training: safeText(t?.level_of_training || ""),
                };
            })
            .filter((r) => {
                if (!s) return true;
                return (
                    r.training_name.toLowerCase().includes(s) ||
                    safeText(r.participant_id).toLowerCase().includes(s) ||
                    safeText(r.participant_name).toLowerCase().includes(s)
                );
            });
    }, [enrollmentsInProgress, trainingById, participantsById, search]);

    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.key));

    const toggleAll = () => {
        setSelectedIds((prev) => {
            if (allSelected) return new Set();
            const next = new Set(prev);
            rows.forEach((r) => next.add(r.key));
            return next;
        });
    };

    const toggleOne = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const completeMutation = useMutation({
        mutationFn: async () => {
            const toUpdate = rows.filter((r) => selectedIds.has(r.key));
            if (toUpdate.length === 0) return;

            const outcomeToApply = bulkOutcome || "Completed";
            const completionDateToApply = bulkCompletionDate || todayISO();

            const user = await base44.auth.me().catch(() => null);

            const touchedTrainingActivityIds = new Set();
            const isBulkCompleted = normalizeOutcome(outcomeToApply) === "completed";

            // 1) Update ParticipantTraining enrollments
            for (const row of toUpdate) {
                const enrollment = row.enrollment;
                const training = row.training;

                if (row.training_activity_id) touchedTrainingActivityIds.add(row.training_activity_id);

                const patch = { outcome: outcomeToApply };

                // if outcome is NOT in progress, set completion date
                if (!isInProgressOutcome(outcomeToApply)) {
                    patch.completion_date = completionDateToApply;
                } else {
                    // If someone ever sets back to in progress, clear completion
                    patch.completion_date = null;
                }

                await base44.entities.ParticipantTraining.update(enrollment.id, patch);

                // DO NOT change participant phase (per your rule: stay Training until employment/exit)

                // DEX outcome only when Completed
                if (!isBulkCompleted) continue;

                const programId = training?.program_id || null;
                if (!programId) continue;

                const enrollmentInProgram = await base44.entities.ParticipantProgramEnrollment.filter({
                    participant_id: enrollment.participant_id,
                    program_id: programId,
                });

                const ppe = (enrollmentInProgram || [])[0];
                if (!ppe?.is_dex_reportable_program) continue;

                const activityType = dexOutcomeFromTrainingLevel(training?.level_of_training);

                try {
                    await base44.entities.DEXActivityRecord.create({
                        participant_id: enrollment.participant_id,
                        participant_name: row.participant_name,
                        program_id: programId,
                        case_location: ppe?.dex_case_location || null,
                        service_setting: null,
                        activity_date: completionDateToApply,
                        reference_entity_type: "ParticipantTraining",
                        reference_entity_id: enrollment.id,
                        activity_type: activityType,
                        details: {
                            training_activity_id: training?.id || null,
                            training_name: row.training_name,
                            level_of_training: training?.level_of_training || null,
                            outcome: outcomeToApply,
                        },
                        recorded_by_id: user?.id || null,
                        recorded_by_name: user?.full_name || null,
                        recorded_by_email: user?.email || null,
                    });
                } catch (e) {
                    console.warn("DEX outcome create failed (non-blocking)", e);
                }
            }

            // 2) Update TrainingActivity.status to Completed when appropriate
            // Only do this when bulk outcome is Completed and no enrollments remain in progress for that activity
            if (normalizeOutcome(outcomeToApply) === "completed") {
                for (const taId of Array.from(touchedTrainingActivityIds)) {
                    try {
                        const enrollmentsForActivity = await base44.entities.ParticipantTraining.filter(
                            { training_activity_id: taId },
                            "-enrollment_date",
                            5000
                        );

                        const anyStillInProgress = (enrollmentsForActivity || []).some(isEnrollmentInProgress);

                        if (!anyStillInProgress) {
                            const existing = trainingById.get(taId) || null;
                            await base44.entities.TrainingActivity.update(taId, {
                                status: "Completed",
                                end_date: safeText(existing?.end_date) || completionDateToApply,
                            });
                        }
                    } catch (e) {
                        console.warn("TrainingActivity completion update failed (non-blocking)", e);
                    }
                }
            }
        },
        onSuccess: async () => {
            setSelectedIds(new Set());
            await queryClient.invalidateQueries({ queryKey: ["participantTrainingAllForBulk"] });
            await queryClient.invalidateQueries({ queryKey: ["participantTrainings"] });
            await queryClient.invalidateQueries({ queryKey: ["ParticipantTraining"] });
            await queryClient.invalidateQueries({ queryKey: ["DEXActivityRecord"] });
            await queryClient.invalidateQueries({ queryKey: ["trainingActivitiesAll"] });
            await queryClient.invalidateQueries({ queryKey: ["trainingActivities"] });
            await queryClient.invalidateQueries({ queryKey: ["TrainingActivity"] });
            await queryClient.invalidateQueries({ queryKey: ["participantsAllForBulk"] });
            await queryClient.invalidateQueries({ queryKey: ["participants"] });
            await queryClient.invalidateQueries({ queryKey: ["participant"] });
        },
    });

    const isLoading = isLoadingTrainings || isLoadingEnrollments || isLoadingParticipants;

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link to={createPageUrl("Trainings")}>
                        <Button variant="ghost" className="gap-2" type="button">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Button>
                    </Link>
                    <h1 className="text-xl font-semibold text-white">Bulk Complete Trainings</h1>
                </div>

                <Button
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending || selectedIds.size === 0}
                    className="gap-2"
                    type="button"
                >
                    <CheckCircle2 className="h-4 w-4" />
                    Apply ({selectedIds.size})
                </Button>
            </div>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white text-sm">Bulk action</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <div className="text-slate-300 text-sm mb-2">Outcome (default Completed)</div>
                        <Select value={bulkOutcome} onValueChange={setBulkOutcome}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                {BULK_OUTCOME_OPTIONS.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                        {opt}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <div className="text-slate-300 text-sm mb-2">Completion date</div>
                        <Input
                            type="date"
                            value={bulkCompletionDate}
                            onChange={(e) => setBulkCompletionDate(e.target.value)}
                            className="bg-slate-800 border-slate-700 text-white"
                            disabled={isInProgressOutcome(bulkOutcome)}
                        />
                        {isInProgressOutcome(bulkOutcome) ? (
                            <div className="text-xs text-slate-500 mt-1">Disabled for In Progress</div>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white text-sm">Outcome counts</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-slate-400 text-sm">Loading...</div>
                    ) : outcomeCounts.length === 0 ? (
                        <div className="text-slate-400 text-sm">No ParticipantTraining records found.</div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {outcomeCounts.slice(0, 12).map(([k, v]) => (
                                <span
                                    key={k}
                                    className="px-2 py-1 rounded-md text-xs border border-slate-800 bg-slate-950 text-slate-200"
                                >
                                    {k}: {v}
                                </span>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <Search className="h-4 w-4" /> Filter
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by training name or participant..."
                        className="bg-slate-800 border-slate-700 text-white"
                    />
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">In Progress</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <LoadingSpinner />
                    ) : rows.length === 0 ? (
                        <p className="text-slate-300">
                            No in-progress trainings found.
                            <span className="block text-slate-500 text-sm mt-1">
                                Check “Outcome counts” above to confirm your stored values.
                            </span>
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                                <div className="text-slate-300 text-sm">Select All</div>
                            </div>

                            {rows.map((r) => (
                                <div
                                    key={r.key}
                                    className="flex items-start gap-3 p-3 rounded-md border border-slate-800 bg-slate-950"
                                >
                                    <Checkbox checked={selectedIds.has(r.key)} onCheckedChange={() => toggleOne(r.key)} />
                                    <div className="flex-1">
                                        <div className="text-white font-medium">{r.participant_name}</div>
                                        <div className="text-slate-300 text-sm mt-1">{r.training_name}</div>
                                        <div className="text-slate-400 text-sm">
                                            Level: {safeText(r.level_of_training) || "—"}
                                        </div>
                                    
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
