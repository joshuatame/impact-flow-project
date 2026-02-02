import React, { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db, functions } from "@/firebase";
import { getActiveEntity } from "@/lib/activeEntity";
import { useAuth } from "@/context/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Send, RefreshCw, CheckCircle2 } from "lucide-react";

const ROLE_ORDER = ["User", "ContractManager", "Manager", "GeneralManager", "SystemAdmin"];
function roleRank(role) {
    const idx = ROLE_ORDER.indexOf(role);
    return idx === -1 ? 0 : idx;
}

function getMyEntityRole(user, entityId) {
    const r = user?.entity_access?.[entityId]?.role;
    if (r) return r;
    return user?.app_role || "User";
}

function allowedRolesForUI(myRole) {
    if (myRole === "SystemAdmin") return ["GeneralManager", "Manager", "ContractManager", "User"];
    if (myRole === "GeneralManager") return ["Manager", "ContractManager", "User"];
    if (myRole === "Manager") return ["ContractManager", "User"]; // requests only (function enforces)
    return [];
}

export default function EmailsPanel() {
    const { user } = useAuth();
    const activeEntity = useMemo(() => getActiveEntity(), []);
    const entityId = activeEntity?.id || "";
    const entityName = activeEntity?.name || "Business Unit";

    const myRole = useMemo(() => getMyEntityRole(user, entityId), [user, entityId]);
    const roleOptions = useMemo(() => allowedRolesForUI(myRole), [myRole]);

    const [email, setEmail] = useState("");
    const [role, setRole] = useState(roleOptions[0] || "User");

    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState({ type: "", text: "" });

    const [invites, setInvites] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loadingLists, setLoadingLists] = useState(true);

    useEffect(() => {
        setRole(roleOptions[0] || "User");
    }, [roleOptions]);

    async function loadLists() {
        if (!entityId) return;
        setLoadingLists(true);
        try {
            const invQ = query(
                collection(db, "userInvites"),
                where("entity_id", "==", entityId),
                orderBy("created_at", "desc")
            );
            const reqQ = query(
                collection(db, "userInviteRequests"),
                where("entity_id", "==", entityId),
                orderBy("created_at", "desc")
            );

            const [invSnap, reqSnap] = await Promise.all([getDocs(invQ), getDocs(reqQ)]);
            setInvites(invSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
            setRequests(reqSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
        } catch (e) {
            console.error(e);
            setInvites([]);
            setRequests([]);
        } finally {
            setLoadingLists(false);
        }
    }

    useEffect(() => {
        loadLists();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityId]);

    async function submitInvite() {
        setMsg({ type: "", text: "" });

        const trimmed = String(email || "").trim().toLowerCase();
        if (!trimmed) return setMsg({ type: "error", text: "Email is required." });
        if (!entityId) return setMsg({ type: "error", text: "No active business unit selected." });
        if (!roleOptions.includes(role)) return setMsg({ type: "error", text: "Invalid role." });

        setBusy(true);
        try {
            const fn = httpsCallable(functions, "submitUserInvite");
            const res = await fn({ email: trimmed, entityId, role });

            const out = res?.data || {};
            if (out.mode === "sent") {
                setMsg({ type: "success", text: `Invite sent to ${trimmed} for ${entityName}` });
            } else if (out.mode === "requested") {
                setMsg({ type: "success", text: `Invite request created (awaiting General Manager approval).` });
            } else {
                setMsg({ type: "success", text: "Done." });
            }

            setEmail("");
            await loadLists();
        } catch (e) {
            console.error(e);
            setMsg({ type: "error", text: e?.message || "Could not submit invite." });
        } finally {
            setBusy(false);
        }
    }

    async function approveRequest(requestId) {
        setMsg({ type: "", text: "" });
        setBusy(true);
        try {
            const fn = httpsCallable(functions, "approveUserInviteRequest");
            await fn({ requestId });
            setMsg({ type: "success", text: "Approved and invite email sent." });
            await loadLists();
        } catch (e) {
            console.error(e);
            setMsg({ type: "error", text: e?.message || "Could not approve." });
        } finally {
            setBusy(false);
        }
    }

    const canApprove = myRole === "SystemAdmin" || myRole === "GeneralManager";

    return (
        <div className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Invites (Postmark)
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    {msg.text && (
                        <div
                            className={[
                                "rounded-xl border px-4 py-3 text-sm",
                                msg.type === "error"
                                    ? "border-red-900/60 bg-red-950/30 text-red-200"
                                    : "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
                            ].join(" ")}
                        >
                            {msg.text}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                            <Label className="text-slate-300">Email</Label>
                            <Input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                className="bg-slate-800 border-slate-700 text-white"
                                disabled={busy}
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Role</Label>
                            <Select value={role} onValueChange={setRole} disabled={busy || !roleOptions.length}>
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    {roleOptions.map((r) => (
                                        <SelectItem key={r} value={r} className="text-white">
                                            {r}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!roleOptions.length && (
                                <p className="text-xs text-slate-500 mt-1">You don’t have permission to invite.</p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={submitInvite}
                            disabled={busy || !roleOptions.length || !email.trim()}
                            className="bg-blue-600 hover:bg-blue-700"
                            type="button"
                        >
                            <Send className="h-4 w-4 mr-2" />
                            {busy ? "Working…" : myRole === "Manager" ? "Submit request" : "Send invite"}
                        </Button>

                        <Button
                            variant="secondary"
                            className="bg-slate-800 hover:bg-slate-700 text-white"
                            onClick={loadLists}
                            disabled={busy || loadingLists}
                            type="button"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Invite requests (Manager → GM approval)</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingLists ? (
                        <div className="text-sm text-slate-400">Loading…</div>
                    ) : requests.length ? (
                        <div className="space-y-3">
                            {requests.slice(0, 25).map((r) => (
                                <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium text-white truncate">{r.email}</div>
                                        <div className="text-xs text-slate-400 mt-1">
                                            Role: <span className="text-slate-200">{r.role}</span> · Status:{" "}
                                            <span className="text-slate-200">{r.status}</span>
                                        </div>
                                        {r.requested_by_name && (
                                            <div className="text-[11px] text-slate-500 mt-1">Requested by {r.requested_by_name}</div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {r.status === "Approved" && (
                                            <span className="text-emerald-300 text-sm flex items-center">
                                                <CheckCircle2 className="h-4 w-4 mr-1" /> Approved
                                            </span>
                                        )}
                                        {r.status === "Pending" && canApprove && (
                                            <Button
                                                className="bg-emerald-600 hover:bg-emerald-700"
                                                onClick={() => approveRequest(r.id)}
                                                disabled={busy}
                                                type="button"
                                            >
                                                Approve & send
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-slate-400">No requests.</div>
                    )}
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Sent invites</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingLists ? (
                        <div className="text-sm text-slate-400">Loading…</div>
                    ) : invites.length ? (
                        <div className="space-y-3">
                            {invites.slice(0, 25).map((i) => (
                                <div key={i.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                                    <div className="font-medium text-white">{i.email}</div>
                                    <div className="text-xs text-slate-400 mt-1">
                                        Role: <span className="text-slate-200">{i.role}</span> · Status:{" "}
                                        <span className="text-slate-200">{i.status}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-slate-400">No invites yet.</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}