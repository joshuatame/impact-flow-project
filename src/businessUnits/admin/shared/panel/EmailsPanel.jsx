import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, where, updateDoc, doc } from "firebase/firestore";
import { sendSignInLinkToEmail } from "firebase/auth";
import { db, auth } from "@/firebase";
import { getActiveEntity } from "@/lib/activeEntity";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Send, Copy, CheckCircle2, XCircle } from "lucide-react";

const ROLE_ORDER = ["User", "ContractManager", "Manager", "GeneralManager", "SystemAdmin"];

function roleRank(role) {
    const idx = ROLE_ORDER.indexOf(role);
    return idx === -1 ? 0 : idx;
}

function getMyEntityRole(user, entityId) {
    // Prefer entity-scoped role if present
    const r = user?.entity_access?.[entityId]?.role;
    if (r) return r;

    // Fallback to app_role (legacy)
    return user?.app_role || "User";
}

function allowedInviteRoles(myRole) {
    // SystemAdmin can invite anyone
    if (myRole === "SystemAdmin") return ROLE_ORDER.filter((r) => r !== "SystemAdmin");

    // GeneralManager can invite below them
    if (myRole === "GeneralManager") return ROLE_ORDER.filter((r) => roleRank(r) < roleRank("GeneralManager"));

    // Manager can invite below them (you said Managers *request* new users; we still support sending,
    // but you can later gate this behind a GM approval workflow)
    if (myRole === "Manager") return ROLE_ORDER.filter((r) => roleRank(r) < roleRank("Manager"));

    // Others cannot invite
    return [];
}

export default function EmailsPanel() {
    const { user } = useAuth();
    const activeEntity = useMemo(() => getActiveEntity(), []);
    const entityId = activeEntity?.id || "";
    const entityName = activeEntity?.name || "Business Unit";

    const myRole = useMemo(() => getMyEntityRole(user, entityId), [user, entityId]);
    const roles = useMemo(() => allowedInviteRoles(myRole), [myRole]);

    const [email, setEmail] = useState("");
    const [role, setRole] = useState(roles[0] || "User");
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState({ type: "", message: "" });

    const [invites, setInvites] = useState([]);
    const [loadingInvites, setLoadingInvites] = useState(true);

    useEffect(() => {
        setRole(roles[0] || "User");
    }, [roles]);

    async function loadInvites() {
        if (!entityId) return;
        setLoadingInvites(true);
        try {
            const qRef = query(
                collection(db, "userInvites"),
                where("entity_id", "==", entityId),
                orderBy("created_at", "desc")
            );
            const snap = await getDocs(qRef);
            setInvites(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
        } catch (e) {
            console.error(e);
            setInvites([]);
        } finally {
            setLoadingInvites(false);
        }
    }

    useEffect(() => {
        loadInvites();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityId]);

    async function sendInvite() {
        setStatus({ type: "", message: "" });

        if (!entityId) {
            setStatus({ type: "error", message: "No active business unit selected." });
            return;
        }

        const trimmedEmail = String(email || "").trim().toLowerCase();
        if (!trimmedEmail) {
            setStatus({ type: "error", message: "Email is required." });
            return;
        }

        if (!roles.length) {
            setStatus({ type: "error", message: "You don't have permission to invite users." });
            return;
        }

        if (!roles.includes(role)) {
            setStatus({ type: "error", message: "Invalid role selected." });
            return;
        }

        setSending(true);
        try {
            // 1) Create invite doc first (so we can embed inviteId in the email link)
            const inviteRef = await addDoc(collection(db, "userInvites"), {
                entity_id: entityId,
                entity_name: entityName,
                email: trimmedEmail,
                role,
                status: "sent", // sent | accepted | revoked
                invited_by_uid: user?.id || user?.uid || null,
                invited_by_name: user?.full_name || "",
                created_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            });

            // 2) Send passwordless email link
            // IMPORTANT: You must enable "Email link (passwordless sign-in)" in Firebase Auth.
            const actionCodeSettings = {
                url: `${window.location.origin}/FinishSignIn?inviteId=${inviteRef.id}&entityId=${entityId}`,
                handleCodeInApp: true,
            };

            await sendSignInLinkToEmail(auth, trimmedEmail, actionCodeSettings);

            setStatus({ type: "success", message: `Invite sent to ${trimmedEmail}` });
            setEmail("");
            await loadInvites();
        } catch (e) {
            console.error(e);
            setStatus({ type: "error", message: "Could not send invite. Check Firebase Auth email-link is enabled." });
        } finally {
            setSending(false);
        }
    }

    async function copyInviteLink(inviteId) {
        const link = `${window.location.origin}/FinishSignIn?inviteId=${inviteId}&entityId=${entityId}`;
        try {
            await navigator.clipboard.writeText(link);
            setStatus({ type: "success", message: "Invite link copied." });
        } catch {
            setStatus({ type: "error", message: "Could not copy to clipboard." });
        }
    }

    async function revokeInvite(inviteId) {
        const ok = window.confirm("Revoke this invite?");
        if (!ok) return;
        try {
            await updateDoc(doc(db, "userInvites", inviteId), {
                status: "revoked",
                updated_at: serverTimestamp(),
            });
            await loadInvites();
        } catch (e) {
            console.error(e);
            setStatus({ type: "error", message: "Could not revoke invite." });
        }
    }

    return (
        <div className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Invites
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    {status.message && (
                        <div
                            className={[
                                "rounded-xl border px-4 py-3 text-sm",
                                status.type === "error"
                                    ? "border-red-900/60 bg-red-950/30 text-red-200"
                                    : "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
                            ].join(" ")}
                        >
                            {status.message}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                            <Label className="text-slate-300">Invite email</Label>
                            <Input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                className="bg-slate-800 border-slate-700 text-white"
                                disabled={sending}
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Role</Label>
                            <Select value={role} onValueChange={setRole} disabled={sending || !roles.length}>
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    {roles.map((r) => (
                                        <SelectItem key={r} value={r} className="text-white">
                                            {r}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {!roles.length && <p className="text-xs text-slate-500 mt-1">No invite permission.</p>}
                        </div>
                    </div>

                    <Button
                        onClick={sendInvite}
                        disabled={sending || !roles.length || !email.trim()}
                        className="bg-blue-600 hover:bg-blue-700"
                        type="button"
                    >
                        <Send className="h-4 w-4 mr-2" />
                        {sending ? "Sending…" : "Send invite"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Recent invites</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingInvites ? (
                        <div className="text-sm text-slate-400">Loading…</div>
                    ) : invites.length ? (
                        <div className="space-y-3">
                            {invites.slice(0, 25).map((inv) => (
                                <div
                                    key={inv.id}
                                    className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 flex items-start justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium text-white truncate">{inv.email}</div>
                                        <div className="mt-1 text-xs text-slate-400">
                                            Role: <span className="text-slate-200">{inv.role || "—"}</span>
                                            {" · "}
                                            Status: <span className="text-slate-200">{inv.status || "—"}</span>
                                        </div>
                                        {inv.invited_by_name && (
                                            <div className="mt-1 text-[11px] text-slate-500">Invited by {inv.invited_by_name}</div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            className="bg-slate-800 hover:bg-slate-700 text-white"
                                            onClick={() => copyInviteLink(inv.id)}
                                            type="button"
                                        >
                                            <Copy className="h-4 w-4 mr-2" />
                                            Copy link
                                        </Button>

                                        {inv.status !== "accepted" && inv.status !== "revoked" && (
                                            <Button
                                                variant="destructive"
                                                className="bg-red-600 hover:bg-red-700"
                                                onClick={() => revokeInvite(inv.id)}
                                                type="button"
                                            >
                                                <XCircle className="h-4 w-4 mr-2" />
                                                Revoke
                                            </Button>
                                        )}

                                        {inv.status === "accepted" && (
                                            <div className="flex items-center text-emerald-300 text-sm">
                                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                                Accepted
                                            </div>
                                        )}
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
