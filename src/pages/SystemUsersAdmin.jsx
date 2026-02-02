// src/pages/SystemUsersAdmin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where, orderBy, limit, setDoc, doc } from "firebase/firestore";
import { db } from "@/firebase";
import { Button } from "@/components/ui/button";
import { ENTITY_ROLES } from "@/lib/rbac";
import { useAuth } from "@/context/AuthContext";

function isoNow() {
    return new Date().toISOString();
}

function safeLower(s) {
    return String(s || "").trim().toLowerCase();
}

export default function SystemUsersAdmin() {
    const { user } = useAuth();

    const [entities, setEntities] = useState([]);
    const [loadingEntities, setLoadingEntities] = useState(true);

    const [email, setEmail] = useState("");
    const [entityId, setEntityId] = useState("");
    const [role, setRole] = useState(ENTITY_ROLES.User);

    const [result, setResult] = useState("");
    const [error, setError] = useState("");

    async function loadEntities() {
        setLoadingEntities(true);
        try {
            const qRef = query(collection(db, "businessEntities"), where("active", "==", true), orderBy("created_at", "desc"));
            const snap = await getDocs(qRef);
            const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
            setEntities(list);
            if (!entityId && list.length) setEntityId(list[0].id);
        } catch (e) {
            console.error(e);
            setEntities([]);
        } finally {
            setLoadingEntities(false);
        }
    }

    useEffect(() => {
        loadEntities();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function findUserByEmail(emailLower) {
        const qRef = query(collection(db, "User"), where("email", "==", emailLower), limit(1));
        const snap = await getDocs(qRef);
        if (!snap.docs.length) return null;
        const d = snap.docs[0];
        return { id: d.id, ...(d.data() || {}) };
    }

    async function assign(e) {
        e.preventDefault();
        setError("");
        setResult("");

        const em = safeLower(email);
        if (!em || !em.includes("@")) {
            setError("Enter a valid email.");
            return;
        }
        if (!entityId) {
            setError("Select an entity.");
            return;
        }

        try {
            const u = await findUserByEmail(em);

            if (!u?.id) {
                // SystemAdmin: create an approved provisioning request (until callable function exists)
                await setDoc(doc(collection(db, "userProvisionRequests")), {
                    entity_id: entityId,
                    requested_email: em,
                    requested_full_name: "",
                    requested_entity_role: role,
                    status: "Approved",
                    created_at: isoNow(),
                    requested_by_uid: user?.id || user?.uid || null,
                    requested_by_name: user?.full_name || "SystemAdmin",
                    reviewed_by_uid: user?.id || user?.uid || null,
                    reviewed_at: isoNow(),
                    note: "SystemAdmin assignment requested. User does not exist yet.",
                });

                setResult("User not found. Created an approved provisioning request.");
                setEmail("");
                return;
            }

            const uid = u.id;

            // member doc for easy querying
            await setDoc(
                doc(db, "businessEntities", entityId, "members", uid),
                {
                    uid,
                    email: u.email || em,
                    full_name: u.full_name || "",
                    role,
                    active: true,
                    added_at: isoNow(),
                    added_by: user?.id || user?.uid || null,
                    updated_at: isoNow(),
                    updated_by: user?.id || user?.uid || null,
                },
                { merge: true }
            );

            // user profile backfill
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

            setResult("Assigned user to business unit.");
            setEmail("");
        } catch (e2) {
            console.error(e2);
            setError("Could not assign user.");
        }
    }

    const entityOptions = useMemo(() => entities || [], [entities]);

    return (
        <div className="p-6">
            <div className="max-w-4xl mx-auto">
                <div className="text-xl font-bold">System Users Admin</div>
                <div className="text-xs text-slate-400">
                    Platform-level assignment of users to business units (provisioning still needed for new emails).
                </div>

                {(error || result) && (
                    <div
                        className={[
                            "mt-4 rounded-xl border px-4 py-3 text-sm",
                            error
                                ? "border-red-900/60 bg-red-950/30 text-red-200"
                                : "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
                        ].join(" ")}
                    >
                        {error || result}
                    </div>
                )}

                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                    <div className="flex items-center justify-between">
                        <div className="font-semibold">Assign user to a business unit</div>
                        <Button
                            variant="secondary"
                            className="bg-slate-800 hover:bg-slate-700 text-white"
                            onClick={loadEntities}
                            disabled={loadingEntities}
                        >
                            {loadingEntities ? "Refreshing…" : "Refresh entities"}
                        </Button>
                    </div>

                    <form onSubmit={assign} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">User email *</label>
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                placeholder="person@company.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">Business unit *</label>
                            <select
                                value={entityId}
                                onChange={(e) => setEntityId(e.target.value)}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white"
                                disabled={loadingEntities}
                            >
                                {entityOptions.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.name || e.id} ({e.type || "UNKNOWN"})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">Entity role</label>
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white"
                            >
                                <option value={ENTITY_ROLES.User}>User</option>
                                <option value={ENTITY_ROLES.ContractManager}>ContractManager</option>
                                <option value={ENTITY_ROLES.Manager}>Manager</option>
                                <option value={ENTITY_ROLES.GeneralManager}>GeneralManager</option>
                            </select>
                        </div>

                        <div className="flex items-end">
                            <Button className="bg-blue-600 hover:bg-blue-700" type="submit">
                                Assign
                            </Button>
                        </div>
                    </form>

                    <div className="mt-3 text-xs text-slate-500">
                        If the email does not exist in <code className="text-slate-300">/User</code>, we create an approved provisioning request.
                    </div>
                </div>
            </div>
        </div>
    );
}
