// src/pages/ProgramDetail.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import {
    ArrowLeft,
    Edit,
    Calendar,
    DollarSign,
    Users,
    Building2,
    FileText,
    GraduationCap,
    Briefcase,
    Clock as ClockIcon,
    AlertCircle,
    MapPin,
    Plus,
    UserPlus,
    Sparkles,
    Target,
    ExternalLink,
    Mail, // ✅ ADDED
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import StatsCard from "@/components/ui/StatsCard.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import ParticipantCard from "@/components/participants/ParticipantCard.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import ProgramTimeline from "@/components/programs/ProgramTimeline.jsx";
import ProgramTimelineBar from "@/components/programs/ProgramTimelineBar.jsx";
import GoodNewsStories from "@/components/programs/GoodNewsStories.jsx";
import ProgramKPIs from "@/components/programs/ProgramKPIs.jsx";
import { Alert, AlertDescription } from "@/components/ui/alert";

const statusColors = {
    Active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Inactive: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    Completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

function safeCategory(cat) {
    const v = (cat || "").toString().trim();
    return v ? v : "Uncategorised";
}

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function isActiveRow(row) {
    const st = safeText(row?.status).trim().toLowerCase();
    if (!st) return true;
    return st === "active";
}

async function safeGetWorkflowRequest(id) {
    if (!id) return null;
    try {
        const doc = await base44.entities.WorkflowRequest.get(id);
        return doc || null;
    } catch (_) {
        try {
            const list = await base44.entities.WorkflowRequest.filter({ id });
            return Array.isArray(list) && list.length > 0 ? list[0] : null;
        } catch (_) {
            return null;
        }
    }
}

export default function ProgramDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const programId = urlParams.get("id");
    const [activeTab, setActiveTab] = useState("overview");
    const [showAddParticipant, setShowAddParticipant] = useState(false);
    const [selectedParticipantId, setSelectedParticipantId] = useState("");

    // NEW: DEX hub selection for add participant dialog
    const [selectedDexHub, setSelectedDexHub] = useState("");

    // Funding request copy dialog
    const [selectedFundingRecord, setSelectedFundingRecord] = useState(null);
    const [fundingRequestDialogOpen, setFundingRequestDialogOpen] = useState(false);

    const queryClient = useQueryClient();

    const { data: program, isLoading } = useQuery({
        queryKey: ["program", programId],
        queryFn: () => base44.entities.Program.filter({ id: programId }),
        select: (data) => data[0],
        enabled: !!programId,
    });

    // Admin-managed DEX hub locations
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

    const { data: enrollments = [] } = useQuery({
        queryKey: ["enrollments", programId],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.filter({ program_id: programId }),
        enabled: !!programId,
    });

    const { data: participants = [] } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list(),
    });

    const { data: caseNotes = [] } = useQuery({
        queryKey: ["programCaseNotes", programId],
        queryFn: async () => {
            const notes = await base44.entities.CaseNote.list("-interaction_date", 500);
            const arr = Array.isArray(notes) ? notes : [];
            return arr.filter((note) => note.linked_program_ids?.includes(programId));
        },
        enabled: !!programId,
    });

    const { data: fundingRecordsRaw = [] } = useQuery({
        queryKey: ["programFunding", programId],
        queryFn: () => base44.entities.FundingRecord.filter({ program_id: programId }),
        enabled: !!programId,
    });

    const fundingRecords = useMemo(() => {
        const arr = Array.isArray(fundingRecordsRaw) ? fundingRecordsRaw : [];
        return arr.slice().sort((a, b) => {
            const da = a.funding_date ? new Date(a.funding_date).getTime() : 0;
            const db = b.funding_date ? new Date(b.funding_date).getTime() : 0;
            return db - da;
        });
    }, [fundingRecordsRaw]);

    const { data: trainings = [] } = useQuery({
        queryKey: ["programTrainings", programId],
        queryFn: () => base44.entities.TrainingActivity.filter({ program_id: programId }),
        enabled: !!programId,
    });

    const { data: allEmployments = [] } = useQuery({
        queryKey: ["allEmployments"],
        queryFn: () => base44.entities.EmploymentPlacement.list("-created_date", 1000),
    });

    const { data: allTrainingRecords = [] } = useQuery({
        queryKey: ["allParticipantTrainings"],
        queryFn: () => base44.entities.ParticipantTraining.list("-created_date", 1000),
    });

    const { data: intakes = [] } = useQuery({
        queryKey: ["programIntakes", programId],
        queryFn: () => base44.entities.ProgramIntake.filter({ program_id: programId }),
        enabled: !!programId,
    });

    const addParticipantMutation = useMutation({
        mutationFn: async (participantId) => {
            const requiresDexHub = !!program?.dex_reporting_required;
            const hub = safeText(selectedDexHub).trim();

            if (requiresDexHub && !hub) {
                throw new Error("DEX Hub Location is required for this program.");
            }

            await base44.entities.ParticipantProgramEnrollment.create({
                participant_id: participantId,
                program_id: programId,
                intake_date: new Date().toISOString().split("T")[0],
                current_phase: "Pre Employment Support",
                is_dex_reportable_program: !!program?.dex_reporting_required,
                dex_case_location: requiresDexHub ? hub : null,
            });

            // Also store last-used DEX hub on participant for reuse elsewhere
            if (requiresDexHub && hub) {
                await base44.entities.Participant.update(participantId, { dex_case_location: hub });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["enrollments", programId]);
            setShowAddParticipant(false);
            setSelectedParticipantId("");
            setSelectedDexHub("");
        },
    });

    const selectedFundingSourceRequestId = selectedFundingRecord?.source_workflow_request_id || null;

    const { data: fundingRequestCopy, isLoading: loadingFundingRequestCopy } = useQuery({
        queryKey: ["workflowRequestCopy", selectedFundingSourceRequestId],
        queryFn: () => safeGetWorkflowRequest(selectedFundingSourceRequestId),
        enabled: !!selectedFundingSourceRequestId && fundingRequestDialogOpen,
        staleTime: 10_000,
    });

    if (isLoading) {
        return <LoadingSpinner />;
    }

    if (!program) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">Program not found</h2>
                <Link to={createPageUrl("Programs")}>
                    <Button variant="outline">Back to Programs</Button>
                </Link>
            </div>
        );
    }

    const enrolledParticipantIds = enrollments.map((e) => e.participant_id);
    const enrolledParticipants = participants.filter((p) => enrolledParticipantIds.includes(p.id));
    const activeParticipants = enrolledParticipants.filter((p) => p.status === "Active");

    const availableParticipants = participants.filter(
        (p) => p.status === "Active" && !enrolledParticipantIds.includes(p.id)
    );

    const isWithinEnrollment = (recordDate, participantId) => {
        const enrollment = enrollments.find((e) => e.participant_id === participantId);
        if (!enrollment || !recordDate) return false;

        const recordDateParsed = parseISO(recordDate);
        const intakeDate = enrollment.intake_date ? parseISO(enrollment.intake_date) : null;
        const exitDate = enrollment.exit_date ? parseISO(enrollment.exit_date) : null;

        if (!intakeDate) return false;
        if (isBefore(recordDateParsed, intakeDate)) return false;
        if (exitDate && isAfter(recordDateParsed, exitDate)) return false;

        return true;
    };

    const programEmployments = allEmployments.filter((emp) => {
        if (!enrolledParticipantIds.includes(emp.participant_id)) return false;
        return isWithinEnrollment(emp.created_date?.split("T")[0] || emp.start_date, emp.participant_id);
    });

    const programTrainingRecords = allTrainingRecords.filter((tr) => {
        if (!enrolledParticipantIds.includes(tr.participant_id)) return false;
        return isWithinEnrollment(tr.created_date?.split("T")[0] || tr.enrollment_date, tr.participant_id);
    });

    const totalExpenses = fundingRecords
        .filter((r) => r.record_type === "Expense")
        .reduce((sum, r) => sum + (r.amount || 0), 0);

    const budgetUsed = program.total_funding_amount > 0 ? (totalExpenses / program.total_funding_amount) * 100 : 0;

    const activeEmployments = programEmployments.filter((e) => e.status === "Started" || e.status === "Sustained");

    const openFundingDialog = (record) => {
        setSelectedFundingRecord(record);
        setFundingRequestDialogOpen(true);
    };

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            {/* Header */}
            <div className="mb-6">
                <Link
                    to={createPageUrl("Programs")}
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Programs
                </Link>

                <div className="flex flex-col md:flex-row md:items-start gap-6">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600">
                        <Building2 className="h-10 w-10 text-white" />
                    </div>

                    <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold text-white">{program.program_name}</h1>
                                <p className="text-slate-400 mt-1">{program.contract_code}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <Badge variant="outline" className={statusColors[program.status]}>
                                        {program.status}
                                    </Badge>
                                    {program.dex_reporting_required && (
                                        <Badge className="bg-violet-500/10 text-violet-400">DEX Required</Badge>
                                    )}
                                </div>
                            </div>
                            <Link to={createPageUrl(`ProgramForm?id=${programId}`)}>
                                <Button variant="outline" className="border-slate-700 hover:bg-slate-800">
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>
                            </Link>
                        </div>

                        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm text-slate-400">
                            {program.funder_name && (
                                <div className="flex items-center gap-2">
                                    <Building2 className="h-4 w-4" />
                                    <span>Funded by {program.funder_name}</span>
                                </div>
                            )}
                            {program.location && (
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <span>{program.location}</span>
                                </div>
                            )}
                            {program.start_date && (
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    <span>
                                        {format(new Date(program.start_date), "MMM d, yyyy")}
                                        {program.end_date && ` - ${format(new Date(program.end_date), "MMM d, yyyy")}`}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatsCard title="Active Participants" value={activeParticipants.length} icon={Users} gradient="from-blue-500 to-cyan-500" />
                <StatsCard title="Case Notes" value={caseNotes.length} icon={FileText} gradient="from-violet-500 to-purple-500" />
                <StatsCard title="Training Records" value={programTrainingRecords.length} icon={GraduationCap} gradient="from-emerald-500 to-green-500" />
                <StatsCard title="Employed" value={activeEmployments.length} icon={Briefcase} gradient="from-amber-500 to-orange-500" />
            </div>

            {/* Timeline Bar */}
            <ProgramTimelineBar program={program} />

            {/* Budget Progress */}
            {program.total_funding_amount > 0 && (
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-semibold text-white">Budget Utilisation</h3>
                            <p className="text-sm text-slate-400">
                                ${totalExpenses.toLocaleString()} of ${program.total_funding_amount.toLocaleString()} spent
                            </p>
                        </div>
                        <span className="text-2xl font-bold text-white">{budgetUsed.toFixed(1)}%</span>
                    </div>
                    <Progress value={budgetUsed} className="h-3 bg-slate-800" />
                </div>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="bg-slate-900/50 border border-slate-800 p-1 overflow-x-auto flex-nowrap">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="participants" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <Users className="h-4 w-4 mr-2" />
                        Participants ({enrolledParticipants.length})
                    </TabsTrigger>
                    <TabsTrigger value="casenotes" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <FileText className="h-4 w-4 mr-2" />
                        Case Notes ({caseNotes.length})
                    </TabsTrigger>
                    <TabsTrigger value="funding" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Funding
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <ClockIcon className="h-4 w-4 mr-2" />
                        Timeline
                    </TabsTrigger>
                    <TabsTrigger value="goodnews" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Good News
                    </TabsTrigger>
                    <TabsTrigger value="kpis" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <Target className="h-4 w-4 mr-2" />
                        KPIs
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    {/* unchanged */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Program Details</h3>
                            <div className="space-y-4">
                                {program.target_cohort_description && (
                                    <div>
                                        <p className="text-sm text-slate-400">Target Cohort</p>
                                        <p className="text-white">{program.target_cohort_description}</p>
                                    </div>
                                )}
                                {intakes.length > 0 && (
                                    <div>
                                        <p className="text-sm text-slate-400 mb-2">Program Intakes</p>
                                        <div className="space-y-2">
                                            {intakes.map((intake, idx) => {
                                                const intakeEnrollments = enrollments.filter((e) => e.intake_id === intake.id);
                                                return (
                                                    <div key={idx} className="flex items-center justify-between text-sm p-2 bg-slate-800/50 rounded-lg">
                                                        <div>
                                                            <span className="text-slate-300">{intake.intake_name}</span>
                                                            <Badge className="ml-2 bg-slate-700/50 text-slate-400 text-xs">{intake.status}</Badge>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-white font-medium">
                                                                {intakeEnrollments.length}
                                                                {intake.max_participants ? `/${intake.max_participants}` : ""} participants
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {program.budget_categories?.length > 0 && (
                                    <div>
                                        <p className="text-sm text-slate-400 mb-2">Budget Categories</p>
                                        <div className="space-y-2">
                                            {program.budget_categories.map((cat, idx) => (
                                                <div key={idx} className="flex items-center justify-between text-sm">
                                                    <span className="text-slate-300">{cat.category}</span>
                                                    <span className="text-white font-medium">${cat.amount?.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
                            <div className="space-y-3">
                                {caseNotes.slice(0, 5).map((note) => (
                                    <div key={note.id} className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0">
                                        <FileText className="h-4 w-4 text-slate-500 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">{note.title}</p>
                                            <p className="text-xs text-slate-500">
                                                {note.interaction_date && format(new Date(note.interaction_date), "MMM d, yyyy")}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {caseNotes.length === 0 && <p className="text-sm text-slate-500">No recent activity</p>}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="participants">
                    <div className="mb-4 flex justify-end gap-2">
                        {/* ✅ ADDED: Email Participants */}
                        <Link to={createPageUrl(`ProgramEmail?id=${programId}`)}>
                            <Button variant="outline" className="border-slate-700 hover:bg-slate-800">
                                <Mail className="h-4 w-4 mr-2" />
                                Email Participants
                            </Button>
                        </Link>

                        <Button onClick={() => setShowAddParticipant(true)} className="bg-blue-600 hover:bg-blue-700">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Participant
                        </Button>
                    </div>

                    {enrolledParticipants.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {enrolledParticipants.map((participant) => (
                                <ParticipantCard key={participant.id} participant={participant} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon={Users}
                            title="No participants enrolled"
                            description="Enroll participants in this program to see them here"
                            actionLabel="Add Participant"
                            onAction={() => setShowAddParticipant(true)}
                        />
                    )}

                    <Dialog open={showAddParticipant} onOpenChange={setShowAddParticipant}>
                        <DialogContent className="bg-slate-900 border-slate-800">
                            <DialogHeader>
                                <DialogTitle className="text-white">Add Participant to Program</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 mt-4">
                                <div>
                                    <Label className="text-slate-300">Select Participant</Label>
                                    <Select value={selectedParticipantId} onValueChange={setSelectedParticipantId}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue placeholder="Choose a participant" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                                            {availableParticipants.map((p) => (
                                                <SelectItem key={p.id} value={p.id} className="text-white">
                                                    {p.first_name} {p.last_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {availableParticipants.length === 0 && (
                                        <p className="text-sm text-slate-500 mt-2">All active participants are already enrolled</p>
                                    )}
                                </div>

                                {program?.dex_reporting_required ? (
                                    <div>
                                        <Label className="text-slate-300">DEX Hub Location</Label>
                                        <Select value={selectedDexHub} onValueChange={setSelectedDexHub}>
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
                                        {dexHubLocationOptions.length === 0 ? (
                                            <p className="text-xs text-amber-300 mt-1">
                                                No hub locations are configured yet — add them in System Settings.
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="flex justify-end gap-3">
                                    <Button variant="outline" onClick={() => setShowAddParticipant(false)} className="border-slate-700">
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={() => addParticipantMutation.mutate(selectedParticipantId)}
                                        disabled={
                                            !selectedParticipantId ||
                                            addParticipantMutation.isPending ||
                                            (program?.dex_reporting_required && !safeText(selectedDexHub).trim())
                                        }
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        {addParticipantMutation.isPending ? "Adding..." : "Add to Program"}
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                <TabsContent value="casenotes">
                    {caseNotes.length > 0 ? (
                        <div className="space-y-4">
                            {caseNotes.map((note) => (
                                <Link
                                    key={note.id}
                                    to={createPageUrl(`CaseNoteDetail?id=${note.id}`)}
                                    className="block bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-colors"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 rounded-lg bg-slate-800">
                                            <FileText className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-white">{note.title}</h4>
                                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{note.narrative_text}</p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                                <span>{note.author_name}</span>
                                                {note.interaction_date && <span>{format(new Date(note.interaction_date), "MMM d, yyyy")}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={FileText} title="No case notes" description="Case notes linked to this program will appear here" />
                    )}
                </TabsContent>

                <TabsContent value="funding">
                    <div className="mb-4 flex justify-end">
                        <Link to={createPageUrl(`FundingForm?program_id=${programId}`)}>
                            <Button className="bg-blue-600 hover:bg-blue-700">
                                <Plus className="h-4 w-4 mr-2" />
                                Add Program Spend
                            </Button>
                        </Link>
                    </div>

                    {fundingRecords.length > 0 ? (
                        <div className="space-y-3">
                            {fundingRecords.map((record) => {
                                const categoryLabel = safeCategory(record.category);
                                const supplier = (record.supplier_name || "").toString().trim();
                                const hasRequestLink = !!record.source_workflow_request_id;

                                return (
                                    <button
                                        key={record.id}
                                        type="button"
                                        onClick={() => openFundingDialog(record)}
                                        className="w-full text-left bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700/60 hover:bg-slate-900/70 transition-colors"
                                    >
                                        <div
                                            className={`p-2 rounded-lg ${record.record_type === "Expense" ? "bg-red-500/10" : "bg-emerald-500/10"
                                                }`}
                                        >
                                            <DollarSign
                                                className={`h-4 w-4 ${record.record_type === "Expense" ? "text-red-400" : "text-emerald-400"
                                                    }`}
                                            />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge className="bg-slate-700/50 text-slate-300">{categoryLabel}</Badge>
                                                {supplier ? (
                                                    <Badge className="bg-slate-700/40 text-slate-200 border border-slate-600/30">
                                                        Supplier: {supplier}
                                                    </Badge>
                                                ) : null}
                                                {record.budget_line_id ? (
                                                    <Badge className="bg-slate-700/40 text-slate-200 border border-slate-600/30">
                                                        Budget line: {String(record.budget_line_id)}
                                                    </Badge>
                                                ) : null}
                                                {hasRequestLink ? (
                                                    <Badge className="bg-blue-500/10 text-blue-400 text-xs">Request linked</Badge>
                                                ) : (
                                                    <Badge className="bg-slate-700/30 text-slate-400 text-xs">No request link</Badge>
                                                )}
                                            </div>

                                            <p className="text-slate-400 text-sm mt-1 truncate">
                                                {record.description || record.invoice_number || "No description"}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p
                                                className={`font-semibold ${record.record_type === "Expense" ? "text-red-400" : "text-emerald-400"
                                                    }`}
                                            >
                                                {record.record_type === "Expense" ? "-" : "+"}$
                                                {record.amount?.toLocaleString()}
                                            </p>
                                            {record.funding_date ? (
                                                <p className="text-xs text-slate-500">
                                                    {format(new Date(record.funding_date), "MMM d, yyyy")}
                                                </p>
                                            ) : null}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            icon={DollarSign}
                            title="No funding records"
                            description="Funding allocations and expenses for this program will appear here"
                            actionLabel="Add Program Spend"
                            onAction={() => (window.location.href = createPageUrl(`FundingForm?program_id=${programId}`))}
                        />
                    )}
                </TabsContent>

                <TabsContent value="timeline">
                    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                        <ProgramTimeline programId={programId} />
                    </div>
                </TabsContent>

                <TabsContent value="goodnews">
                    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                        <GoodNewsStories programId={programId} programName={program?.program_name} />
                    </div>
                </TabsContent>

                <TabsContent value="kpis">
                    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                        <ProgramKPIs programId={programId} program={program} />
                    </div>
                </TabsContent>
            </Tabs>

            {/* Program funding request copy dialog */}
            <Dialog
                open={fundingRequestDialogOpen}
                onOpenChange={(open) => {
                    setFundingRequestDialogOpen(open);
                    if (!open) setSelectedFundingRecord(null);
                }}
            >
                <DialogContent className="bg-slate-900 border-slate-800 max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-white">Funding Record</DialogTitle>
                    </DialogHeader>

                    {selectedFundingRecord ? (
                        <div className="space-y-4 mt-2">
                            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-800">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <Badge className="bg-slate-700/50 text-slate-300">
                                        {safeCategory(selectedFundingRecord.category)}
                                    </Badge>
                                    {selectedFundingRecord.supplier_name ? (
                                        <Badge className="bg-slate-700/40 text-slate-200 border border-slate-600/30">
                                            Supplier: {String(selectedFundingRecord.supplier_name)}
                                        </Badge>
                                    ) : null}
                                    {selectedFundingRecord.budget_line_id ? (
                                        <Badge className="bg-slate-700/40 text-slate-200 border border-slate-600/30">
                                            Budget line: {String(selectedFundingRecord.budget_line_id)}
                                        </Badge>
                                    ) : null}
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="text-slate-500">Type</p>
                                        <p className="text-white">{selectedFundingRecord.record_type || "N/A"}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Amount</p>
                                        <p className="text-white font-semibold">
                                            ${Number(selectedFundingRecord.amount || 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Date</p>
                                        <p className="text-white">
                                            {selectedFundingRecord.funding_date
                                                ? format(new Date(selectedFundingRecord.funding_date), "MMM d, yyyy")
                                                : "N/A"}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500">Invoice</p>
                                        <p className="text-white">{selectedFundingRecord.invoice_number || "N/A"}</p>
                                    </div>
                                </div>

                                {selectedFundingRecord.description ? (
                                    <div className="mt-3">
                                        <p className="text-slate-500 text-sm">Description</p>
                                        <p className="text-white text-sm whitespace-pre-wrap">{selectedFundingRecord.description}</p>
                                    </div>
                                ) : null}
                            </div>

                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-white font-medium">Request Copy</h4>
                                    {selectedFundingRecord.source_workflow_request_id ? (
                                        <Badge className="bg-blue-500/10 text-blue-400">
                                            {selectedFundingRecord.source_workflow_request_id}
                                        </Badge>
                                    ) : null}
                                </div>

                                {!selectedFundingRecord.source_workflow_request_id ? (
                                    <Alert className="bg-slate-800/40 border-slate-700">
                                        <AlertDescription className="text-slate-300">No linked request found for this record.</AlertDescription>
                                    </Alert>
                                ) : loadingFundingRequestCopy ? (
                                    <p className="text-sm text-slate-400">Loading request copy...</p>
                                ) : fundingRequestCopy ? (
                                    <div className="space-y-2 text-sm">
                                        <p className="text-slate-300">
                                            <span className="text-slate-500">Status:</span> {fundingRequestCopy.status || "N/A"}
                                        </p>
                                        <p className="text-slate-300">
                                            <span className="text-slate-500">Submitted by:</span>{" "}
                                            {fundingRequestCopy.submitted_by_name || "N/A"}
                                        </p>
                                        <p className="text-slate-300">
                                            <span className="text-slate-500">Reviewed by:</span>{" "}
                                            {fundingRequestCopy.reviewed_by_name || "N/A"}
                                        </p>

                                        {fundingRequestCopy.review_notes ? (
                                            <div className="pt-2 border-t border-slate-700/60">
                                                <p className="text-slate-500">Review notes</p>
                                                <p className="text-slate-200 whitespace-pre-wrap">{fundingRequestCopy.review_notes}</p>
                                            </div>
                                        ) : null}

                                        {Array.isArray(fundingRequestCopy.attached_file_urls) && fundingRequestCopy.attached_file_urls.length > 0 ? (
                                            <div className="pt-2 border-t border-slate-700/60">
                                                <p className="text-slate-500 mb-2">Attachments</p>
                                                <div className="space-y-2">
                                                    {fundingRequestCopy.attached_file_urls.map((url, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-2 text-blue-400 hover:underline"
                                                        >
                                                            <FileText className="h-4 w-4" />
                                                            <span className="truncate">{url.split("/").pop()}</span>
                                                            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <Alert className="bg-slate-800/40 border-slate-700">
                                        <AlertDescription className="text-slate-300">
                                            Request could not be loaded. Confirm the request still exists and the current user has access.
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}
