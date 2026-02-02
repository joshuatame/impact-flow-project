import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, GraduationCap, Calendar, Building2, CheckCircle, Edit, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EmptyState from "@/components/ui/EmptyState.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import TrainingForm from "@/pages/TrainingForm.jsx";

const outcomeColors = {
    Completed: "bg-emerald-500/10 text-emerald-400",
    Incomplete: "bg-red-500/10 text-red-400",
    Withdrawn: "bg-amber-500/10 text-amber-400",
    Cancelled: "bg-slate-500/10 text-slate-300",
    "In Progress": "bg-blue-500/10 text-blue-400",
};

export default function ParticipantTraining({ participantId }) {
    const queryClient = useQueryClient();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTrainingActivityId, setEditTrainingActivityId] = useState(null);
    const [editParticipantTrainingId, setEditParticipantTrainingId] = useState(null);

    const { data: participantTrainings = [], isLoading } = useQuery({
        queryKey: ["participantTrainings", participantId],
        queryFn: () => base44.entities.ParticipantTraining.filter({ participant_id: participantId }),
        enabled: !!participantId,
    });

    const { data: trainingActivities = [] } = useQuery({
        queryKey: ["trainingActivities"],
        queryFn: () => base44.entities.TrainingActivity.list("-created_date", 2000),
    });

    const activitiesById = useMemo(() => {
        const m = new Map();
        (trainingActivities || []).forEach((t) => m.set(t.id, t));
        return m;
    }, [trainingActivities]);

    const openCreate = () => {
        setEditTrainingActivityId(null);
        setEditParticipantTrainingId(null);
        setDialogOpen(true);
    };

    const openEdit = (trainingActivityId, participantTrainingId) => {
        setEditTrainingActivityId(trainingActivityId);
        setEditParticipantTrainingId(participantTrainingId);
        setDialogOpen(true);
    };

    const handleSaved = () => {
        queryClient.invalidateQueries({ queryKey: ["participantTrainings", participantId] });
        queryClient.invalidateQueries({ queryKey: ["trainingActivities"] });
        queryClient.invalidateQueries({ queryKey: ["ParticipantTraining"] });
        queryClient.invalidateQueries({ queryKey: ["participant", participantId] });
        queryClient.invalidateQueries({ queryKey: ["DEXActivityRecord"] });
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Training Records</h3>

                <Button className="bg-blue-600 hover:bg-blue-700" onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Training
                </Button>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl p-0 max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-white">
                                {editTrainingActivityId ? "Edit Training Activity" : "New Training Activity"}
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

                    <TrainingForm
                        embedded
                        participantId={participantId}
                        trainingId={editTrainingActivityId}
                        participantTrainingId={editParticipantTrainingId}
                        onClose={() => setDialogOpen(false)}
                        onSaved={handleSaved}
                    />
                </DialogContent>
            </Dialog>

            {participantTrainings.length > 0 ? (
                <div className="space-y-4">
                    {participantTrainings.map((pt) => {
                        const training = activitiesById.get(pt.training_activity_id);
                        return (
                            <div key={pt.id} className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5">
                                <div className="flex items-start gap-4">
                                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
                                        <GraduationCap className="h-5 w-5 text-white" />
                                    </div>

                                    <div className="flex-1">
                                        <h4 className="font-semibold text-white">
                                            {training?.training_name || "Unknown Training"}
                                        </h4>

                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                            <Badge className={outcomeColors[pt.outcome] || "bg-slate-700/50 text-slate-300"}>
                                                {pt.outcome}
                                            </Badge>
                                            {training?.delivery_mode && (
                                                <Badge className="bg-slate-700/50 text-slate-300">{training.delivery_mode}</Badge>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-slate-400">
                                            {training?.provider_name && (
                                                <div className="flex items-center gap-1.5">
                                                    <Building2 className="h-3.5 w-3.5" />
                                                    {training.provider_name}
                                                </div>
                                            )}
                                            {pt.enrollment_date && (
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    Enrolled: {format(new Date(pt.enrollment_date), "MMM d, yyyy")}
                                                </div>
                                            )}
                                            {pt.completion_date && (
                                                <div className="flex items-center gap-1.5">
                                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                                                    Completed: {format(new Date(pt.completion_date), "MMM d, yyyy")}
                                                </div>
                                            )}
                                        </div>

                                        {pt.result_notes ? <p className="text-slate-500 text-sm mt-3">{pt.result_notes}</p> : null}

                                        <div className="mt-3 pt-3 border-t border-slate-800 flex justify-end">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-slate-400 hover:text-white"
                                                type="button"
                                                onClick={() => openEdit(pt.training_activity_id, pt.id)}
                                            >
                                                <Edit className="h-4 w-4 mr-1" />
                                                Edit
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    icon={GraduationCap}
                    title="No training records"
                    description="Add training enrollments for this participant"
                    actionLabel="Add Training"
                    onAction={openCreate}
                />
            )}
        </div>
    );
}
