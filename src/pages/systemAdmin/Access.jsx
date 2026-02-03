// src/pages/systemAdmin/Access.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { Panel, CardShell, FieldLabel } from "./_ui.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ENTITY_ROLES = ["SystemAdmin", "GeneralManager", "Manager", "ContractManager", "User"];

function norm(v) {
    return String(v || "").trim().toLowerCase();
}

function getDisplayName(u) {
    return u.full_name || u.display_name || u.email || u.id || "User";
}

export default function Access() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [users, setUsers] = useState([]);
    const [entities, setEntities] = useState([]);

    const [qText, setQText] = useState("");
    const [openUser, setOpenUser] = useState(null);

    async function load() {
        setLoading(true);
        setError("");

        try {
            const usersSnap = await getDocs(query(collection(db, "User"), orderBy("created_at", "desc"), limit(250)));
            setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

            const entSnap = await getDocs(query(collection(db, "businessEntities"), orderBy("name", "asc")));
            setEntities(entSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
            setError("Could not load users/entities.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        const qn = norm(qText);
        if (!qn) return users;

        return users.filter((u) => {
            const h = `${u.full_name || ""} ${u.email || ""} ${u.app_role || ""}`.toLowerCase();
            return h.includes(qn);
        });
    }, [users, qText]);

    async function saveUser(uid, patch) {
        await updateDoc(doc(db, "User", uid), patch);
        setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, ...patch } : u)));
    }

    function openEditor(user) {
        const current = {
            id: user.id,
            email: user.email || "",
            full_name: user.full_name || "",
            app_role: user.app_role || "User",
            entity_access: user.entity_access || {},
        };
        setOpenUser(current);
    }

    function patchEntityAccess(entityId, next) {
        setOpenUser((p) => ({
            ...p,
            entity_access: {
                ...(p?.entity_access || {}),
                [entityId]: next,
            },
        }));
    }

    function removeEntityAccess(entityId) {
        setOpenUser((p) => {
            const next = { ...(p?.entity_access || {}) };
            delete next[entityId];
            return { ...p, entity_access: next };
        });
    }

    async function saveOpenUser() {
        if (!openUser?.id) return;
        setError("");
        try {
            await saveUser(openUser.id, {
                app_role: openUser.app_role,
                full_name: openUser.full_name,
                entity_access: openUser.entity_access || {},
            });
            setOpenUser(null);
        } catch (e) {
            console.error(e);
            setError("Could not save access changes.");
        }
    }

    if (loading) return <LoadingSpinner />;

    return (
        <Panel title="Access" subtitle="Review and edit entity_access privileges">
            {error ? (
                <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            ) : null}

            <CardShell>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div className="text-sm text-slate-300">Click a user to edit privileges.</div>
                    <Input
                        className="bg-slate-950 border-slate-800 sm:w-72"
                        placeholder="Search…"
                        value={qText}
                        onChange={(e) => setQText(e.target.value)}
                    />
                </div>

                <div className="mt-4 overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-slate-300">User</TableHead>
                                <TableHead className="text-slate-300">App role</TableHead>
                                <TableHead className="text-slate-300">Entities</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map((u) => {
                                const access = u.entity_access || {};
                                const n = Object.keys(access).length;

                                return (
                                    <TableRow key={u.id}>
                                        <TableCell>
                                            <div className="font-medium text-white">{getDisplayName(u)}</div>
                                            <div className="text-xs text-slate-400">{u.email || "—"}</div>
                                        </TableCell>
                                        <TableCell className="text-slate-200">{u.app_role || "—"}</TableCell>
                                        <TableCell className="text-slate-200">{n}</TableCell>
                                        <TableCell className="text-right">
                                            <Button type="button" variant="secondary" onClick={() => openEditor(u)}>
                                                Edit
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    {!filtered.length ? <div className="mt-4 text-sm text-slate-400">No users.</div> : null}
                </div>
            </CardShell>

            <Dialog open={!!openUser} onOpenChange={(v) => (!v ? setOpenUser(null) : null)}>
                <DialogContent className="bg-slate-950 text-white border border-slate-800 max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Edit access</DialogTitle>
                    </DialogHeader>

                    {openUser ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <FieldLabel>Full name</FieldLabel>
                                    <Input
                                        className="mt-2 bg-slate-900 border-slate-800"
                                        value={openUser.full_name}
                                        onChange={(e) => setOpenUser((p) => ({ ...p, full_name: e.target.value }))}
                                    />
                                </div>

                                <div>
                                    <FieldLabel>App role</FieldLabel>
                                    <Select value={openUser.app_role} onValueChange={(v) => setOpenUser((p) => ({ ...p, app_role: v }))}>
                                        <SelectTrigger className="mt-2 bg-slate-900 border-slate-800">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-950 text-white border-slate-800">
                                            {ENTITY_ROLES.map((r) => (
                                                <SelectItem key={r} value={r}>
                                                    {r}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <CardShell className="bg-slate-900/40">
                                <div className="text-sm font-semibold text-white">Entity access</div>
                                <div className="mt-2 text-xs text-slate-400">
                                    Add/adjust roles per business entity. (These control Launchpad + entity scoping.)
                                </div>

                                <div className="mt-3 space-y-2">
                                    {entities.map((ent) => {
                                        const cur = openUser.entity_access?.[ent.id] || null;
                                        const active = cur?.active === true;

                                        return (
                                            <div
                                                key={ent.id}
                                                className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"
                                            >
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                                                    <div className="min-w-0">
                                                        <div className="font-medium text-white truncate">{ent.name || ent.id}</div>
                                                        <div className="text-xs text-slate-400">{ent.type || "—"}</div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Select
                                                            value={cur?.role || "User"}
                                                            onValueChange={(v) =>
                                                                patchEntityAccess(ent.id, {
                                                                    ...(cur || {}),
                                                                    role: v,
                                                                    active: cur ? cur.active !== false : true,
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="bg-slate-900 border-slate-800 h-9 w-44">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-slate-950 text-white border-slate-800">
                                                                {ENTITY_ROLES.map((r) => (
                                                                    <SelectItem key={r} value={r}>
                                                                        {r}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>

                                                        <Select
                                                            value={String(active)}
                                                            onValueChange={(v) =>
                                                                patchEntityAccess(ent.id, {
                                                                    ...(cur || {}),
                                                                    active: v === "true",
                                                                    role: cur?.role || "User",
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="bg-slate-900 border-slate-800 h-9 w-28">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-slate-950 text-white border-slate-800">
                                                                <SelectItem value="true">active</SelectItem>
                                                                <SelectItem value="false">inactive</SelectItem>
                                                            </SelectContent>
                                                        </Select>

                                                        {cur ? (
                                                            <Button type="button" variant="ghost" onClick={() => removeEntityAccess(ent.id)}>
                                                                Remove
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                onClick={() =>
                                                                    patchEntityAccess(ent.id, {
                                                                        active: true,
                                                                        role: "User",
                                                                    })
                                                                }
                                                            >
                                                                Add
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardShell>

                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="secondary" onClick={() => setOpenUser(null)}>
                                    Cancel
                                </Button>
                                <Button type="button" onClick={saveOpenUser}>
                                    Save
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </Panel>
    );
}