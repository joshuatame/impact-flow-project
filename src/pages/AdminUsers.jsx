// src/pages/AdminUsers.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
    collection,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    setDoc,
    updateDoc,
    orderBy,
} from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import { getActiveEntityId } from "@/lib/activeEntity";
import { Button } from "@/components/ui/button";
import { canAssignEntityRole, ENTITY_ROLES, getEntityRoleForUser, GLOBAL_ROLES } from "@/lib/rbac";

function isoNow() {
    return new Date().toISOString();
}

function safeLower(s) {
    return String(s || "").trim().toLowerCase();
}

async function findUserByEmail(email) {
    const qRef = query(collection(db, "User"), where("email", "==", email));
    const snap = await getDocs(qRef);
    if (!snap.docs.length) return null;
    const d = snap.docs[0];
    return { id: d.id, ...(d.data() || {}) };
}

export default function AdminUsers() {
    const { user } = useAuth();
    const entityId = useMemo(() => getActiveEntityId(), []);
    const myRole = useMemo(() => getEntityRoleForUser(user, entityId), [user, entityId]);

    const canManage =
        myRole === GLOBAL_ROLES.SystemAdmin || myRole === ENTITY_ROLES.GeneralManager;

    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState([]);

    const [email, setEmail] = useState("");
    const [fullName, setFullName] = useState("");
    const [role, setRole] = useState(ENTITY_ROLES.User);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    async function loadMembers() {
        if (!entityId) return;
        setLoading(true);
        try {
            const qRef = query(
                collection(db, "businessEntities", entityId, "members"),
                orderBy("added_at", "desc")
            );
            const snap = await getDocs(qRef);
            setMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
        } catch (e) {
            console.error(e);
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMembers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entityId]);

    async function addMember(e) {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!canManage) {
            setError("General Manager only.");
            return;
        }

        const em = safeLower(email);
        if (!em || !em.includes("@")) {
            setError("Enter a valid email.");
            return;
        }

        // enforce role assignment rules
        const actor = myRole === GLOBAL_ROLES.SystemAdmin ? GLOBAL_ROLES.SystemAdmin : myRole;
        if (actor !== GLOBAL_ROLES.SystemAdmin && !canAssignEntityRole(actor, role)) {
            setError("You cannot assign this role.");
            return;
        }

        try {
            const existing = await findUserByEmail(em);

            if (!existing?.id) {
                // user not found → create a request (still useful even for GM, until invite function exists)
                await setDoc(doc(collection(db, "userProvisionRequests")), {
                    entity_id: entityId,
                    requested_email: em,
                    requested_full_name: String(fullName || "").trim(),
                    requested_entity_role: role,
                    status: "Approved", // GM “direct add” approves immediately, but provisioning still needed
                    created_at: isoNow(),
                    requested_by_uid: user?.id || user?.uid || null,
                    requested_by_name: user?.full_name || "",
                    reviewed_by_uid: user?.id || user?.uid || null,
                    reviewed_at: isoNow(),
                    note: "User does not exist yet. Provisioning required.",
                });

                setSuccess("User not found in platform. Created an approved provisioning request.");
                setEmail("");
                setFullName("");
                setRole(ENTITY_ROLES.User);
                return;
            }

            const uid = existing.id;

            // 1) write member doc (best query path)
            await setDoc(
                doc(db, "businessEntities", entityId, "members", uid),
                {
                    uid,
                    email: existing.email || em,
                    full_name: existing.full_name || String(fullName || "").trim(),
                    role,
                    active: true,
                    added_at: isoNow(),
                    added_by: user?.id || user?.uid || null,
                    updated_at: isoNow(),
                    updated_by: user?.id || user?.uid || null,
                },
                { merge: true }
            );

            // 2) backfill entity_access on user profile
            await setDoc(
                doc(db, "User", uid),
                {
                    entity_access: {
                        [entityId]: {
                            active: true,
                            role,
                            assigned_at: isoNow(),
                            assigned_by: user?.id || user?.uid || null,
                        },
                    },
                },
                { merge: true }
            );

            setSuccess("Member added.");
            setEmail("");
            setFullName("");
            setRole(ENTITY_ROLES.User);

            await loadMembers();
        } catch (e2) {
            console.error(e2);
            setError("Could not add member.");
        }
    }

    async function updateMemberRole(memberUid, nextRole) {
        setError("");
        setSuccess("");

        if (!canManage) {
            setError("General Manager only.");
            return;
        }

        const actor = myRole === GLOBAL_ROLES.SystemAdmin ? GLOBAL_ROLES.SystemAdmin : myRole;
        if (actor !== GLOBAL_ROLES.SystemAdmin && !canAssignEntityRole(actor, nextRole)) {
            setError("You cannot assign this role.");
            return;
        }

        try {
            await updateDoc(doc(db, "businessEntities", entityId, "members", memberUid), {
                role: nextRole,
                updated_at: isoNow(),
                updated_by: user?.id || user?.uid || null,
            });

            await setDoc(
                doc(db, "User", memberUid),
                {
                    entity_access: {
                        [entityId]: {
                            active: true,
                            role: nextRole,
                            assigned_at: isoNow(),
                            assigned_by: user?.id || user?.uid || null,
                        },
                    },
                },
                { merge: true }
            );

            setSuccess("Role updated.");
            await loadMembers();
        } catch (e) {
            console.error(e);
            setError("Could not update role.");
        }
    }

    async function toggleMemberActive(memberUid, currentActive) {
        setError("");
        setSuccess("");

        if (!canManage) {
            setError("General Manager only.");
            return;
        }

        try {
            const nextActive = !currentActive;

            await updateDoc(doc(db, "businessEntities", entityId, "members", memberUid), {
                active: nextActive,
                updated_at: isoNow(),
                updated_by: user?.id || user?.uid || null,
            });

            await setDoc(
                doc(db, "User", memberUid),
                {
                    entity_access: {
                        [entityId]: {
                            active: nextActive,
                            // keep role if it exists
                            role: (await getDoc(doc(db, "businessEntities", entityId, "members", memberUid))).data()?.role || ENTITY_ROLES.User,
                            assigned_at: isoNow(),
                            assigned_by: user?.id || user?.uid || null,
                        },
                    },
                },
                { merge: true }
            );

            setSuccess(nextActive ? "Member activated." : "Member deactivated.");
            await loadMembers();
        } catch (e) {
            console.error(e);
            setError("Could not update member.");
        }
    }

    return (
        <div className="p-6">
            <div className="max-w-5xl mx-auto">
                <div className="text-xl font-bold">Users</div>
                <div className="text-xs text-slate-400">
                    Manage members for the currently selected business unit.
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

                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div className="flex items-center justify-between">
                        <div className="font-semibold">Add member</div>
                        <Button
                            variant="secondary"
                            className="bg-slate-800 hover:bg-slate-700 text-white"
                            onClick={loadMembers}
                            disabled={loading}
                        >
                            {loading ? "Refreshing…" : "Refresh"}
                        </Button>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                        Note: if the email doesn’t exist in the platform yet, an approved provisioning request is created.
                    </div>

                    <form onSubmit={addMember} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">Email *</label>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                placeholder="person@company.com"
                                required
                                disabled={!canManage}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">Full name</label>
                            <input
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                placeholder="Optional"
                                disabled={!canManage}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">Role</label>
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                disabled={!canManage}
                            >
                                <option value={ENTITY_ROLES.User}>User</option>
                                <option value={ENTITY_ROLES.ContractManager}>ContractManager</option>
                                <option value={ENTITY_ROLES.Manager}>Manager</option>
                                <option value={ENTITY_ROLES.GeneralManager}>GeneralManager</option>
                            </select>
                        </div>

                        <div className="flex items-end">
                            <Button className="bg-blue-600 hover:bg-blue-700" type="submit" disabled={!canManage}>
                                Add member
                            </Button>
                        </div>
                    </form>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div className="font-semibold">Members</div>

                    {loading ? (
                        <div className="mt-3 text-sm text-slate-400">Loading…</div>
                    ) : members.length ? (
                        <div className="mt-4 space-y-3">
                            {members.map((m) => (
                                <div key={m.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold truncate">{m.full_name || "User"}</div>
                                            <div className="text-xs text-slate-400 mt-1">{m.email || m.id}</div>
                                            <div className="text-[11px] text-slate-600 mt-2">
                                                Role: <span className="text-slate-200">{m.role || ENTITY_ROLES.User}</span> •{" "}
                                                <span className={m.active ? "text-emerald-300" : "text-red-300"}>
                                                    {m.active ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <select
                                                value={m.role || ENTITY_ROLES.User}
                                                onChange={(e) => updateMemberRole(m.id, e.target.value)}
                                                className="rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white"
                                                disabled={!canManage}
                                            >
                                                <option value={ENTITY_ROLES.User}>User</option>
                                                <option value={ENTITY_ROLES.ContractManager}>ContractManager</option>
                                                <option value={ENTITY_ROLES.Manager}>Manager</option>
                                                <option value={ENTITY_ROLES.GeneralManager}>GeneralManager</option>
                                            </select>

                                            <Button
                                                variant="secondary"
                                                className="bg-slate-800 hover:bg-slate-700 text-white"
                                                onClick={() => toggleMemberActive(m.id, !!m.active)}
                                                disabled={!canManage}
                                            >
                                                {m.active ? "Deactivate" : "Activate"}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="text-[11px] text-slate-600 mt-3 break-all">
                                        UID: {m.id}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-3 text-sm text-slate-400">No members found.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
