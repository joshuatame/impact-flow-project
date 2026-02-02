import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { Plus, Briefcase, Calendar, DollarSign, Clock, Target, Edit, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EmptyState from "@/components/ui/EmptyState.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmploymentForm from "@/pages/EmploymentForm.jsx";

const statusColors = {
    Pending: "bg-amber-500/10 text-amber-400",
    Started: "bg-blue-500/10 text-blue-400",
    Sustained: "bg-emerald-500/10 text-emerald-400",
    Finished: "bg-slate-500/10 text-slate-400",
    Lost: "bg-red-500/10 text-red-400",
};

function isEmploymentActive(status) {
    const s = (status || "").toString();
    return !["Finished", "Lost"].includes(s);
}

export default function ParticipantEmployment({ participantId }) {
    const queryClient = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editEmploymentId, setEditEmploymentId] = useState(null);

    const { data: placements = [], isLoading } = useQuery({
        queryKey: ["employmentPlacements", participantId],
        queryFn: () => base44.entities.EmploymentPlacement.filter({ participant_id: participantId }),
        enabled: !!participantId,
    });

    // Auto-update milestones based on days employed
    const checkAndUpdateMilestones = async (placement) => {
        if (!placement.start_date || placement.status === "Lost" || placement.status === "Finished") return;

        const daysEmployed = differenceInDays(new Date(), new Date(placement.start_date));
        const updates = {};

        if (daysEmployed >= 28 && !placement.week_4_milestone) updates.week_4_milestone = true;
        if (daysEmployed >= 91 && !placement.week_13_milestone) updates.week_13_milestone = true;
        if (daysEmployed >= 182 && !placement.week_26_milestone) {
            updates.week_26_milestone = true;
            updates.status = "Sustained";
        }

        if (Object.keys(updates).length > 0) {
            await base44.entities.EmploymentPlacement.update(placement.id, updates);
            queryClient.invalidateQueries({ queryKey: ["employmentPlacements", participantId] });

            if (updates.status === "Sustained") {
                await base44.entities.Participant.update(participantId, { current_phase: "Employment" });
                queryClient.invalidateQueries({ queryKey: ["participant", participantId] });
            }
        }
    };

    React.useEffect(() => {
        placements.forEach((p) => checkAndUpdateMilestones(p));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placements]);

    const openCreate = () => {
        setEditEmploymentId(null);
        setDialogOpen(true);
    };

    const openEdit = (id) => {
        setEditEmploymentId(id);
        setDialogOpen(true);
    };

    const handleSaved = () => {
        queryClient.invalidateQueries({ queryKey: ["employmentPlacements", participantId] });
        queryClient.invalidateQueries({ queryKey: ["participant", participantId] });
        queryClient.invalidateQueries({ queryKey: ["DEXActivityRecord"] });
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Employment Placements</h3>

                <Button className="bg-blue-600 hover:bg-blue-700" onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Placement
                </Button>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl p-0 max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-white">
                                {editEmploymentId ? "Edit Employment" : "New Employment Placement"}
                            </DialogTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-400 hover:text-white"
                                onClick={() => setDialogOpen(false)}
                                type="button"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>

                    <EmploymentForm
                        embedded
                        participantId={participantId}
                        employmentId={editEmploymentId}
                        onClose={() => setDialogOpen(false)}
                        onSaved={handleSaved}
                    />
                </DialogContent>
            </Dialog>

            {placements.length > 0 ? (
                <div className="space-y-4">
                    {placements.map((placement) => (
                        <div key={placement.id} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
                            <div className="flex items-start gap-4">
                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
                                    <Briefcase className="h-5 w-5 text-white" />
                                </div>

                                <div className="flex-1">
                                    <h4 className="font-semibold text-white">{placement.job_title}</h4>
                                    <p className="text-slate-400 text-sm">{placement.employer_name}</p>

                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                        <Badge className={statusColors[placement.status] || "bg-slate-700/50 text-slate-300"}>
                                            {placement.status}
                                        </Badge>
                                        <Badge className="bg-slate-700/50 text-slate-300">{placement.employment_type}</Badge>
                                    </div>

                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-slate-400">
                                        {placement.hours_per_week && (
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5" />
                                                {placement.hours_per_week} hrs/week
                                            </div>
                                        )}
                                        {placement.wage_rate && (
                                            <div className="flex items-center gap-1.5">
                                                <DollarSign className="h-3.5 w-3.5" />
                                                ${placement.wage_rate}/hr
                                            </div>
                                        )}
                                        {placement.start_date && (
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="h-3.5 w-3.5" />
                                                Started: {format(new Date(placement.start_date), "MMM d, yyyy")}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-slate-800">
                                        {placement.start_date && (
                                            <div className="flex items-center gap-4 mb-3 text-sm">
                                                <span className="text-slate-400">
                                                    <strong className="text-white">
                                                        {differenceInDays(new Date(), new Date(placement.start_date))}
                                                    </strong>{" "}
                                                    days employed
                                                </span>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <Target className={`h-4 w-4 ${placement.week_4_milestone ? "text-emerald-400" : "text-slate-600"}`} />
                                                    <span className={`text-sm ${placement.week_4_milestone ? "text-emerald-400" : "text-slate-500"}`}>4 weeks</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Target className={`h-4 w-4 ${placement.week_13_milestone ? "text-emerald-400" : "text-slate-600"}`} />
                                                    <span className={`text-sm ${placement.week_13_milestone ? "text-emerald-400" : "text-slate-500"}`}>13 weeks</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Target className={`h-4 w-4 ${placement.week_26_milestone ? "text-emerald-400" : "text-slate-600"}`} />
                                                    <span className={`text-sm ${placement.week_26_milestone ? "text-emerald-400" : "text-slate-500"}`}>26 weeks</span>
                                                </div>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-slate-400 hover:text-white"
                                                type="button"
                                                onClick={() => openEdit(placement.id)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={Briefcase}
                    title="No employment placements"
                    description="Add employment placements for this participant"
                    actionLabel="Add Placement"
                    onAction={openCreate}
                />
            )}
        </div>
    );
}
