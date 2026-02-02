// src/pages/Participants.jsx
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users, Grid3X3, List, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import ParticipantCard from "@/components/participants/ParticipantCard.jsx";

const PHASES = [
    "All Phases",
    "Pre Employment Support",
    "Training Commenced",
    "Training Engagement",
    "Training Completed",
    "Employment Commenced",
    "Employment Engagement",
    "Employment Sustained",
    "Mentoring",
    "Exit",
];
const STATUSES = ["All Status", "Active", "Inactive", "Completed", "Withdrawn"];

export default function Participants() {
    const [search, setSearch] = useState("");
    const [phaseFilter, setPhaseFilter] = useState("All Phases");
    const [statusFilter, setStatusFilter] = useState("All Status");
    const [viewMode, setViewMode] = useState("grid");
    const [user, setUser] = useState(null);
    const [myOnly, setMyOnly] = useState(false);

    useEffect(() => {
        base44.auth.me().then(setUser).catch(() => setUser(null));
    }, []);

    const viewAsRole =
        typeof window !== "undefined" ? user?.view_as_role || null : null;
    const effectiveRole = viewAsRole || user?.app_role;

    const canAddParticipants =
        effectiveRole === "SystemAdmin" ||
        effectiveRole === "Manager" ||
        effectiveRole === "ContractsAdmin";

    const isCaseWorker = effectiveRole === "ClientCaseWorker";

    const { data: participants = [], isLoading } = useQuery({
        queryKey: ["participants-list"],
        queryFn: () => base44.entities.Participant.list("-created_date", 1000),
        // 7B: faster propagation. Keeps list fresh without full realtime rewrite.
        staleTime: 2000,
        refetchInterval: 4000,
        refetchOnWindowFocus: true,
    });

    const filteredParticipants = useMemo(() => {
        return participants.filter((p) => {
            const matchesSearch =
                search === "" ||
                `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
                p.contact_email?.toLowerCase().includes(search.toLowerCase()) ||
                p.contact_phone?.includes(search);

            const matchesPhase = phaseFilter === "All Phases" || p.current_phase === phaseFilter;
            const matchesStatus = statusFilter === "All Status" || p.status === statusFilter;

            const matchesMyOnly = !myOnly || (user?.id && p.primary_case_worker_id === user.id);

            return matchesSearch && matchesPhase && matchesStatus && matchesMyOnly;
        });
    }, [participants, search, phaseFilter, statusFilter, myOnly, user?.id]);

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader title="Participants" subtitle={`${filteredParticipants.length} participants`}>
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

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, email, or phone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-500"
                    />
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    {!!user?.id && (
                        <Button
                            variant="outline"
                            onClick={() => setMyOnly((v) => !v)}
                            className={`border-slate-700 hover:bg-slate-800 ${myOnly ? "bg-slate-800 text-white" : "text-slate-300"
                                }`}
                            title="Show only participants assigned to you"
                        >
                            <UserCheck className="h-4 w-4 mr-2" />
                            My Participants
                            {myOnly && (
                                <Badge className="ml-2 bg-emerald-500/10 text-emerald-400">On</Badge>
                            )}
                        </Button>
                    )}

                    <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                        <SelectTrigger className="w-[180px] bg-slate-900/50 border-slate-800 text-white">
                            <SelectValue placeholder="Phase" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            {PHASES.map((phase) => (
                                <SelectItem key={phase} value={phase} className="text-white">
                                    {phase}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-800 text-white">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            {STATUSES.map((status) => (
                                <SelectItem key={status} value={status} className="text-white">
                                    {status}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="hidden md:flex items-center gap-1 bg-slate-900/50 border border-slate-800 rounded-lg p-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewMode("grid")}
                            className={viewMode === "grid" ? "bg-slate-800 text-white" : "text-slate-400"}
                        >
                            <Grid3X3 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewMode("list")}
                            className={viewMode === "list" ? "bg-slate-800 text-white" : "text-slate-400"}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Participants Grid/List */}
            {filteredParticipants.length > 0 ? (
                <div
                    className={
                        viewMode === "grid"
                            ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                            : "space-y-3"
                    }
                >
                    {filteredParticipants.map((participant) => (
                        <ParticipantCard key={participant.id} participant={participant} />
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={Users}
                    title="No participants found"
                    description={
                        search || phaseFilter !== "All Phases" || statusFilter !== "All Status" || myOnly
                            ? "Try adjusting your filters"
                            : "Get started by adding your first participant"
                    }
                    actionLabel={
                        !search && phaseFilter === "All Phases" && statusFilter === "All Status" && !myOnly
                            ? "Add Participant"
                            : undefined
                    }
                    onAction={() => (window.location.href = createPageUrl("ParticipantForm"))}
                />
            )}
        </div>
    );
}
