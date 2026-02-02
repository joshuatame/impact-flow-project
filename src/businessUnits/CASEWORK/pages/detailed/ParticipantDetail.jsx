import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowLeft,
    Edit,
    Phone,
    Mail,
    MapPin,
    User,
    FileText,
    Briefcase,
    GraduationCap,
    DollarSign,
    FolderKanban,
    Activity,
    ClipboardList,
    Files,
    Clock,
    AlertCircle,
    BarChart3,
    Target,
    Megaphone,
    ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { differenceInYears } from "date-fns";

import ParticipantOverview from "@/components/participant-detail/ParticipantOverview.jsx";
import ParticipantPrograms from "@/components/participant-detail/ParticipantPrograms.jsx";
import ParticipantCaseNotes from "@/components/participant-detail/ParticipantCaseNotes.jsx";
import ParticipantTraining from "@/components/participant-detail/ParticipantTraining.jsx";
import ParticipantEmployment from "@/components/participant-detail/ParticipantEmployment.jsx";
import ParticipantFunding from "@/components/participant-detail/ParticipantFunding.jsx";
import ParticipantSurveys from "@/components/participant-detail/ParticipantSurveys.jsx";
import ParticipantDocuments from "@/components/participant-detail/ParticipantDocuments.jsx";
import ParticipantDex from "@/components/participant-detail/ParticipantDex.jsx";
import ParticipantTimeline from "@/components/participant-detail/ParticipantTimeline.jsx";
import ParticipantRiskReport from "@/components/participant-detail/ParticipantRiskReport.jsx";
import ParticipantGoals from "@/components/participant-detail/ParticipantGoals.jsx";
import ParticipantGoodNews from "@/components/participant-detail/ParticipantGoodNews.jsx";
import ParticipantEmails from "@/components/participant-detail/ParticipantEmails.jsx";

import EmailComposerDialog from "@/components/email/EmailComposerDialog.jsx";

const stageColors = {
    "Pre Employment Support": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Training: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Employment: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Mentoring: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    Exit: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    Withdrawn: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    Disengaged: "bg-red-500/10 text-red-400 border-red-500/20",

    "Training Commenced": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "Training Engagement": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "Training Completed": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",

    "Employment Commenced": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Employment Engagement": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Employment Sustained": "bg-green-500/10 text-green-400 border-green-500/20",

    "Mentoring Engagement": "bg-violet-500/10 text-violet-400 border-violet-500/20",
};

const STAGES = [
    "Pre Employment Support",
    "Training",
    "Employment",
    "Mentoring",
    "Exit",
    "Withdrawn",
    "Disengaged",
];

function normalizeStage(phase) {
    const p = (phase || "").toString().trim();
    if (STAGES.includes(p)) return p;
    if (/^Training/i.test(p)) return "Training";
    if (/^Employment/i.test(p)) return "Employment";
    if (/^Mentoring/i.test(p)) return "Mentoring";
    if (/Exit/i.test(p)) return "Exit";
    return p || "Pre Employment Support";
}

function canChangeStage(user) {
    const role = (user?.role || user?.user_role || user?.userType || user?.type || "")
        .toString()
        .toLowerCase();
    if (user?.is_admin) return true;
    return role.includes("manager") || role.includes("admin");
}

export default function ParticipantDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const participantId = urlParams.get("id");

    const [activeTab, setActiveTab] = useState("overview");
    const [emailOpen, setEmailOpen] = useState(false);

    const queryClient = useQueryClient();

    const { data: user } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: participant, isLoading, isFetching } = useQuery({
        queryKey: ["participant", participantId],
        queryFn: () => base44.entities.Participant.get(participantId),
        enabled: !!participantId,
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: () => queryClient.getQueryData(["participant", participantId]) || null,
    });

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

    const updateStage = useMutation({
        mutationFn: async (nextStage) => {
            if (!participantId) return null;
            return base44.entities.Participant.update(participantId, { current_phase: nextStage });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["participant", participantId]);
        },
    });

    const safeFirstName = useMemo(
        () => (participant?.first_name || "").toString().trim(),
        [participant?.first_name]
    );
    const safeLastName = useMemo(
        () => (participant?.last_name || "").toString().trim(),
        [participant?.last_name]
    );

    const safeFullName = useMemo(() => {
        const full = [safeFirstName, safeLastName].filter(Boolean).join(" ");
        return full || " - ";
    }, [safeFirstName, safeLastName]);

    const getInitials = (first, last) => {
        const f = (first || "").toString().trim();
        const l = (last || "").toString().trim();
        const initials = `${f?.[0] || ""}${l?.[0] || ""}`.toUpperCase();
        return initials || "U";
    };

    const normalized = normalizeStage(participant?.current_phase);

    const hasActiveEmployment =
        Array.isArray(employmentPlacements) &&
        employmentPlacements.some(
            (p) => !["Finished", "Lost"].includes((p?.status || "").toString())
        );

    const hasActiveTraining =
        Array.isArray(participantTrainings) &&
        participantTrainings.some((t) => ["In Progress"].includes((t?.outcome || "").toString()));

    const stageBadges = useMemo(() => {
        const badges = new Set();
        badges.add(normalized);

        if (hasActiveEmployment) {
            badges.add("Employment");
            badges.add("Mentoring");
        }
        if (hasActiveTraining) {
            badges.add("Training");
        }

        if (["Exit", "Withdrawn", "Disengaged"].includes(normalized)) {
            return [normalized];
        }

        const order = [
            "Pre Employment Support",
            "Training",
            "Employment",
            "Mentoring",
            "Exit",
            "Withdrawn",
            "Disengaged",
        ];
        return order.filter((s) => badges.has(s));
    }, [normalized, hasActiveEmployment, hasActiveTraining]);

    if (isLoading && !participant) {
        return <LoadingSpinner />;
    }

    if (!participant) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">Participant not found</h2>
                <Link to={createPageUrl("Participants")}>
                    <Button variant="outline">Back to Participants</Button>
                </Link>
            </div>
        );
    }

    const age = participant.date_of_birth
        ? differenceInYears(new Date(), new Date(participant.date_of_birth))
        : null;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            {/* Quick compose from header button */}
            <EmailComposerDialog
                open={emailOpen}
                onOpenChange={setEmailOpen}
                mode="participant"
                participantId={String(participantId || "")}
                defaultTo={String(participant?.contact_email || "")}
                defaultSubject={`Update for ${safeFullName}`}
            />

            <div className="mb-6">
                <Link
                    to={createPageUrl("Participants")}
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Participants
                </Link>

                <div className="flex flex-col md:flex-row md:items-start gap-6">
                    <Avatar className="h-20 w-20 md:h-24 md:w-24 rounded-2xl">
                        {participant.profile_image_url && <AvatarImage src={participant.profile_image_url} />}
                        <AvatarFallback className="rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white text-2xl font-bold">
                            {getInitials(safeFirstName, safeLastName)}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold text-white">{safeFullName}</h1>

                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    {stageBadges.map((b) => (
                                        <Badge
                                            key={b}
                                            variant="outline"
                                            className={stageColors[b] || stageColors[normalized]}
                                        >
                                            {b}
                                        </Badge>
                                    ))}

                                    <Badge
                                        className={
                                            participant.status === "Active"
                                                ? "bg-emerald-500/10 text-emerald-400"
                                                : "bg-slate-500/10 text-slate-400"
                                        }
                                    >
                                        {participant.status}
                                    </Badge>

                                    {age !== null && age > 0 && (
                                        <span className="text-sm text-slate-400">{age} years old</span>
                                    )}

                                    {isFetching ? (
                                        <span className="text-xs text-slate-500">Refreshing...</span>
                                    ) : null}
                                </div>

                                {canChangeStage(user) && (
                                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                                        <div className="inline-flex items-center gap-2 text-sm text-slate-400">
                                            <ShieldCheck className="h-4 w-4" />
                                            Change stage
                                        </div>
                                        <Select value={normalized} onValueChange={(v) => updateStage.mutate(v)}>
                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-full sm:w-64">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                {STAGES.map((s) => (
                                                    <SelectItem key={s} value={s} className="text-white">
                                                        {s}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {updateStage.isPending ? (
                                            <span className="text-xs text-slate-500">Saving...</span>
                                        ) : null}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Link to={createPageUrl(`ParticipantForm?id=${participantId}`)}>
                                    <Button variant="outline" className="border-slate-700 hover:bg-slate-800">
                                        <Edit className="h-4 w-4 mr-2" />
                                        Edit
                                    </Button>
                                </Link>

                                <Link to={createPageUrl(`PdfForms?participant_id=${participantId}`)}>
                                    <Button variant="outline" className="border-slate-700 hover:bg-slate-800">
                                        <FileText className="h-4 w-4 mr-2" />
                                        PDF Forms
                                    </Button>
                                </Link>

                                <Link to={createPageUrl(`ResumeBuilder?participant_id=${participantId}`)}>
                                    <Button variant="outline" className="border-slate-700 hover:bg-slate-800">
                                        <FileText className="h-4 w-4 mr-2" />
                                        Resume Builder
                                    </Button>
                                </Link>

                                <Button onClick={() => setEmailOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                                    Email Participant
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm text-slate-400">
                            {participant.contact_phone ? (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4" />
                                    <span>{participant.contact_phone}</span>
                                </div>
                            ) : null}

                            {participant.contact_email ? (
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    <span>{participant.contact_email}</span>
                                </div>
                            ) : null}

                            {participant.suburb ? (
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <span>
                                        {participant.suburb}, {participant.state}
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-2">
                    <TabsList className="bg-transparent p-0 h-auto flex flex-wrap gap-1 w-full">
                        <TabsTrigger
                            value="overview"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <User className="h-4 w-4 mr-2" />
                            Overview
                        </TabsTrigger>

                        <TabsTrigger
                            value="emails"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <Mail className="h-4 w-4 mr-2" />
                            Emails
                        </TabsTrigger>

                        <TabsTrigger
                            value="casenotes"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <FileText className="h-4 w-4 mr-2" />
                            Case Notes
                        </TabsTrigger>

                        <TabsTrigger
                            value="documents"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <Files className="h-4 w-4 mr-2" />
                            Documents
                        </TabsTrigger>

                        <TabsTrigger
                            value="employment"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <Briefcase className="h-4 w-4 mr-2" />
                            Employment
                        </TabsTrigger>

                        <TabsTrigger
                            value="funding"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <DollarSign className="h-4 w-4 mr-2" />
                            Funding
                        </TabsTrigger>

                        <TabsTrigger
                            value="goodnews"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <Megaphone className="h-4 w-4 mr-2" />
                            Good News
                        </TabsTrigger>

                        <TabsTrigger
                            value="programs"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <FolderKanban className="h-4 w-4 mr-2" />
                            Programs
                        </TabsTrigger>

                        <TabsTrigger
                            value="riskreport"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Risk Report
                        </TabsTrigger>

                        <TabsTrigger
                            value="goals"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <Target className="h-4 w-4 mr-2" />
                            Goals
                        </TabsTrigger>

                        <TabsTrigger
                            value="surveys"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <ClipboardList className="h-4 w-4 mr-2" />
                            Surveys
                        </TabsTrigger>

                        <TabsTrigger
                            value="dex"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <Activity className="h-4 w-4 mr-2" />
                            DEX
                        </TabsTrigger>

                        <TabsTrigger
                            value="timeline"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <Clock className="h-4 w-4 mr-2" />
                            Timeline
                        </TabsTrigger>

                        <TabsTrigger
                            value="training"
                            className="data-[state=active]:bg-slate-800 rounded-md px-3 py-2 flex-1 md:flex-none"
                        >
                            <GraduationCap className="h-4 w-4 mr-2" />
                            Training
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="overview">
                    <ParticipantOverview participant={participant} />
                </TabsContent>

                <TabsContent value="emails">
                    <ParticipantEmails participantId={participantId} participant={participant} />
                </TabsContent>

                <TabsContent value="programs">
                    <ParticipantPrograms participantId={participantId} />
                </TabsContent>

                <TabsContent value="casenotes">
                    <ParticipantCaseNotes participantId={participantId} />
                </TabsContent>

                <TabsContent value="training">
                    <ParticipantTraining participantId={participantId} />
                </TabsContent>

                <TabsContent value="employment">
                    <ParticipantEmployment participantId={participantId} />
                </TabsContent>

                <TabsContent value="funding">
                    <ParticipantFunding participantId={participantId} />
                </TabsContent>

                <TabsContent value="goodnews">
                    <ParticipantGoodNews participantId={participantId} />
                </TabsContent>

                <TabsContent value="surveys">
                    <ParticipantSurveys participantId={participantId} />
                </TabsContent>

                <TabsContent value="documents">
                    <ParticipantDocuments participantId={participantId} />
                </TabsContent>

                <TabsContent value="dex">
                    <ParticipantDex participantId={participantId} />
                </TabsContent>

                <TabsContent value="timeline">
                    <ParticipantTimeline participantId={participantId} />
                </TabsContent>

                <TabsContent value="riskreport">
                    <ParticipantRiskReport participantId={participantId} participant={participant} />
                </TabsContent>

                <TabsContent value="goals">
                    <ParticipantGoals participantId={participantId} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
