/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerCandidates.jsx  (REPLACE ENTIRE FILE)
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog.jsx";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table.jsx";

import * as SpinnerModule from "@/components/ui/LoadingSpinner.jsx";
import { listCandidatesForEntity, createCandidate } from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";
import { getEntityIdOrThrow } from "@/businessUnits/LABOURHIRE/pages/manager/_entity.js";

const LoadingSpinner = SpinnerModule.LoadingSpinner ?? SpinnerModule.default;

function safeText(v) {
    return String(v ?? "").trim();
}

export default function ManagerCandidates() {
    const nav = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [candidates, setCandidates] = useState([]);
    const [q, setQ] = useState("");

    const [open, setOpen] = useState(false);
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [creating, setCreating] = useState(false);

    async function refresh() {
        setLoading(true);
        setError("");
        try {
            const entityId = getEntityIdOrThrow();
            const cands = await listCandidatesForEntity({ entityId, limitCount: 5000 });
            setCandidates(cands || []);
        } catch (e) {
            setCandidates([]);
            setError(e?.message || "Failed to load candidates.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = useMemo(() => {
        const needle = safeText(q).toLowerCase();
        if (!needle) return candidates;

        return (candidates || []).filter((c) => {
            const name = safeText(c?.profile?.fullName || c?.profile?.name).toLowerCase();
            const em = safeText(c?.profile?.email).toLowerCase();
            return name.includes(needle) || em.includes(needle);
        });
    }, [candidates, q]);

    async function onCreate() {
        const name = safeText(fullName);
        if (!name) return;

        setCreating(true);
        setError("");
        try {
            const entityId = getEntityIdOrThrow();
            const id = await createCandidate({
                entityId,
                data: {
                    status: "onboarding",
                    profile: { fullName: name, email: safeText(email) },
                },
            });

            setOpen(false);
            setFullName("");
            setEmail("");
            await refresh();
            nav(`/labourhire/manager/candidates/${id}`);
        } catch (e) {
            setError(e?.message || "Failed to create candidate.");
        } finally {
            setCreating(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2">
                {LoadingSpinner ? <LoadingSpinner /> : null}
                <div className="text-sm text-muted-foreground">Loading candidates…</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-2xl font-semibold">Candidates</div>
                    <div className="text-sm text-muted-foreground">Add, search, and drill into candidate profiles.</div>
                </div>
                <Button onClick={() => setOpen(true)} type="button">
                    Add candidate
                </Button>
            </div>

            {error ? (
                <Card>
                    <CardContent className="p-4 text-sm text-red-400">{error}</CardContent>
                </Card>
            ) : null}

            <Card>
                <CardContent className="p-4 space-y-3">
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" />
                    <Separator />
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(filtered || []).map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-medium">{c?.profile?.fullName || c?.profile?.name || "—"}</TableCell>
                                        <TableCell>{c?.profile?.email || "—"}</TableCell>
                                        <TableCell>{c.status || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild size="sm" variant="outline">
                                                <Link to={`/labourhire/manager/candidates/${c.id}`}>View</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!filtered || filtered.length === 0) ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                                            No candidates found.
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add a new candidate</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium">Full name</div>
                            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Citizen" />
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium">Email (optional)</div>
                            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. jane@email.com" />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)} type="button">
                            Cancel
                        </Button>
                        <Button onClick={onCreate} disabled={creating || !safeText(fullName)} type="button">
                            {creating ? "Creating…" : "Create"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}