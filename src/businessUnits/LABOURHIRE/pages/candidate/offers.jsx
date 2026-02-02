// =================================================================================================
// File: src/businessUnits/LABOURHIRE/pages/candidate/offers.jsx
// =================================================================================================
import React, { useEffect, useMemo, useState } from "react";
import { auth } from "@/firebase";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.jsx";

import { getWfConnectUser, listPlacementsForCandidate } from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";

function fmtDate(v) {
    if (!v) return "—";
    try {
        const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleDateString();
    } catch {
        return "—";
    }
}

export default function CandidateOffers() {
    const [rows, setRows] = useState([]);
    const [wf, setWf] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    const uid = auth.currentUser?.uid || null;

    useEffect(() => {
        let alive = true;

        async function load() {
            setLoading(true);
            setErr("");
            try {
                if (!uid) throw new Error("Not signed in.");

                const wfDoc = await getWfConnectUser(uid);
                if (!wfDoc?.entityId || !wfDoc?.candidateId) {
                    throw new Error("No candidate linked to this user.");
                }

                const data = await listPlacementsForCandidate({
                    entityId: wfDoc.entityId,
                    candidateId: wfDoc.candidateId,
                    statusList: ["offered", "offer", "pending", "active"],
                    limitCount: 200,
                }).catch(() => []);

                if (!alive) return;
                setWf(wfDoc);
                setRows(Array.isArray(data) ? data : []);
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load offers.");
            } finally {
                if (alive) setLoading(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [uid]);

    const offered = useMemo(
        () => rows.filter((r) => String(r.status || "").toLowerCase().includes("offer")),
        [rows],
    );

    return (
        <div className="space-y-4">
            <PageHeader title="Offers" subtitle="Review your job offers and proposed placements" />

            {err ? (
                <Alert variant="destructive">
                    <AlertTitle>Offers unavailable</AlertTitle>
                    <AlertDescription>{err}</AlertDescription>
                </Alert>
            ) : null}

            <Card className="border-slate-800 bg-slate-900/40">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        Offers & placements
                        <Badge variant="secondary">{loading ? "Loading…" : `${rows.length}`}</Badge>
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                    <div className="text-sm text-slate-400">
                        This screen was previously broken. It now renders safely and will show placements tagged as offers
                        (status contains “offer”) when available.
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Company</TableHead>
                                <TableHead>Start</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {offered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-slate-400">
                                        {loading ? "Loading…" : "No offers yet."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                offered.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>
                                            <Badge variant="secondary" className="capitalize">
                                                {String(r.status || "offer")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{r.roleTitle || r.role || "—"}</TableCell>
                                        <TableCell>{r.hiringCompanyName || r.companyName || "—"}</TableCell>
                                        <TableCell>{fmtDate(r.startDate || r.startAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" disabled title="Hook acceptance flow here">
                                                    Accept
                                                </Button>
                                                <Button size="sm" variant="outline" disabled title="Hook decline flow here">
                                                    Decline
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    <div className="text-xs text-slate-400">
                        Candidate: <code>{wf?.candidateId || "—"}</code> • Entity: <code>{wf?.entityId || "—"}</code>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
