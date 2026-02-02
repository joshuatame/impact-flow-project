// src/businessUnits/_shared/admin/RequestsPanelBase.jsx
import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";
import { addDoc, collection, getDocs, query, serverTimestamp, updateDoc, doc, where, orderBy } from "firebase/firestore";
import { db } from "@/firebase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Plus } from "lucide-react";

import { canApproveRequests, canCreateRequests, canAssignRole } from "./roles";

function normEmail(v = "") {
    return String(v || "").trim().toLowerCase();
}

async function fetchRequests(entityId) {
    const qRef = query(
        collection(db, "userRequests"),
        where("entity_id", "==", entityId),
        orderBy("created_at", "desc")
    );
    const snap = await getDocs(qRef);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

export default function RequestsPanelBase() {
    const active = useMemo(() => getActiveEntity(), []);
    const entityId = active?.id || "";

    const { data: me } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const canRequest = useMemo(() => canCreateRequests(me, entityId), [me, entityId]);
    const canApprove = useMemo(() => canApproveRequests(me, entityId), [me, entityId]);

    const { data: requests = [], refetch } = useQuery({
        queryKey: ["userRequests", entityId],
        enabled: !!entityId,
        queryFn: () => fetchRequests(entityId),
    });

    const [form, setForm] = useState({ email: "", full_name: "", role: "User" });

    const createRequest = useMutation({
        mutationFn: async () => {
            const email = normEmail(form.email);
            if (!email) throw new Error("Email required");
            if (!canAssignRole(me, entityId, form.role)) throw new Error("Not allowed to request that role");

            await addDoc(collection(db, "userRequests"), {
                entity_id: entityId,
                new_user_email: email,
                new_user_name: (form.full_name || "").trim(),
                requested_role: form.role,
                status: "Pending",
                requested_by_uid: me?.id || null,
                requested_by_name: me?.full_name || me?.email || "",
                created_at: serverTimestamp(),
            });
        },
        onSuccess: async () => {
            setForm({ email: "", full_name: "", role: "User" });
            await refetch();
        },
    });

    const reviewRequest = useMutation({
        mutationFn: async ({ requestId, nextStatus }) => {
            await updateDoc(doc(db, "userRequests", requestId), {
                status: nextStatus,
                reviewed_by_uid: me?.id || null,
                reviewed_at: serverTimestamp(),
            });

            // If approved, also create an invite (so user gets access when they log in)
            if (nextStatus === "Approved") {
                // read request from local list
                const r = (requests || []).find((x) => x.id === requestId);
                if (r?.new_user_email) {
                    await addDoc(collection(db, "userInvites"), {
                        email: normEmail(r.new_user_email),
                        full_name: (r.new_user_name || "").trim(),
                        entity_id: entityId,
                        role: r.requested_role || "User",
                        status: "Pending",
                        created_at: serverTimestamp(),
                        created_by: me?.id || null,
                        source_request_id: requestId,
                    });
                }
            }
        },
        onSuccess: async () => {
            await refetch();
        },
    });

    if (!entityId) {
        return (
            <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4 text-slate-300">No active business unit selected.</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {canRequest && (
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white">Request a new user</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Input
                                value={form.email}
                                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="email@company.com"
                            />
                            <Input
                                value={form.full_name}
                                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="Full name (optional)"
                            />
                            <Select value={form.role} onValueChange={(role) => setForm((p) => ({ ...p, role }))}>
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    {["GeneralManager", "Manager", "ContractManager", "User"].map((r) => (
                                        <SelectItem key={r} value={r} className="text-white" disabled={!canAssignRole(me, entityId, r)}>
                                            {r}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => createRequest.mutate()}
                            disabled={createRequest.isPending}
                            type="button"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {createRequest.isPending ? "Submitting…" : "Submit request"}
                        </Button>

                        <div className="text-xs text-slate-500">
                            Managers submit requests → General Manager approves → invite is created automatically.
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {requests.length ? (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-400">Email</TableHead>
                                    <TableHead className="text-slate-400">Name</TableHead>
                                    <TableHead className="text-slate-400">Role</TableHead>
                                    <TableHead className="text-slate-400">Status</TableHead>
                                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((r) => (
                                    <TableRow key={r.id} className="border-slate-800">
                                        <TableCell className="text-white">{r.new_user_email}</TableCell>
                                        <TableCell className="text-slate-300">{r.new_user_name || "—"}</TableCell>
                                        <TableCell>
                                            <Badge className="bg-slate-500/10 text-slate-200">{r.requested_role || "User"}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                className={
                                                    r.status === "Approved"
                                                        ? "bg-emerald-500/10 text-emerald-300"
                                                        : r.status === "Rejected"
                                                            ? "bg-red-500/10 text-red-300"
                                                            : "bg-amber-500/10 text-amber-300"
                                                }
                                            >
                                                {r.status || "Pending"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {canApprove && r.status === "Pending" ? (
                                                <div className="inline-flex gap-2">
                                                    <Button
                                                        className="bg-emerald-600 hover:bg-emerald-700 h-8"
                                                        onClick={() => reviewRequest.mutate({ requestId: r.id, nextStatus: "Approved" })}
                                                        type="button"
                                                    >
                                                        <Check className="h-4 w-4 mr-1" />
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        className="bg-red-600 hover:bg-red-700 h-8"
                                                        onClick={() => reviewRequest.mutate({ requestId: r.id, nextStatus: "Rejected" })}
                                                        type="button"
                                                    >
                                                        <X className="h-4 w-4 mr-1" />
                                                        Reject
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-500">—</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-sm text-slate-400">No requests yet.</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
