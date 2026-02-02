import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * ParticipantQuickNotes
 * Lightweight reminders/flags for a participant.
 * These are NOT case notes.
 */
export default function ParticipantQuickNotes({ participantId }) {
    const queryClient = useQueryClient();
    const [noteText, setNoteText] = useState("");

    const { data: notes = [], isLoading } = useQuery({
        queryKey: ["participantQuickNotes", participantId],
        enabled: !!participantId,
        queryFn: () =>
            base44.entities.ParticipantQuickNote.filter(
                { participant_id: participantId },
                "-createdAt",
                200
            ),
    });

    const addMutation = useMutation({
        mutationFn: async () => {
            const text = safeText(noteText).trim();
            if (!text) return;

            await base44.entities.ParticipantQuickNote.create({
                participant_id: participantId,
                note_text: text,
            });
        },
        onSuccess: async () => {
            setNoteText("");
            await queryClient.invalidateQueries({ queryKey: ["participantQuickNotes", participantId] });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await base44.entities.ParticipantQuickNote.delete(id);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["participantQuickNotes", participantId] });
        },
    });

    return (
        <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
                <CardTitle className="text-white text-base">Quick Notes</CardTitle>
                <p className="text-slate-400 text-sm">
                    Small reminders or flags (not case notes).
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <Input
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add a quick note…"
                        className="bg-slate-800 border-slate-700 text-white"
                    />
                    <Button
                        onClick={() => addMutation.mutate()}
                        disabled={addMutation.isPending || safeText(noteText).trim().length === 0}
                        className="gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add
                    </Button>
                </div>

                {isLoading ? (
                    <LoadingSpinner />
                ) : notes.length === 0 ? (
                    <p className="text-slate-300">No quick notes yet.</p>
                ) : (
                    <div className="space-y-2">
                        {notes.map((n) => (
                            <div
                                key={n.id}
                                className="flex items-start justify-between gap-3 p-3 rounded-md border border-slate-800 bg-slate-950"
                            >
                                <div className="text-slate-200 whitespace-pre-wrap flex-1">
                                    {safeText(n.note_text)}
                                </div>
                                <Button
                                    variant="ghost"
                                    onClick={() => deleteMutation.mutate(n.id)}
                                    disabled={deleteMutation.isPending}
                                    className="text-slate-300 hover:text-white"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
