import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Plus,
    Target,
    Calendar,
    CheckCircle2,
    Circle,
    Clock,
    MoreVertical,
    Pencil,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyState from "@/components/ui/EmptyState";
import { format } from "date-fns";

const statusColors = {
    "Not Started": "bg-slate-500/10 text-slate-400",
    "In Progress": "bg-blue-500/10 text-blue-400",
    Completed: "bg-emerald-500/10 text-emerald-400",
};

const statusIcons = {
    "Not Started": Circle,
    "In Progress": Clock,
    Completed: CheckCircle2,
};

export default function ParticipantGoals({ participantId }) {
    const [showDialog, setShowDialog] = useState(false);
    const [editingGoal, setEditingGoal] = useState(null);
    const [formData, setFormData] = useState({
        description: "",
        target_date: "",
        status: "Not Started",
        notes: "",
    });

    const queryClient = useQueryClient();

    const { data: goals = [], isLoading } = useQuery({
        queryKey: ["goals", participantId],
        queryFn: () => base44.entities.Goal.filter({ participant_id: participantId }),
    });

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            if (editingGoal) return base44.entities.Goal.update(editingGoal.id, data);

            const me = await base44.auth.me();
            return base44.entities.Goal.create({
                ...data,
                participant_id: participantId,
                created_by_id: me?.id || null,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goals", participantId] });
            handleClose();
        },
    });

    const completeMutation = useMutation({
        mutationFn: async (goal) => {
            return base44.entities.Goal.update(goal.id, {
                status: "Completed",
                completed_date: new Date().toISOString(),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goals", participantId] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Goal.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goals", participantId] });
        },
    });

    const handleClose = () => {
        setShowDialog(false);
        setEditingGoal(null);
        setFormData({
            description: "",
            target_date: "",
            status: "Not Started",
            notes: "",
        });
    };

    const handleEdit = (goal) => {
        setEditingGoal(goal);
        setFormData({
            description: goal.description || "",
            target_date: goal.target_date || "",
            status: goal.status || "Not Started",
            notes: goal.notes || "",
        });
        setShowDialog(true);
    };

    const handleDelete = (id) => {
        if (window.confirm("Are you sure you want to delete this goal?")) {
            deleteMutation.mutate(id);
        }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium text-white">Goals</h3>
                    <p className="text-sm text-slate-400">Track participant goals and progress</p>
                </div>
                <Button onClick={() => setShowDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Goal
                </Button>
            </div>

            {goals.length > 0 ? (
                <div className="grid gap-4">
                    {goals.map((goal) => {
                        const StatusIcon = statusIcons[goal.status] || Circle;

                        const isCompleted = goal.status === "Completed";

                        return (
                            <Card key={goal.id} className="bg-slate-900/50 border-slate-800">
                                <CardContent className="p-4 flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className={`p-2 rounded-lg ${statusColors[goal.status] || ""} bg-opacity-20 mt-1`}>
                                            <StatusIcon className="h-5 w-5" />
                                        </div>

                                        <div className="min-w-0">
                                            <h4 className="font-medium text-white text-lg">{goal.description}</h4>

                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-400">
                                                <Badge className={statusColors[goal.status] || "bg-slate-500/10 text-slate-400"}>
                                                    {goal.status}
                                                </Badge>

                                                {goal.target_date && (
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        <span>Target: {format(new Date(goal.target_date), "MMM d, yyyy")}</span>
                                                    </div>
                                                )}

                                                {goal.completed_date && (
                                                    <div className="flex items-center gap-1">
                                                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                                        <span>
                                                            Completed: {format(new Date(goal.completed_date), "MMM d, yyyy")}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {goal.notes && (
                                                <p className="text-sm text-slate-400 mt-2 bg-slate-800/50 p-2 rounded-lg whitespace-pre-wrap">
                                                    {goal.notes}
                                                </p>
                                            )}

                                            {/* Complete button: hidden when completed */}
                                            {!isCompleted && (
                                                <div className="mt-3">
                                                    <Button
                                                        size="sm"
                                                        className="bg-emerald-600 hover:bg-emerald-700"
                                                        disabled={completeMutation.isPending}
                                                        onClick={() => completeMutation.mutate(goal)}
                                                    >
                                                        Mark Complete
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                                            <DropdownMenuItem onClick={() => handleEdit(goal)} className="text-slate-300 focus:text-white">
                                                <Pencil className="h-4 w-4 mr-2" />
                                                Edit
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => handleDelete(goal.id)}
                                                className="text-red-400 focus:text-red-300"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    icon={Target}
                    title="No goals found"
                    description="Start tracking goals for this participant"
                    actionLabel="Add First Goal"
                    onAction={() => setShowDialog(true)}
                />
            )}

            <Dialog open={showDialog} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">{editingGoal ? "Edit Goal" : "Add New Goal"}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                        <div>
                            <Label className="text-slate-300">Description</Label>
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="e.g., Complete safety training"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Target Date</Label>
                                <Input
                                    type="date"
                                    value={formData.target_date}
                                    onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Status</Label>
                                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="Not Started" className="text-white">Not Started</SelectItem>
                                        <SelectItem value="In Progress" className="text-white">In Progress</SelectItem>
                                        <SelectItem value="Completed" className="text-white">Completed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300">Notes</Label>
                            <Textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={3}
                                placeholder="Additional details..."
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <Button variant="ghost" onClick={handleClose} className="text-slate-300">
                                Cancel
                            </Button>
                            <Button
                                onClick={() => saveMutation.mutate(formData)}
                                disabled={!formData.description || saveMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {saveMutation.isPending ? "Saving..." : "Save Goal"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
