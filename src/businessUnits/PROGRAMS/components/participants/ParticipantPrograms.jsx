import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, FolderKanban, Calendar, Star, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EmptyState from "@/components/ui/EmptyState.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

const phaseColors = {
    "Pre Employment Support": "bg-amber-500/10 text-amber-400",
    Training: "bg-blue-500/10 text-blue-400",
    Employment: "bg-emerald-500/10 text-emerald-400",
    Mentoring: "bg-violet-500/10 text-violet-400",
    Exit: "bg-slate-500/10 text-slate-400",
    Withdrawn: "bg-orange-500/10 text-orange-400",
    Disengaged: "bg-red-500/10 text-red-400",
};

function todayISO() {
    return new Date().toISOString().split("T")[0];
}

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function isActiveRow(row) {
    const st = safeText(row?.status).trim().toLowerCase();
    if (!st) return true;
    return st === "active";
}

export default function ParticipantPrograms({ participantId }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        program_id: "",
        referral_source: "",
        intake_date: "",
        current_phase: "Pre Employment Support",
        is_primary_program: false,
        notes: "",
        dex_case_location: "",
    });
    const queryClient = useQueryClient();

    const { data: enrollments = [], isLoading } = useQuery({
        queryKey: ["enrollments", participantId],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.filter({ participant_id: participantId }),
    });

    const { data: programs = [] } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list(),
    });

    // Admin-managed DEX Hub Locations
    const { data: dexHubLocationsRaw = [] } = useQuery({
        queryKey: ["dexHubLocations"],
        queryFn: () => base44.entities.DexCaseLocationOption.list("-created_date", 500),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    });

    const dexHubLocationOptions = useMemo(() => {
        const arr = Array.isArray(dexHubLocationsRaw) ? dexHubLocationsRaw : [];
        return arr
            .filter(isActiveRow)
            .map((x) => safeText(x?.name).trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
    }, [dexHubLocationsRaw]);

    // Used for DEX Exit mapping
    const { data: employmentPlacements = [] } = useQuery({
        queryKey: ["employmentPlacements", participantId],
        queryFn: () => base44.entities.EmploymentPlacement.filter({ participant_id: participantId }),
        enabled: !!participantId,
    });

    const { data: participantTrainings = [] } = useQuery({
        queryKey: ["participantTrainings", participantId],
        queryFn: () => base44.entities.ParticipantTraining.filter({ participant_id: participantId }),
        enabled: !!participantId,
    });

    const selectedProgram = programs.find((p) => p.id === formData.program_id);

    const createEnrollment = useMutation({
        mutationFn: async (data) => {
            const program = programs.find((p) => p.id === data.program_id);
            const isDex = !!program?.dex_reporting_required;

            const hub = (data.dex_case_location || "").trim();

            // Create enrollment first (we also store is_dex_reportable_program + dex_case_location)
            const enrollment = await base44.entities.ParticipantProgramEnrollment.create({
                ...data,
                participant_id: participantId,
                is_dex_reportable_program: isDex,
                dex_case_location: isDex ? (hub || null) : null,
            });

            // DEX: record Pre Employment Support Commenced when enrolling into a DEX active program
            if (program?.dex_reporting_required) {
                if (!hub) {
                    throw new Error("DEX Hub Location is required for this program.");
                }

                const activityDate = data.intake_date || todayISO();
                const participant = await base44.entities.Participant.get(participantId);
                const participantName =
                    participant?.full_name ||
                    `${participant?.first_name || ""} ${participant?.last_name || ""}`.trim();

                await base44.entities.DEXActivityRecord.create({
                    participant_id: participantId,
                    participant_name: participantName,
                    program_id: data.program_id,
                    activity_type: "Pre Employment Support Commenced",
                    activity_date: activityDate,
                    reference_entity_type: "ParticipantProgramEnrollment",
                    reference_entity_id: enrollment?.id || null,
                    case_location: hub,
                    service_setting: null,
                    details: { program_name: program.program_name || program.name || null },
                });
            }

            // Keep participant stage aligned
            if (data.current_phase) {
                await base44.entities.Participant.update(participantId, { current_phase: data.current_phase });
            }

            // Also store last-used DEX hub on participant for reuse elsewhere
            if (hub) {
                await base44.entities.Participant.update(participantId, { dex_case_location: hub });
            }

            return enrollment;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["enrollments", participantId]);
            queryClient.invalidateQueries(["participant", participantId]);
            setDialogOpen(false);
            setFormData({
                program_id: "",
                referral_source: "",
                intake_date: "",
                current_phase: "Pre Employment Support",
                is_primary_program: false,
                notes: "",
                dex_case_location: "",
            });
        },
    });

    const exitEnrollment = useMutation({
        mutationFn: async ({ enrollmentId }) => {
            const enrollment = enrollments.find((e) => e.id === enrollmentId);
            if (!enrollment) throw new Error("Enrollment not found");

            const program = programs.find((p) => p.id === enrollment.program_id);
            const user = await base44.auth.me();
            const participant = await base44.entities.Participant.get(participantId);
            const participantName =
                participant?.full_name ||
                `${participant?.first_name || ""} ${participant?.last_name || ""}`.trim();

            const updated = await base44.entities.ParticipantProgramEnrollment.update(enrollmentId, {
                status: "Exited",
                exit_date: todayISO(),
                current_phase: "Exit",
            });

            await base44.entities.Participant.update(participantId, { current_phase: "Exit" });

            // DEX exit mapping (DEX active programs only)
            if (program?.dex_reporting_required) {
                const caseLocation = enrollment.dex_case_location || null;

                const hasActiveEmployment =
                    Array.isArray(employmentPlacements) &&
                    employmentPlacements.some((p) => !["Finished", "Lost"].includes((p?.status || "").toString()));

                const hasActiveTraining =
                    Array.isArray(participantTrainings) &&
                    participantTrainings.some((t) => ["In Progress"].includes((t?.outcome || "").toString()));

                const activityDate = todayISO();

                const createDex = (activity_type, details = {}) =>
                    base44.entities.DEXActivityRecord.create({
                        participant_id: participantId,
                        participant_name: participantName,
                        program_id: enrollment.program_id,
                        activity_type,
                        activity_date: activityDate,
                        reference_entity_type: "ParticipantProgramEnrollment",
                        reference_entity_id: enrollmentId,
                        case_location: caseLocation,
                        service_setting: null,
                        details,
                        recorded_by_id: user?.id,
                        recorded_by_name: user?.full_name,
                    });

                if (hasActiveTraining) {
                    await createDex("Training Exit", { reason: "Program exit" });
                }
                if (hasActiveEmployment) {
                    await createDex("Employment Exit", { reason: "Program exit" });
                    await createDex("Mentoring Exit", { reason: "Program exit" });
                }
                if (!hasActiveTraining && !hasActiveEmployment) {
                    await createDex("Exit", { reason: "Program exit" });
                }
            }

            return updated;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["enrollments", participantId]);
            queryClient.invalidateQueries(["participant", participantId]);
            queryClient.invalidateQueries(["dexRecords", participantId]);
        },
    });

    const getProgramName = (programId) => {
        const program = programs.find((p) => p.id === programId);
        return program?.program_name || "Unknown Program";
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Program Enrollments</h3>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="h-4 w-4 mr-2" />
                            Enroll in Program
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-white">Enroll in Program</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 mt-4">
                            <div>
                                <Label className="text-slate-300">Program</Label>
                                <Select value={formData.program_id} onValueChange={(v) => setFormData({ ...formData, program_id: v })}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select program" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {programs
                                            .filter((p) => p.status === "Active")
                                            .map((program) => (
                                                <SelectItem key={program.id} value={program.id} className="text-white">
                                                    {program.program_name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedProgram?.dex_reporting_required && (
                                <div>
                                    <Label className="text-slate-300">DEX Hub Location</Label>
                                    <Select
                                        value={formData.dex_case_location}
                                        onValueChange={(v) => setFormData({ ...formData, dex_case_location: v })}
                                    >
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue placeholder="Select hub location" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                                            {dexHubLocationOptions.map((name) => (
                                                <SelectItem key={name} value={name} className="text-white">
                                                    {name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-400 mt-1">Required for DEX reportable programs.</p>
                                    {dexHubLocationOptions.length === 0 ? (
                                        <p className="text-xs text-amber-300 mt-1">
                                            No hub locations are configured yet — add them in System Settings.
                                        </p>
                                    ) : null}
                                </div>
                            )}

                            <div>
                                <Label className="text-slate-300">Referral Source</Label>
                                <Input
                                    value={formData.referral_source}
                                    onChange={(e) => setFormData({ ...formData, referral_source: e.target.value })}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="e.g., Self-referral, Agency"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Intake Date</Label>
                                <Input
                                    type="date"
                                    value={formData.intake_date}
                                    onChange={(e) => setFormData({ ...formData, intake_date: e.target.value })}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Initial Stage</Label>
                                <Select
                                    value={formData.current_phase}
                                    onValueChange={(v) => setFormData({ ...formData, current_phase: v })}
                                >
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Pre Employment Support", "Training", "Employment", "Mentoring", "Exit", "Withdrawn", "Disengaged"].map(
                                            (phase) => (
                                                <SelectItem key={phase} value={phase} className="text-white">
                                                    {phase}
                                                </SelectItem>
                                            )
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Notes</Label>
                                <Textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    rows={3}
                                />
                            </div>

                            <Button
                                onClick={() => createEnrollment.mutate(formData)}
                                disabled={
                                    !formData.program_id ||
                                    createEnrollment.isPending ||
                                    (selectedProgram?.dex_reporting_required && !(formData.dex_case_location || "").trim())
                                }
                                className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                                {createEnrollment.isPending ? "Enrolling..." : "Enroll"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {enrollments.length > 0 ? (
                <div className="space-y-4">
                    {enrollments.map((enrollment) => (
                        <div
                            key={enrollment.id}
                            className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5 hover:border-slate-700/50 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                                        <FolderKanban className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-white">{getProgramName(enrollment.program_id)}</h4>
                                            {enrollment.is_primary_program && <Star className="h-4 w-4 text-amber-400 fill-amber-400" />}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                            <Badge className={phaseColors[enrollment.current_phase] || "bg-slate-500/10 text-slate-400"}>
                                                {enrollment.current_phase || "—"}
                                            </Badge>
                                            {enrollment.exit_date && <Badge className="bg-slate-500/10 text-slate-400">Exited</Badge>}
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-slate-400">
                                            {enrollment.intake_date && (
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    Intake: {format(new Date(enrollment.intake_date), "MMM d, yyyy")}
                                                </div>
                                            )}
                                            {enrollment.referral_source && <span>Referral: {enrollment.referral_source}</span>}
                                        </div>

                                        {enrollment.dex_case_location ? (
                                            <div className="mt-2 text-xs text-slate-500">
                                                DEX hub: <span className="text-slate-300">{enrollment.dex_case_location}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {!enrollment.exit_date ? (
                                        <Button
                                            variant="outline"
                                            className="border-slate-700 text-slate-200 hover:bg-slate-800"
                                            onClick={() => {
                                                const ok = window.confirm(
                                                    "Remove participant from this program? This will create a DEX Exit session (if DEX active)."
                                                );
                                                if (!ok) return;
                                                exitEnrollment.mutate({ enrollmentId: enrollment.id });
                                            }}
                                            disabled={exitEnrollment.isPending}
                                            title="Remove from program"
                                        >
                                            <LogOut className="h-4 w-4 mr-2" />
                                            Remove
                                        </Button>
                                    ) : null}

                                    <Link to={createPageUrl(`ProgramDetail?id=${enrollment.program_id}`)}>
                                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                                            <ChevronRight className="h-5 w-5" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={FolderKanban}
                    title="No program enrollments"
                    description="This participant is not enrolled in any programs yet"
                    actionLabel="Enroll in Program"
                    onAction={() => setDialogOpen(true)}
                />
            )}
        </div>
    );
}
