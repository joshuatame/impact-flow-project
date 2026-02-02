import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveEntity } from "@/lib/activeEntity";
import { db } from "@/firebase";

import SystemSettingsPanel from "@/components/admin/SystemSettingsPanel.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Plus, Trash2 } from "lucide-react";

import {
    collection,
    addDoc,
    getDocs,
    query as fsQuery,
    orderBy,
    serverTimestamp,
    updateDoc,
    deleteDoc,
    doc,
    where,
} from "firebase/firestore";

function ForumChannelsPanel({ entityId }) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    const slugify = (value) =>
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-");

    const { data: channels = [], isLoading } = useQuery({
        queryKey: ["forumChannels", entityId],
        queryFn: async () => {
            if (!entityId) return [];
            const q = fsQuery(
                collection(db, "forumChannels"),
                where("entity_id", "==", entityId),
                orderBy("createdAt", "asc")
            );
            const snap = await getDocs(q);
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
        enabled: !!entityId,
    });

    const createChannel = useMutation({
        mutationFn: async () => {
            const slug = slugify(name);
            if (!slug) throw new Error("Channel name is required");

            await addDoc(collection(db, "forumChannels"), {
                entity_id: entityId,
                name: name.trim(),
                slug,
                description: (description || "").trim(),
                isActive: true,
                createdAt: serverTimestamp(),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["forumChannels", entityId] });
            setName("");
            setDescription("");
        },
    });

    const toggleActive = useMutation({
        mutationFn: async ({ channelId, isActive }) => {
            await updateDoc(doc(db, "forumChannels", channelId), { isActive: !isActive });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["forumChannels", entityId] });
        },
    });

    const deleteChannel = useMutation({
        mutationFn: async ({ channelId }) => {
            await deleteDoc(doc(db, "forumChannels", channelId));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["forumChannels", entityId] });
        },
    });

    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Forum Channels (Casework Unit)
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
                <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                    <p className="text-white font-semibold mb-3">Create Channel</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <Label className="text-slate-300">Channel Name</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="e.g., Case Discussions"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Description (optional)</Label>
                            <Input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="Short description"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                        <Button
                            type="button"
                            onClick={() => createChannel.mutate()}
                            disabled={!name.trim() || createChannel.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {createChannel.isPending ? "Creating..." : "Create Channel"}
                        </Button>

                        {name.trim() && (
                            <span className="text-xs text-slate-400">
                                Slug: <span className="text-slate-300">{slugify(name)}</span>
                            </span>
                        )}
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-white font-semibold">Existing Channels</p>
                        {isLoading && <span className="text-xs text-slate-400">Loading...</span>}
                    </div>

                    {channels.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-400">Name</TableHead>
                                    <TableHead className="text-slate-400">Slug</TableHead>
                                    <TableHead className="text-slate-400">Status</TableHead>
                                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {channels.map((c) => (
                                    <TableRow key={c.id} className="border-slate-800">
                                        <TableCell className="text-white font-medium">{c.name}</TableCell>
                                        <TableCell className="text-slate-400">{c.slug}</TableCell>

                                        <TableCell>
                                            <Badge
                                                className={
                                                    c.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                                                }
                                            >
                                                {c.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>

                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="border-slate-700 text-slate-200 hover:bg-slate-800"
                                                    onClick={() => toggleActive.mutate({ channelId: c.id, isActive: c.isActive })}
                                                >
                                                    {c.isActive ? "Disable" : "Enable"}
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    className="bg-red-600 hover:bg-red-700"
                                                    onClick={() => {
                                                        const ok = window.confirm(`Delete channel "${c.name}"?`);
                                                        if (ok) deleteChannel.mutate({ channelId: c.id });
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-slate-400">No channels created for this unit yet.</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default function SettingsAdminPage() {
    const active = getActiveEntity();
    const entityId = active?.id || "";

    return (
        <div className="space-y-6">
            <SystemSettingsPanel />
            <ForumChannelsPanel entityId={entityId} />
        </div>
    );
}
