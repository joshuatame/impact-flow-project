import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, GraduationCap, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

const TRAINING_LEVEL_OPTIONS = [
    "Non Accredited",
    "Short Course",
    "Certificate I",
    "Certificate II",
    "Certificate III",
    "Certificate IV",
    "Diploma",
    "Advanced Diploma",
    "University Degree",
];

function dexOutcomeFromTrainingLevel(level) {
    const v = (level || "").toString().toLowerCase();
    if (v.includes("non")) return "Training Outcome achieved - Non accredited";
    if (v.includes("short")) return "Training Outcome achieved - Short Course";
    return "Training Outcome achieved - Long Course";
}

function isActiveParticipant(p) {
    const s = (p?.status || "").toString().trim().toLowerCase();
    if (!s) return true;
    return s === "active";
}
function safeName(p) {
    const fn = (p?.first_name || "").toString().trim();
    const ln = (p?.last_name || "").toString().trim();
    const full = `${fn} ${ln}`.trim();
    return full || p?.full_name || "Unnamed";
}
function todayISO() {
    return new Date().toISOString().split("T")[0];
}

async function inferNextPhaseAfterTraining(participantId) {
    // If they have an active employment placement, move to Employment, otherwise Pre Employment Support
    try {
        const placements = await base44.entities.EmploymentPlacement.filter(
            { participant_id: participantId },
            "-created_date",
            50
        );
        const hasActive = (placements || []).some(
            (e) => String(e?.status || "").toLowerCase().trim() === "active"
        );
        return hasActive ? "Employment" : "Pre Employment Support";
    } catch {
        return "Pre Employment Support";
    }
}

// NEW: fetch dex hub location from participant's program enrollment
async function getDexCaseLocationForParticipantProgram(participantId, programId) {
    if (!participantId || !programId) return null;
    try {
        const rows = await base44.entities.ParticipantProgramEnrollment.filter({
            participant_id: participantId,
            program_id: programId,
        });
        const ppe = (rows || [])[0] || null;
        const loc = (ppe?.dex_case_location || "").toString().trim();
        return loc || null;
    } catch {
        return null;
    }
}

/**
 * TrainingForm
 * - creates/edits TrainingActivity
 * - on create, enrolls selected participants into ParticipantTraining
 * - on edit (when participant context exists), also updates ParticipantTraining outcome/completion_date/notes
 */
export default function TrainingForm({
    embedded = false,
    participantId: embeddedParticipantId = "",
    trainingId: embeddedTrainingId = "",
    participantTrainingId: embeddedParticipantTrainingId = "",
    onClose,
    onSaved,
} = {}) {
    const queryClient = useQueryClient();

    const urlParams = new URLSearchParams(window.location.search);
    const trainingId = embedded ? embeddedTrainingId : urlParams.get("id");
    const preselectedParticipantId = embedded ? embeddedParticipantId : urlParams.get("participant_id");

    const participantTrainingId = embedded
        ? embeddedParticipantTrainingId
        : urlParams.get("participant_training_id");

    const isEditing = !!trainingId;

    const [participantSearch, setParticipantSearch] = useState("");

    const [selectedParticipantIds, setSelectedParticipantIds] = useState(() => {
        return preselectedParticipantId ? [preselectedParticipantId] : [];
    });

    const [formData, setFormData] = useState({
        training_name: "",
        level_of_training: "Short Course",
        provider_name: "",
        qualification_code: "",
        qualification_title: "",
        start_date: "",
        end_date: "",
        location: "",
        delivery_mode: "Face to Face",
        status: "Planned",
        program_id: "",
    });

    // Enrollment editing fields (only relevant when a single participant context exists)
    const [enrollmentData, setEnrollmentData] = useState({
        outcome: "In Progress",
        completion_date: "",
        result_notes: "",
    });

    const effectiveSingleParticipantId = useMemo(() => {
        // If opened from ParticipantTraining modal or participant_id query param, treat as single participant edit context
        return embeddedParticipantId || preselectedParticipantId || "";
    }, [embeddedParticipantId, preselectedParticipantId]);

    const { data: existingTraining, isLoading: loadingTraining } = useQuery({
        queryKey: ["trainingActivity", trainingId],
        queryFn: () => base44.entities.TrainingActivity.get(trainingId),
        enabled: isEditing,
    });

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 5000),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 2000),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Load the ParticipantTraining enrollment we want to edit (if any)
    const { data: existingEnrollment, isLoading: loadingEnrollment } = useQuery({
        queryKey: ["participantTraining", participantTrainingId || `${effectiveSingleParticipantId}::${trainingId}`],
        queryFn: async () => {
            if (!isEditing) return null;
            if (!effectiveSingleParticipantId) return null;

            // If we were given the enrollment id directly, use it
            if (participantTrainingId) {
                return await base44.entities.ParticipantTraining.get(participantTrainingId);
            }

            // Otherwise find it by participant + training_activity_id
            const rows = await base44.entities.ParticipantTraining.filter({
                participant_id: effectiveSingleParticipantId,
                training_activity_id: trainingId,
            });
            return (rows || [])[0] || null;
        },
        enabled: isEditing && !!effectiveSingleParticipantId,
    });

    useEffect(() => {
        if (!existingTraining) return;
        setFormData({
            training_name: existingTraining.training_name || "",
            level_of_training: existingTraining.level_of_training || "Short Course",
            provider_name: existingTraining.provider_name || "",
            qualification_code: existingTraining.qualification_code || "",
            qualification_title: existingTraining.qualification_title || "",
            start_date: existingTraining.start_date || "",
            end_date: existingTraining.end_date || "",
            location: existingTraining.location || "",
            delivery_mode: existingTraining.delivery_mode || "Face to Face",
            status: existingTraining.status || "Planned",
            program_id: existingTraining.program_id || "",
        });
    }, [existingTraining]);

    useEffect(() => {
        if (!existingEnrollment) return;
        setEnrollmentData({
            outcome: existingEnrollment.outcome || "In Progress",
            completion_date: existingEnrollment.completion_date || "",
            result_notes: existingEnrollment.result_notes || "",
        });
    }, [existingEnrollment]);

    useEffect(() => {
        if (!embedded) return;
        if (embeddedParticipantId) setSelectedParticipantIds([embeddedParticipantId]);
    }, [embedded, embeddedParticipantId]);

    const activeParticipants = useMemo(() => {
        const s = participantSearch.trim().toLowerCase();
        return (participants || [])
            .filter(isActiveParticipant)
            .filter((p) => (!s ? true : safeName(p).toLowerCase().includes(s)))
            .sort((a, b) => safeName(a).localeCompare(safeName(b)));
    }, [participants, participantSearch]);

    const updateField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));
    const updateEnrollment = (field, value) => setEnrollmentData((prev) => ({ ...prev, [field]: value }));

    const showParticipantPicker = !embedded && !preselectedParticipantId && !isEditing;

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            const user = await base44.auth.me().catch(() => null);

            const payload = {
                training_name: data.training_name || "",
                level_of_training: data.level_of_training || "Short Course",
                provider_name: data.provider_name || "",
                qualification_code: data.qualification_code || "",
                qualification_title: data.qualification_title || "",
                start_date: data.start_date || "",
                end_date: data.end_date || "",
                location: data.location || "",
                delivery_mode: data.delivery_mode || "Face to Face",
                status: data.status || "Planned",
                program_id: data.program_id || null,
            };

            // EDIT MODE
            if (isEditing) {
                const updated = await base44.entities.TrainingActivity.update(trainingId, payload);

                // If we have a single participant context and an enrollment, update it too
                if (effectiveSingleParticipantId && existingEnrollment?.id) {
                    const newOutcome = enrollmentData.outcome || "In Progress";
                    const completionDate =
                        enrollmentData.completion_date ||
                        (newOutcome !== "In Progress" ? payload.end_date || todayISO() : "");

                    await base44.entities.ParticipantTraining.update(existingEnrollment.id, {
                        outcome: newOutcome,
                        completion_date: completionDate || null,
                        result_notes: enrollmentData.result_notes || "",
                    });

                    // If moved out of Training, update participant phase
                    if (newOutcome !== "In Progress") {
                        const nextPhase = await inferNextPhaseAfterTraining(effectiveSingleParticipantId);

                        try {
                            const p = await base44.entities.Participant.get(effectiveSingleParticipantId);
                            const current = String(p?.current_phase || "").trim();
                            if (current.toLowerCase() === "training") {
                                await base44.entities.Participant.update(effectiveSingleParticipantId, {
                                    current_phase: nextPhase,
                                });
                            }
                        } catch (e) {
                            console.warn("Participant phase update failed (non-blocking)", e);
                        }

                        // DEX outcome record (non-blocking) if program linked
                        try {
                            if (payload.program_id && newOutcome === "Completed") {
                                const p = (participants || []).find((x) => x.id === effectiveSingleParticipantId);
                                const participantName = p ? safeName(p) : null;

                                const caseLocation = await getDexCaseLocationForParticipantProgram(
                                    effectiveSingleParticipantId,
                                    payload.program_id
                                );

                                await base44.entities.DEXActivityRecord.create({
                                    participant_id: effectiveSingleParticipantId,
                                    participant_name: participantName,
                                    program_id: payload.program_id,
                                    activity_type: dexOutcomeFromTrainingLevel(payload.level_of_training),
                                    activity_date: completionDate || todayISO(),
                                    reference_entity_type: "ParticipantTraining",
                                    reference_entity_id: existingEnrollment.id,
                                    case_location: caseLocation,
                                    service_setting: null,
                                    details: {
                                        training_name: payload.training_name,
                                        provider: payload.provider_name,
                                        qualification: payload.qualification_title,
                                        level_of_training: payload.level_of_training,
                                    },
                                    recorded_by_id: user?.id || null,
                                    recorded_by_name: user?.full_name || null,
                                    recorded_by_email: user?.email || null,
                                });
                            }
                        } catch (e) {
                            console.warn("DEX training outcome record failed (non-blocking)", e);
                        }
                    }
                }

                return { id: trainingId, updated };
            }

            // CREATE MODE
            const created = await base44.entities.TrainingActivity.create(payload);
            const trainingActivityId = created?.id;

            const ids = (selectedParticipantIds || []).filter(Boolean);
            if (!ids.length) throw new Error("At least one participant must be selected.");

            for (const pid of ids) {
                const enrollmentDate = data.start_date || todayISO();

                const enrollment = await base44.entities.ParticipantTraining.create({
                    participant_id: pid,
                    training_activity_id: trainingActivityId,
                    enrollment_date: enrollmentDate,
                    outcome: "In Progress",
                    completion_date: null,
                    result_notes: "",
                });

                try {
                    if (data.program_id) {
                        const p = (participants || []).find((x) => x.id === pid);
                        const participantName = p ? safeName(p) : null;

                        const caseLocation = await getDexCaseLocationForParticipantProgram(pid, data.program_id);

                        await base44.entities.DEXActivityRecord.create({
                            participant_id: pid,
                            participant_name: participantName,
                            program_id: data.program_id,
                            activity_type: "Training Commenced",
                            activity_date: enrollmentDate,
                            reference_entity_type: "ParticipantTraining",
                            reference_entity_id: enrollment?.id,
                            case_location: caseLocation,
                            service_setting: null,
                            details: {
                                training_name: data.training_name,
                                provider: data.provider_name,
                                qualification: data.qualification_title,
                            },
                            recorded_by_id: user?.id || null,
                            recorded_by_name: user?.full_name || null,
                            recorded_by_email: user?.email || null,
                        });
                    }
                } catch (e) {
                    console.warn("DEX training record failed (non-blocking)", e);
                }

                try {
                    await base44.entities.Participant.update(pid, { current_phase: "Training" });
                } catch (e) {
                    console.warn("Participant phase update failed (non-blocking)", e);
                }
            }

            return { id: trainingActivityId };
        },

        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["trainingActivities"] });
            queryClient.invalidateQueries({ queryKey: ["trainingActivitiesAll"] });
            queryClient.invalidateQueries({ queryKey: ["participantTrainings"] });
            queryClient.invalidateQueries({ queryKey: ["ParticipantTraining"] });
            queryClient.invalidateQueries({ queryKey: ["DEXActivityRecord"] });
            queryClient.invalidateQueries({ queryKey: ["participant"] });

            onSaved?.(res);

            if (embedded) {
                onClose?.();
                return;
            }

            if (preselectedParticipantId) {
                window.location.href = createPageUrl(`ParticipantDetail?id=${preselectedParticipantId}`);
            } else {
                window.location.href = createPageUrl("Dashboard");
            }
        },
    });

    if (
        (isEditing && loadingTraining) ||
        loadingParticipants ||
        loadingPrograms ||
        (isEditing && effectiveSingleParticipantId && loadingEnrollment)
    ) {
        return <LoadingSpinner />;
    }
    return (
        <div className={embedded ? "p-0" : "p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto"}>
            {!embedded && (
                <Link
                    to={createPageUrl("Dashboard")}
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            )}

            {!embedded && (
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
                    {isEditing ? "Edit Training Activity" : "New Training Activity"}
                </h1>
            )}

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    saveMutation.mutate(formData);
                }}
                className={embedded ? "space-y-6 p-4" : "space-y-6"}
            >
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <GraduationCap className="h-5 w-5" />
                            Training Details
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Training Name *</Label>
                                <Input
                                    value={formData.training_name}
                                    onChange={(e) => updateField("training_name", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Provider</Label>
                                <Input
                                    value={formData.provider_name}
                                    onChange={(e) => updateField("provider_name", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300">Level of Training *</Label>
                            <Select
                                value={formData.level_of_training || "Short Course"}
                                onValueChange={(v) => updateField("level_of_training", v)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                    <SelectValue placeholder="Select level" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                    {TRAINING_LEVEL_OPTIONS.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                            {opt}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Qualification Code</Label>
                                <Input
                                    value={formData.qualification_code}
                                    onChange={(e) => updateField("qualification_code", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Qualification Title</Label>
                                <Input
                                    value={formData.qualification_title}
                                    onChange={(e) => updateField("qualification_title", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-slate-300">Start Date</Label>
                                <Input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => updateField("start_date", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">End Date</Label>
                                <Input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => updateField("end_date", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Location</Label>
                                <Input
                                    value={formData.location}
                                    onChange={(e) => updateField("location", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-slate-300">Delivery Mode</Label>
                                <Select value={formData.delivery_mode} onValueChange={(v) => updateField("delivery_mode", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Face to Face", "Online", "Blended"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Status</Label>
                                <Select value={formData.status} onValueChange={(v) => updateField("status", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Planned", "In Progress", "Completed", "Cancelled"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Program</Label>
                                <Select value={formData.program_id || ""} onValueChange={(v) => updateField("program_id", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select program" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {programs.map((p) => (
                                            <SelectItem key={p.id} value={p.id} className="text-white">
                                                {p.program_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* NEW: Enrollment editor (only when editing from participant context) */}
                {isEditing && effectiveSingleParticipantId && existingEnrollment?.id ? (
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white">Participant Enrollment</CardTitle>
                            <p className="text-sm text-slate-400">
                                Updating the outcome here will also move the participant out of the Training phase when appropriate.
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <Label className="text-slate-300">Outcome</Label>
                                    <Select value={enrollmentData.outcome} onValueChange={(v) => updateEnrollment("outcome", v)}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {["In Progress", "Completed", "Withdrawn", "Incomplete", "Cancelled"].map((opt) => (
                                                <SelectItem key={opt} value={opt} className="text-white">
                                                    {opt}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label className="text-slate-300">Completion Date</Label>
                                    <Input
                                        type="date"
                                        value={enrollmentData.completion_date || ""}
                                        onChange={(e) => updateEnrollment("completion_date", e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white"
                                    />
                                </div>

                                <div>
                                    <Label className="text-slate-300">Notes</Label>
                                    <Input
                                        value={enrollmentData.result_notes || ""}
                                        onChange={(e) => updateEnrollment("result_notes", e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white"
                                        placeholder="Optional notes..."
                                    />
                                </div>
                            </div>

                            {enrollmentData.outcome !== "In Progress" && !enrollmentData.completion_date ? (
                                <p className="text-xs text-amber-300">
                                    Tip: If you leave completion date blank, the save will default to Training End Date or today.
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                ) : null}

                {/* Participant picker only on create */}
                {showParticipantPicker && (
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Enroll Participants
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <Input
                                    placeholder="Search participants..."
                                    value={participantSearch}
                                    onChange={(e) => setParticipantSearch(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white pl-10"
                                />
                            </div>

                            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800">
                                {activeParticipants.map((p) => {
                                    const checked = selectedParticipantIds.includes(p.id);
                                    return (
                                        <label
                                            key={p.id}
                                            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40 cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() => {
                                                    setSelectedParticipantIds((prev) =>
                                                        checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                                                    );
                                                }}
                                            />
                                            <span className="text-white">{safeName(p)}</span>
                                        </label>
                                    );
                                })}

                                {activeParticipants.length === 0 ? (
                                    <div className="p-3 text-sm text-slate-400">No participants match your search.</div>
                                ) : null}
                            </div>

                            {selectedParticipantIds.length > 0 && (
                                <p className="text-sm text-slate-400 mt-3">{selectedParticipantIds.length} participant(s) selected</p>
                            )}
                        </CardContent>
                    </Card>
                )}

                <div className="flex justify-end gap-3">
                    {embedded ? (
                        <Button type="button" variant="outline" className="border-slate-700" onClick={() => onClose?.()}>
                            Cancel
                        </Button>
                    ) : (
                        <Link to={createPageUrl("Dashboard")}>
                            <Button type="button" variant="outline" className="border-slate-700">
                                Cancel
                            </Button>
                        </Link>
                    )}

                    <Button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={
                            saveMutation.isPending ||
                            (!isEditing && selectedParticipantIds.length === 0 && !preselectedParticipantId && !embeddedParticipantId)
                        }
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saveMutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"} Training
                    </Button>
                </div>
            </form>
        </div>
    );
}
