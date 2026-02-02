// src/pages/AdminUserRequests.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, addDoc, getDocs, query, where, orderBy, updateDoc, doc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import { getActiveEntityId } from "@/lib/activeEntity";
import { getEntityRoleForUser, ENTITY_ROLES, GLOBAL_ROLES } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

function isoNow() {
    return new Date().toISOString();
}

function safeLower(s) {
    return String(s || "").trim().toLowerCase();
}

export default function AdminUserRequests() {
    const { user } = useAuth();

    const entityId = useMemo(() => getActiveEntityId(), []);
    const myRole = useMemo(() => getEntityRoleForUser(user, entityId), [user, entityId]);

    const canSubmit = myRole === ENTITY_ROLES.Manager || myRole === ENTITY_ROLES.GeneralManager || myRole === GLOBAL_ROLES.SystemAdmin;
    const canReview = myRole === ENTITY_ROLES.GeneralManager || myRole === GLOBAL_ROLES.SystemAdmin;

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);

    const [email, setEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [role, setRole] = useState(ENTITY_ROLES.User);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function load() {
        if (!entityId) return;
        setLoading(true);
        try {
            const qRef = query(
                collection(db, "userProvisionRequests"),
                where("entity_id", "==", entityId),
                orderBy("created_at", "desc")
            );
            const snap = await getDocs(qRef);
            setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
        } catch (e) {
            console.error(e);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityId]);

    async function submitRequest(e) {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!canSubmit) {
            setError("You do not have access to submit requests.");
            return;
        }

        const em = safeLower(email);
        if (!em || !em.includes("@")) {
            setError("Enter a valid email.");
            return;
        }

        try {
            await addDoc(collection(db, "userProvisionRequests"), {
                entity_id: entityId,
                requested_email: em,
                requested_full_name: String(fullName || "").trim(),
                requested_entity_role: role,
                status: "Pending",
                created_at: isoNow(),
                requested_by_uid: user?.id || user?.uid || null,
                requested_by_name: user?.full_name || "",
                reviewed_by_uid: null,
                reviewed_at: null,
            });

            setEmail("");
            setFullName("");
            setRole(ENTITY_ROLES.User);
            setSuccess("Request submitted.");
            await load();
        } catch (e2) {
            console.error(e2);
            setError("Could not submit request.");
        }
    }

    async function setStatus(requestId, nextStatus) {
        setError("");
        setSuccess("");

        if (!canReview) {
            setError("General Manager only.");
            return;
        }

        try {
            await updateDoc(doc(db, "userProvisionRequests", requestId), {
                status: nextStatus,
                reviewed_by_uid: user?.id || user?.uid || null,
                reviewed_at: isoNow(),
            });
            setSuccess(`Request ${nextStatus.toLowerCase()}.`);
            await load();
        } catch (e) {
            console.error(e);
            setError("Could not update request.");
        }
    }

    return (
        <div className="p-6">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xl font-bold">User Requests</div>
                        <div className="text-xs text-slate-400">Managers submit requests. General Managers approve/deny.</div>
                    </div>
                </div>

                {(error || success) && (
                    <div
                        className={[
                            "mt-4 rounded-xl border px-4 py-3 text-sm",
                            error
                                ? "border-red-900/60 bg-red-950/30 text-red-200"
                                : "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
                        ].join(" ")}
                    >
                        {error || success}
                    </div>
                )}

                {canSubmit && (
                    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                        <div className="font-semibold">Submit a request</div>

                        <form onSubmit={submitRequest} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-200 mb-1">Email *</label>
                                <input
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                    placeholder="person@company.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-200 mb-1">Full name</label>
                                <input
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                    placeholder="Optional"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-200 mb-1">Requested role</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                >
                                    <option value={ENTITY_ROLES.User}>User</option>
                                    <option value={ENTITY_ROLES.ContractManager}>ContractManager</option>
                                    <option value={ENTITY_ROLES.Manager}>Manager</option>
                                </select>
                                <div className="mt-1 text-[11px] text-slate-500">
                                    Managers should request roles below Manager (ContractManager/User). GM can request anything below GM.
                                </div>
                            </div>

                            <div className="flex items-end">
                                <Button className="bg-blue-600 hover:bg-blue-700" type="submit">
                                    Submit request
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div className="font-semibold">Requests</div>

                    {loading ? (
                        <div className="mt-3 text-sm text-slate-400">Loading…</div>
                    ) : rows.length ? (
                        <div className="mt-4 space-y-3">
                            {rows.map((r) => (
                                <div key={r.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold truncate">{r.requested_email}</div>
                                            <div className="text-xs text-slate-400 mt-1">
                                                Requested role: <span className="text-slate-200">{r.requested_entity_role || "User"}</span>
                                            </div>
                                            {!!r.requested_full_name && (
                                                <div className="text-xs text-slate-500 mt-1">Name: {r.requested_full_name}</div>
                                            )}
                                            <div className="text-[11px] text-slate-600 mt-2">
                                                Status: <span className="text-slate-300">{r.status}</span> • Created:{" "}
                                                <span className="text-slate-400">{r.created_at}</span>
                                            </div>
                                        </div>

                                        {canReview && r.status === "Pending" && (
                                            <div className="flex gap-2">
                                                <Button
                                                    className="bg-emerald-600 hover:bg-emerald-700"
                                                    onClick={() => setStatus(r.id, "Approved")}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="bg-slate-800 hover:bg-slate-700 text-white"
                                                    onClick={() => setStatus(r.id, "Denied")}
                                                >
                                                    Deny
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {r.status !== "Pending" && (
                                        <div className="text-[11px] text-slate-600 mt-3">
                                            Reviewed by: {r.reviewed_by_uid || "—"} • Reviewed at: {r.reviewed_at || "—"}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-3 text-sm text-slate-400">No requests yet.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
