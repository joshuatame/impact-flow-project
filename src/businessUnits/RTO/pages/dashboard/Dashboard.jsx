// ================================
// File: RTO/pages/dashboard/Dashboard.jsx
// ================================

import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { Users, FolderKanban, AlertCircle, Briefcase, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    LineChart,
    Line,
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
import { format, subDays } from "date-fns";

const CHART_TEXT = "#ffffff";
const TOOLTIP_STYLE = {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    color: CHART_TEXT,
};
const TOOLTIP_LABEL_STYLE = { color: CHART_TEXT };
const TOOLTIP_ITEM_STYLE = { color: CHART_TEXT };

const STATUS_COLORS = {
    Active: "#10b981",
    Completed: "#3b82f6",
    Cancelled: "#64748b",
    Withdrawn: "#f59e0b",
    "On Hold": "#8b5cf6",
};

export default function Dashboard() {
    const [user, setUser] = useState(null);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch {
            // ignore
        }
    };

    // RTO dashboard uses existing collections for now:
    // - Participant => Students
    // - Program => Courses
    // - ParticipantProgramEnrollment => Enrollments
    // - ParticipantTraining => Assessments/Training
    // - Task => QA / admin tasks
    const { data: students = [], isLoading: loadingStudents } = useQuery({
        queryKey: ["rto_students"],
        queryFn: () => base44.entities.Participant.list("-created_date", 2000),
    });

    const { data: courses = [], isLoading: loadingCourses } = useQuery({
        queryKey: ["rto_courses"],
        queryFn: () => base44.entities.Program.list("-created_date", 500),
    });

    const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
        queryKey: ["rto_enrollments"],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.list("-created_date", 3000),
    });

    const { data: trainings = [], isLoading: loadingTrainings } = useQuery({
        queryKey: ["rto_trainings"],
        queryFn: () => base44.entities.ParticipantTraining.list("-created_date", 3000),
    });

    const { data: tasks = [], isLoading: loadingTasks } = useQuery({
        queryKey: ["rto_tasks"],
        queryFn: () => base44.entities.Task.list("-created_date", 2000),
    });

    const isLoading = loadingStudents || loadingCourses || loadingEnrollments || loadingTrainings || loadingTasks;
    if (isLoading) return <LoadingSpinner />;

    const subtitleDate = format(new Date(), "EEEE, MMMM d, yyyy");

    const myOutstandingTasks = tasks.filter(
        (t) => t.assigned_to_id === user?.id && t.status !== "Completed" && t.status !== "Cancelled"
    );

    const enrollmentStatusCounts = enrollments.reduce((acc, e) => {
        const s = e.status || "Active";
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    const enrollmentStatusData = Object.entries(enrollmentStatusCounts).map(([name, value]) => ({
        name,
        value,
        fill: STATUS_COLORS[name] || "#64748b",
    }));

    const completionsOverTime = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(new Date(), 29 - i);
        const dateStr = format(date, "yyyy-MM-dd");

        const completed = trainings.filter((t) => {
            const d = t.completed_date || t.updated_date || t.created_date;
            if (!d) return false;
            return format(new Date(d), "yyyy-MM-dd") === dateStr && (t.status === "Completed" || t.completed === true);
        }).length;

        return { date: format(date, "MMM d"), completed };
    });

    const displayStudents = students.slice(0, 5);

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader title="RTO Dashboard" subtitle={`${subtitleDate}${myOutstandingTasks.length ? `  ${myOutstandingTasks.length} outstanding` : ""}`}>
                <Link to={createPageUrl("Programs")}>
                    <Button className="bg-blue-600 hover:bg-blue-700">
                        <FolderKanban className="h-4 w-4 mr-2" />
                        View Courses
                    </Button>
                </Link>
            </PageHeader>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatsCard title="Students" value={students.length} icon={Users} gradient="from-blue-500 to-cyan-500" />
                <StatsCard title="Courses" value={courses.length} icon={FolderKanban} gradient="from-violet-500 to-purple-500" />
                <StatsCard title="Enrollments" value={enrollments.length} icon={Briefcase} gradient="from-emerald-500 to-green-500" />
                <StatsCard title="Outstanding Tasks" value={myOutstandingTasks.length} icon={AlertCircle} gradient="from-amber-500 to-orange-500" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Enrollments by Status</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={enrollmentStatusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {enrollmentStatusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 mt-4">
                        {enrollmentStatusData.map((item) => (
                            <div key={item.name} className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                                <span className="text-sm text-slate-400">{item.name}</span>
                                <span className="text-sm font-medium text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Completions (Last 30 Days)</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={completionsOverTime}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="date"
                                    stroke={CHART_TEXT}
                                    tick={{ fill: CHART_TEXT }}
                                    fontSize={12}
                                    tickLine={false}
                                    interval="preserveStartEnd"
                                />
                                <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                <Line type="monotone" dataKey="completed" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">Recent Students</h3>
                        <Link to={createPageUrl("Participants")}>
                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                                View All
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>

                    <div className="space-y-3">
                        {displayStudents.map((s) => (
                            <Link
                                key={s.id}
                                to={createPageUrl(`ParticipantDetail?id=${s.id}`)}
                                className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold">
                                        {s.first_name?.[0]}
                                        {s.last_name?.[0]}
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">
                                            {s.first_name} {s.last_name}
                                        </p>
                                        <p className="text-sm text-slate-400">{s.email || s.mobile || "—"}</p>
                                    </div>
                                </div>

                                <Badge className="bg-slate-700/50 text-slate-300">{s.status || "Active"}</Badge>
                            </Link>
                        ))}

                        {displayStudents.length === 0 && <div className="text-center py-8 text-slate-500">No students found</div>}
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Quality / Admin</h3>
                    <div className="space-y-3 text-slate-300">
                        <div className="p-3 rounded-xl bg-slate-800/30">
                            <div className="text-sm text-slate-400">Outstanding tasks assigned to you</div>
                            <div className="text-2xl font-bold text-white">{myOutstandingTasks.length}</div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-800/30">
                            <div className="text-sm text-slate-400">Total training records</div>
                            <div className="text-2xl font-bold text-white">{trainings.length}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}