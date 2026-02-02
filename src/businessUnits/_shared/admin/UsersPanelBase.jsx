// =====================================================
// FILE: src/businessUnits/_shared/admin/UsersPanelBase.jsx
//  - Single surface for: users, invite, approval queue, invite log
//  - Uses callable submitUserInvite + approveUserInviteRequest
// =====================================================

import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    updateDoc,
    doc,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, ShieldCheck, Trash2, RefreshCw } from "lucide-react";

import {
    allowedAssignableRoles,
    canAssignRole,
    canApproveRequests,
    canStartInvites,
    getActorUnitRole,
} from "./roles";

function normEmail(v = "") {
    return String(v || "").trim().toLowerCase();
}



async function fetchUnitUsers(entityId) {
    if (!entityId) return [];
    const fieldPath = `entity_access.${entityId}.active`;

    const qRef = query(collection(db, "User"), where(fieldPath, "==", true));
    const snap = await getDocs(qRef);
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

    rows.sort((a, b) => {
        const an = (a.full_name || a.display_name || a.email || "").toLowerCase();
        const bn = (b.full_name || b.display_name || b.email || "").toLowerCase();
        return an.localeCompare(bn);
    });

    return rows;
}

async function fetchInvites(entityId) {
    if (!entityId) return [];
    const qRef = query(
        collection(db, "userInvites"),
        where("entity_id", "==", entityId),
        orderBy("created_at", "desc")
    );
    const snap = await getDocs(qRef);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

async function fetchInviteRequests(entityId) {
    if (!entityId) return [];
    const qRef = query(
        collection(db, "userInviteRequests"),
        where("entity_id", "==", entityId),
        orderBy("created_at", "desc")
    );
    const snap = await getDocs(qRef);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
}

export default function UsersPanelBase() {
    const active = getActiveEntity();
    const entityId = active?.id || "";
    const entityName = active?.name || "this business unit";

    const { data: me } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const myRole = useMemo(() => getActorUnitRole(me, entityId), [me, entityId]);
    const canStart = useMemo(() => canStartInvites(me, entityId), [me, entityId]);
    const canApprove = useMemo(() => canApproveRequests(me, entityId), [me, entityId]);
    const assignableRoles = useMemo(() => allowedAssignableRoles(me, entityId), [me, entityId]);

    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteForm, setInviteForm] = useState({ email: "", full_name: "", role: "User" });
    const [msg, setMsg] = useState({ type: "", text: "" });

    const {
        data: users = [],
        refetch: refetchUsers,
        isFetching: loadingUsers,
    } = useQuery({
        queryKey: ["unitUsers", entityId],
        queryFn: () => fetchUnitUsers(entityId),
        enabled: !!entityId,
    });

    const {
        data: invites = [],
        refetch: refetchInvites,
        isFetching: loadingInvites,
    } = useQuery({
        queryKey: ["userInvites", entityId],
        queryFn: () => fetchInvites(entityId),
        enabled: !!entityId,
    });

    const {
        data: requests = [],
        refetch: refetchRequests,
        isFetching: loadingRequests,
    } = useQuery({
        queryKey: ["userInviteRequests", entityId],
        queryFn: () => fetchInviteRequests(entityId),
        enabled: !!entityId,
    });

    const refreshAll = async () => {
        await Promise.all([refetchUsers(), refetchInvites(), refetchRequests()]);
    };

    const submitInvite = useMutation({
        mutationFn: async () => {
            setMsg({ type: "", text: "" });

            const email = normEmail(inviteForm.email);
            if (!entityId) throw new Error("No active business unit selected.");
            if (!email) throw new Error("Email is required.");
            if (!canAssignRole(me, entityId, inviteForm.role)) {
                throw new Error("You cannot assign a role equal to or above your own.");
            }

            // if you already export app from firebase.js, use that; otherwise just call getFunctions()
            const functions = getFunctions(undefined, "australia-southeast1");
            const submitUserInvite = httpsCallable(functions, "submitUserInvite");

            // ...
            const res = await submitUserInvite({
                email,
                entityId,
                role: inviteForm.role,
                full_name: (inviteForm.full_name || "").trim(),
            });
            return res.data;

        },
        onSuccess: async (out) => {
            const mode = out?.mode;
            if (mode === "sent") {
                setMsg({ type: "success", text: `Invite sent to ${normEmail(inviteForm.email)} for ${entityName}.` });
            } else if (mode === "requested") {
                setMsg({ type: "success", text: "Invite request created (awaiting General Manager approval)." });
            } else {
                setMsg({ type: "success", text: "Done." });
            }

            setInviteOpen(false);
            setInviteForm({ email: "", full_name: "", role: "User" });
            await refreshAll();
        },
        onError: (e) => {
            setMsg({ type: "error", text: e?.message || "Failed to submit invite." });
        },
    });

    const approveRequest = useMutation({
        mutationFn: async ({ requestId }) => {
            if (!requestId) throw new Error("requestId required");
            await base44.functions.invoke("approveUserInviteRequest", { requestId });
        },
        onSuccess: async () => {
            setMsg({ type: "success", text: "Approved and invite issued." });
            await refreshAll();
        },
        onError: (e) => setMsg({ type: "error", text: e?.message || "Failed to approve request." }),
    });

    const updateUserAccess = useMutation({
        mutationFn: async ({ userId, role, active }) => {
            if (!userId) throw new Error("userId required");
            if (!entityId) throw new Error("No active business unit selected.");
            if (!canAssignRole(me, entityId, role)) throw new Error("You cannot assign a role equal to or above your own.");

            // Prevent self-demotion locking yourself out (unless SystemAdmin)
            if (userId === me?.id && me?.app_role !== "SystemAdmin") {
                throw new Error("You cannot change your own role here.");
            }

            const patch = {};
            patch[`entity_access.${entityId}`] = { role, active: active !== false };
            patch.updated_at = serverTimestamp();

            await updateDoc(doc(db, "User", userId), patch);
        },
        onSuccess: async () => {
            await refetchUsers();
        },
        onError: (e) => setMsg({ type: "error", text: e?.message || "Failed to update user." }),
    });

    const removeUserFromUnit = useMutation({
        mutationFn: async ({ userId }) => {
            if (!userId) throw new Error("userId required");
            if (!entityId) throw new Error("No active business unit selected.");

            if (userId === me?.id && me?.app_role !== "SystemAdmin") {
                throw new Error("You cannot remove yourself from the business unit.");
            }

            const patch = {};
            patch[`entity_access.${entityId}`] = { role: "User", active: false };
            patch.updated_at = serverTimestamp();

            await updateDoc(doc(db, "User", userId), patch);
        },
        onSuccess: async () => {
            await refetchUsers();
        },
        onError: (e) => setMsg({ type: "error", text: e?.message || "Failed to remove user." }),
    });

    if (!entityId) {
        return (
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Users</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-300">No active business unit selected.</CardContent>
            </Card>
        );
    }


    return (
        <div className="space-y-6">
            {!!msg?.text && (
                <div
                    className={`rounded-xl border p-3 text-sm ${msg.type === "error"
                            ? "border-red-500/30 bg-red-500/10 text-red-200"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        }`}
                >
                    {msg.text}
                </div>
            )}

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span>User Management</span>
                                <Badge className="bg-slate-500/10 text-slate-300">{myRole || "—"}</Badge>
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                                Business unit: <span className="text-slate-200">{entityName}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-700"
                                onClick={refreshAll}
                                disabled={loadingUsers || loadingInvites || loadingRequests}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Refresh
                            </Button>

                            {canStart && (
                                <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={() => setInviteOpen(true)}>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Add / Invite User
                                </Button>
                            )}
                        </div>
                    </CardTitle>
                </CardHeader>

                <CardContent>
                    {users.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-400">Name</TableHead>
                                    <TableHead className="text-slate-400">Email</TableHead>
                                    <TableHead className="text-slate-400">Unit Role</TableHead>
                                    <TableHead className="text-slate-400">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map((u) => {
                                    const unitAccess = u?.entity_access?.[entityId] || {};
                                    const unitRole = unitAccess?.role || "User";

                                    const roleChoices = assignableRoles.length ? assignableRoles : ["User"];

                                    return (
                                        <TableRow key={u.id} className="border-slate-800">
                                            <TableCell className="text-white font-medium">
                                                {u.full_name || u.display_name || "—"}
                                                {u.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                                            </TableCell>
                                            <TableCell className="text-slate-300">{u.email || "—"}</TableCell>
                                            <TableCell>
                                                <Select
                                                    value={unitRole}
                                                    onValueChange={(v) => updateUserAccess.mutate({ userId: u.id, role: v, active: true })}
                                                    disabled={!canAssignRole(me, entityId, unitRole) && me?.app_role !== "SystemAdmin"}
                                                >
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-48">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-slate-800">
                                                        {roleChoices.map((r) => (
                                                            <SelectItem key={r} value={r} className="text-white">
                                                                {r}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {canAssignRole(me, entityId, unitRole) && (
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            className="bg-red-600 hover:bg-red-700"
                                                            onClick={() => {
                                                                const ok = window.confirm(`Remove ${u.full_name || u.email || "this user"} from ${entityName}?`);
                                                                if (ok) removeUserFromUnit.mutate({ userId: u.id });
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Remove
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-slate-400 text-sm">No active users found for this business unit.</div>
                    )}
                </CardContent>
            </Card>

            {/* Approval queue */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5" />
                            Invite Requests (Approvals)
                        </span>
                        {!canApprove && <Badge className="bg-slate-500/10 text-slate-300">General Manager only</Badge>}
                    </CardTitle>
                </CardHeader>

                <CardContent>
                    {canApprove ? (
                        requests.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-800">
                                        <TableHead className="text-slate-400">Email</TableHead>
                                        <TableHead className="text-slate-400">Role</TableHead>
                                        <TableHead className="text-slate-400">Requested By</TableHead>
                                        <TableHead className="text-slate-400 text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requests.map((r) => (
                                        <TableRow key={r.id} className="border-slate-800">
                                            <TableCell className="text-white">{r.email || "—"}</TableCell>
                                            <TableCell>
                                                <Badge className="bg-slate-500/10 text-slate-300">{r.role || "User"}</Badge>
                                            </TableCell>
                                            <TableCell className="text-slate-300">{r.created_by_email || r.created_by || "—"}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    type="button"
                                                    className="bg-emerald-600 hover:bg-emerald-700"
                                                    onClick={() => approveRequest.mutate({ requestId: r.id })}
                                                    disabled={approveRequest.isPending}
                                                >
                                                    {approveRequest.isPending ? "Approving..." : "Approve & Send"}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-slate-400 text-sm">No pending invite requests.</div>
                        )
                    ) : (
                        <div className="text-slate-400 text-sm">
                            Managers can submit invite requests; General Managers approve and issue invites here.
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Invite log */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Invite Log</CardTitle>
                </CardHeader>
                <CardContent>
                    {invites.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800">
                                    <TableHead className="text-slate-400">Email</TableHead>
                                    <TableHead className="text-slate-400">Role</TableHead>
                                    <TableHead className="text-slate-400">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invites.slice(0, 50).map((inv) => (
                                    <TableRow key={inv.id} className="border-slate-800">
                                        <TableCell className="text-white">{inv.email || "—"}</TableCell>
                                        <TableCell>
                                            <Badge className="bg-slate-500/10 text-slate-300">{inv.role || "User"}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                className={
                                                    String(inv.status || "").toLowerCase() === "sent"
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "bg-slate-500/10 text-slate-300"
                                                }
                                            >
                                                {inv.status || "Pending"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-slate-400 text-sm">No invites yet.</div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Add / Invite user to {entityName}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                        <div>
                            <label className="text-sm text-slate-300">Email *</label>
                            <Input
                                value={inviteForm.email}
                                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="name@domain.com"
                            />
                        </div>

                        <div>
                            <label className="text-sm text-slate-300">Full name (optional)</label>
                            <Input
                                value={inviteForm.full_name}
                                onChange={(e) => setInviteForm((p) => ({ ...p, full_name: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="Display name for emails"
                            />
                        </div>

                        <div>
                            <label className="text-sm text-slate-300">Role *</label>
                            <Select value={inviteForm.role} onValueChange={(v) => setInviteForm((p) => ({ ...p, role: v }))}>
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                    {assignableRoles.map((r) => (
                                        <SelectItem key={r} value={r} className="text-white">
                                            {r}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-slate-400 mt-1">
                                You cannot assign a role equal to or above your own.
                            </div>
                        </div>

                        <Button
                            type="button"
                            className="w-full bg-blue-600 hover:bg-blue-700"
                            onClick={() => submitInvite.mutate()}
                            disabled={submitInvite.isPending}
                        >
                            {submitInvite.isPending ? "Submitting..." : "Submit"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}