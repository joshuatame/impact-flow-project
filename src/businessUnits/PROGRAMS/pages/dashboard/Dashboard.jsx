// src/businessUnits/PROGRAMS/pages/dashboard/Dashboard.jsx
import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import {
    Users,
    FolderKanban,
    Briefcase,
    Plus,
    AlertCircle,
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";
import StatsCard from "@/components/ui/StatsCard.jsx";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import SurveyCompletionGrid from "@/components/dashboard/SurveyCompletionGrid.jsx";
import DocumentsCompletionGrid from "@/components/dashboard/DocumentsCompletionGrid.jsx";
import { format } from "date-fns";

const PHASE_COLORS = {
    "Pre Employment Support": "#f59e0b",
    Training: "#3b82f6",
    Employment: "#10b981",
    Mentoring: "#8b5cf6",
    Exit: "#64748b",
};

// Chart text color requirements
const CHART_TEXT = "#ffffff";
const TOOLTIP_STYLE = {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    color: CHART_TEXT,
};
const TOOLTIP_LABEL_STYLE = { color: CHART_TEXT };
const TOOLTIP_ITEM_STYLE = { color: CHART_TEXT };

export default function Dashboard() {
    const [user, setUser] = useState(null);
    const [filterMode, setFilterMode] = useState("all"); // all | my | program
    const [selectedProgramId, setSelectedProgramId] = useState("");

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch (e) {
            // silently ignore for now
        }
    };

    // Role override
    const viewAsRole = typeof window !== "undefined" ? user?.view_as_role || null : null;
    const effectiveRole = viewAsRole || user?.app_role;

    const canAddParticipants =
        effectiveRole === "SystemAdmin" ||
        effectiveRole === "Manager" ||
        effectiveRole === "ContractsAdmin";

    const isCaseWorker = effectiveRole === "ClientCaseWorker";

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 1000),
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 100),
    });

    const { data: employmentPlacements = [], isLoading: loadingEmploymentPlacements } = useQuery({
        queryKey: ["employmentPlacements"],
        queryFn: () => base44.entities.EmploymentPlacement.list("-created_date", 500),
    });

    const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
        queryKey: ["participantTrainings"],
        queryFn: () => base44.entities.ParticipantTraining.list("-created_date", 500),
    });

    const { data: fundingRecords = [], isLoading: loadingFunding } = useQuery({
        queryKey: ["fundingRecords"],
        queryFn: () => base44.entities.FundingRecord.list("-created_date", 500),
    });

    const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
        queryKey: ["enrollments"],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.list("-created_date", 1000),
    });

    const { data: tasks = [], isLoading: loadingTasks } = useQuery({
        queryKey: ["tasks"],
        queryFn: () => base44.entities.Task.list("-created_date", 500),
    });

    const isLoading =
        loadingParticipants ||
        loadingPrograms ||
        loadingEmploymentPlacements ||
        loadingTrainings ||
        loadingFunding ||
        loadingEnrollments ||
        loadingTasks;

    const programList = Array.isArray(programs) ? programs : [];

    const filteredParticipantIds = useMemo(() => {
        if (filterMode === "my" && user?.id) {
            return participants
                .filter((p) => p.primary_case_worker_id === user?.id)
                .map((p) => p.id);
        }
        if (filterMode === "program" && selectedProgramId) {
            return enrollments
                .filter((e) => e.program_id === selectedProgramId)
                .map((e) => e.participant_id);
        }
        return null; // null means no filter
    }, [filterMode, user?.id, participants, enrollments, selectedProgramId]);

    const filteredParticipants = useMemo(() => {
        return filteredParticipantIds
            ? participants.filter((p) => filteredParticipantIds.includes(p.id))
            : participants;
    }, [participants, filteredParticipantIds]);

    const filteredEmployments = useMemo(() => {
        return filteredParticipantIds
            ? employmentPlacements.filter((e) => filteredParticipantIds.includes(e.participant_id))
            : employmentPlacements;
    }, [employmentPlacements, filteredParticipantIds]);

    // (Kept for parity with original intent - may be used by grids)
    const filteredTrainings = useMemo(() => {
        return filteredParticipantIds
            ? trainings.filter((t) => filteredParticipantIds.includes(t.participant_id))
            : trainings;
    }, [trainings, filteredParticipantIds]);

    const filteredFunding = useMemo(() => {
        if (filterMode === "program" && selectedProgramId) {
            return fundingRecords.filter((f) => f.program_id === selectedProgramId);
        }
        if (filteredParticipantIds) {
            return fundingRecords.filter((f) =>
                (f.linked_participant_ids || []).some((id) => filteredParticipantIds.includes(id))
            );
        }
        return fundingRecords;
    }, [fundingRecords, filterMode, selectedProgramId, filteredParticipantIds]);

    const myOutstandingTasks = useMemo(() => {
        return tasks.filter(
            (t) =>
                t.assigned_to_id === user?.id &&
                t.status !== "Completed" &&
                t.status !== "Cancelled"
        );
    }, [tasks, user?.id]);

    const filteredStartedPlacements = useMemo(() => {
        return filteredEmployments.filter((e) => e.status === "Started" || e.status === "Sustained");
    }, [filteredEmployments]);

    const phaseData = useMemo(() => {
        const reduced = filteredParticipants.reduce((acc, p) => {
            const key = p.current_phase || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(reduced).map(([name, value]) => ({
            name,
            value,
            fill: PHASE_COLORS[name] || "#64748b",
        }));
    }, [filteredParticipants]);

    const fundingByCategory = useMemo(() => {
        const reduced = filteredFunding
            .filter((f) => f.record_type === "Expense")
            .reduce((acc, f) => {
                const key = f.category || "Uncategorised";
                acc[key] = (acc[key] || 0) + (Number(f.amount) || 0);
                return acc;
            }, {});
        return Object.entries(reduced).map(([name, value]) => ({ name, value }));
    }, [filteredFunding]);

    const displayParticipants = useMemo(() => {
        return filteredParticipants.slice(0, 5);
    }, [filteredParticipants]);

    if (isLoading) return <LoadingSpinner />;

    const subtitleDate = format(new Date(), "EEEE, MMMM d, yyyy");
    const subtitleTasks =
        myOutstandingTasks.length > 0
            ? `  ${myOutstandingTasks.length} task${myOutstandingTasks.length === 1 ? "" : "s"} outstanding`
            : "";

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title={`Welcome back, ${user?.full_name?.split(" ")[0] || "there"}`}
                subtitle={subtitleDate + subtitleTasks}
            >
                {canAddParticipants ? (
                    <Link to={createPageUrl("ParticipantForm")}>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Participant
                        </Button>
                    </Link>
                ) : (
                    isCaseWorker && (
                        <Link to={createPageUrl("ParticipantRequest")}>
                            <Button className="bg-blue-600 hover:bg-blue-700">
                                <Plus className="h-4 w-4 mr-2" />
                                Request Participant
                            </Button>
                        </Link>
                    )
                )}
            </PageHeader>

            {/* Dashboard Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <Select
                    value={filterMode}
                    onValueChange={(v) => {
                        setFilterMode(v);
                        if (v !== "program") setSelectedProgramId("");
                    }}
                >
                    <SelectTrigger className="w-40 bg-slate-900/50 border-slate-800 text-white">
                        <SelectValue placeholder="Filter view" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="all" className="text-white">
                            All Data
                        </SelectItem>
                        <SelectItem value="my" className="text-white">
                            My Participants
                        </SelectItem>
                        <SelectItem value="program" className="text-white">
                            By Program
                        </SelectItem>
                    </SelectContent>
                </Select>

                {filterMode === "program" && (
                    <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                        <SelectTrigger className="w-48 bg-slate-900/50 border-slate-800 text-white">
                            <SelectValue placeholder="Select program" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            {programList.map((p) => (
                                <SelectItem key={p.id} value={p.id} className="text-white">
                                    {p.program_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatsCard
                    title="Participants"
                    value={filteredParticipants.length}
                    icon={Users}
                    gradient="from-blue-500 to-cyan-500"
                />
                <StatsCard
                    title="Programs"
                    value={programList.length}
                    icon={FolderKanban}
                    gradient="from-violet-500 to-purple-500"
                />
                <StatsCard
                    title="Outstanding Tasks"
                    value={myOutstandingTasks.length}
                    icon={AlertCircle}
                    gradient="from-amber-500 to-orange-500"
                />
                <StatsCard
                    title="Employed"
                    value={filteredStartedPlacements.length}
                    icon={Briefcase}
                    gradient="from-emerald-500 to-green-500"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Participants by Phase */}
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Participants by Phase</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={phaseData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {phaseData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    labelStyle={TOOLTIP_LABEL_STYLE}
                                    itemStyle={TOOLTIP_ITEM_STYLE}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 mt-4">
                        {phaseData.map((item) => (
                            <div key={item.name} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                                <span className="text-sm text-slate-400">{item.name}</span>
                                <span className="text-sm font-medium text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Spending by Category */}
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Spending by Category</h3>
                    {fundingByCategory.length > 0 ? (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={fundingByCategory} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                    <XAxis
                                        type="number"
                                        stroke={CHART_TEXT}
                                        tick={{ fill: CHART_TEXT }}
                                        fontSize={12}
                                        tickFormatter={(v) => `$${v}`}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        stroke={CHART_TEXT}
                                        tick={{ fill: CHART_TEXT }}
                                        fontSize={11}
                                        width={90}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        labelStyle={TOOLTIP_LABEL_STYLE}
                                        itemStyle={TOOLTIP_ITEM_STYLE}
                                        formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, "Amount"]}
                                    />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">No expenses recorded</div>
                    )}
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent / My / Program Participants */}
                <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">
                            {filterMode === "my"
                                ? "My Participants"
                                : filterMode === "program"
                                    ? "Program Participants"
                                    : "Recent Participants"}
                        </h3>
                        <Link to={createPageUrl("Participants")}>
                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                                View All
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>

                    <div className="space-y-3">
                        {displayParticipants.map((participant) => (
                            <Link
                                key={participant.id}
                                to={createPageUrl(`ParticipantDetail?id=${participant.id}`)}
                                className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold">
                                        {participant.first_name?.[0]}
                                        {participant.last_name?.[0]}
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">
                                            {participant.first_name} {participant.last_name}
                                        </p>
                                        <p className="text-sm text-slate-400">{participant.current_phase}</p>
                                    </div>
                                </div>

                                <Badge
                                    className="bg-slate-700/50 text-slate-300"
                                    style={{
                                        backgroundColor: `${PHASE_COLORS[participant.current_phase] || "#64748b"}20`,
                                        color: PHASE_COLORS[participant.current_phase] || "#cbd5e1",
                                    }}
                                >
                                    {participant.status}
                                </Badge>
                            </Link>
                        ))}

                        {displayParticipants.length === 0 && (
                            <div className="text-center py-8 text-slate-500">No participants found</div>
                        )}
                    </div>
                </div>

                
            </div>

            {/* Documents Completion Grid - directly under Survey Completion Status */}
            <div className="mt-8">
                <DocumentsCompletionGrid
                    filterMode={filterMode}
                    selectedProgramId={selectedProgramId}
                    userId={user?.id}
                />
            </div>
        </div>
    );
}
