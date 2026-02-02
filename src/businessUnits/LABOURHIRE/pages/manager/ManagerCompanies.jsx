/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerCompanies.jsx  (REPLACE ENTIRE FILE)
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
import { listHiringCompanies, createHiringCompany, listCandidatesForEntity } from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";
import { getEntityIdOrThrow } from "@/businessUnits/LABOURHIRE/pages/manager/_entity.js";

const LoadingSpinner = SpinnerModule.LoadingSpinner ?? SpinnerModule.default;

function safeText(v) {
    return String(v ?? "").trim();
}

export default function ManagerCompanies() {
    const nav = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [companies, setCompanies] = useState([]);
    const [candidates, setCandidates] = useState([]);

    const [q, setQ] = useState("");

    const [open, setOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newAbn, setNewAbn] = useState("");
    const [creating, setCreating] = useState(false);

    async function refresh() {
        setLoading(true);
        setError("");
        try {
            const entityId = getEntityIdOrThrow();
            const [cs, cands] = await Promise.all([
                listHiringCompanies({ entityId, limitCount: 2000 }),
                listCandidatesForEntity({ entityId, limitCount: 5000 }),
            ]);
            setCompanies(cs || []);
            setCandidates(cands || []);
        } catch (e) {
            setCompanies([]);
            setCandidates([]);
            setError(e?.message || "Failed to load companies.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const companyCandidateCount = useMemo(() => {
        const map = new Map();
        (companies || []).forEach((c) => map.set(c.id, 0));

        (candidates || []).forEach((cand) => {
            const allow = cand?.share?.allowCompanyIds || [];
            (Array.isArray(allow) ? allow : []).forEach((companyId) => {
                map.set(companyId, (map.get(companyId) || 0) + 1);
            });
        });

        return map;
    }, [companies, candidates]);

    const filtered = useMemo(() => {
        const needle = safeText(q).toLowerCase();
        if (!needle) return companies;

        return (companies || []).filter((c) => {
            const name = safeText(c.name).toLowerCase();
            const abn = safeText(c.abn).toLowerCase();
            return name.includes(needle) || abn.includes(needle);
        });
    }, [companies, q]);

    async function onCreate() {
        const name = safeText(newName);
        if (!name) return;

        setCreating(true);
        setError("");
        try {
            const entityId = getEntityIdOrThrow();
            const id = await createHiringCompany({
                entityId,
                data: { name, abn: safeText(newAbn) },
            });
            setOpen(false);
            setNewName("");
            setNewAbn("");
            await refresh();
            nav(`/labourhire/manager/companies/${id}`);
        } catch (e) {
            setError(e?.message || "Failed to create company.");
        } finally {
            setCreating(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2">
                {LoadingSpinner ? <LoadingSpinner /> : null}
                <div className="text-sm text-muted-foreground">Loading companies…</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-2xl font-semibold">Companies</div>
                    <div className="text-sm text-muted-foreground">Add, search, and drill into company performance.</div>
                </div>
                <Button onClick={() => setOpen(true)} type="button">
                    Add company
                </Button>
            </div>

            {error ? (
                <Card>
                    <CardContent className="p-4 text-sm text-red-400">{error}</CardContent>
                </Card>
            ) : null}

            <Card>
                <CardContent className="p-4 space-y-3">
                    <Input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by name or ABN…"
                    />
                    <Separator />
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company</TableHead>
                                    <TableHead>ABN</TableHead>
                                    <TableHead className="text-right">Visible candidates</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(filtered || []).map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-medium">{c.name || "—"}</TableCell>
                                        <TableCell>{c.abn || "—"}</TableCell>
                                        <TableCell className="text-right">{companyCandidateCount.get(c.id) || 0}</TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild size="sm" variant="outline">
                                                <Link to={`/labourhire/manager/companies/${c.id}`}>View</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!filtered || filtered.length === 0) ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                                            No companies found.
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
                        <DialogTitle>Add a new company</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium">Company name</div>
                            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. ACME Pty Ltd" />
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium">ABN (optional)</div>
                            <Input value={newAbn} onChange={(e) => setNewAbn(e.target.value)} placeholder="e.g. 12 345 678 901" />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)} type="button">
                            Cancel
                        </Button>
                        <Button onClick={onCreate} disabled={creating || !safeText(newName)} type="button">
                            {creating ? "Creating…" : "Create"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}