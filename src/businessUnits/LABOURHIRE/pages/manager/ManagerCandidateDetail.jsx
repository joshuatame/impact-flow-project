/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerCandidateDetail.jsx  (REPLACE ENTIRE FILE)
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";

import { Card, CardContent } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table.jsx";

import * as SpinnerModule from "@/components/ui/LoadingSpinner.jsx";
import { getEntityIdOrThrow } from "@/businessUnits/LABOURHIRE/pages/manager/_entity.js";
import {
    getCandidate,
    listDocumentsForCandidate,
    listPlacementsForCandidate,
} from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const LoadingSpinner = SpinnerModule.LoadingSpinner ?? SpinnerModule.default;

function tsToDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === "function") return v.toDate();
    const d = new Date(v);
    // eslint-disable-next-line no-restricted-globals
    return isNaN(d.getTime()) ? null : d;
}

function groupByDayCount(rows, dateField = "createdAt") {
    const map = new Map();
    (rows || []).forEach((r) => {
        const d = tsToDate(r?.[dateField]);
        if (!d) return;
        const k = format(d, "yyyy-MM-dd");
        map.set(k, (map.get(k) || 0) + 1);
    });
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
}

export default function ManagerCandidateDetail() {
    const { candidateId } = useParams();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [candidate, setCandidate] = useState(null);
    const [docs, setDocs] = useState([]);
    const [placements, setPlacements] = useState([]);

    useEffect(() => {
        let alive = true;

        (async () => {
            setLoading(true);
            setError("");
            try {
                const entityId = getEntityIdOrThrow();

                const [cand, d, pls] = await Promise.all([
                    getCandidate(candidateId),
                    listDocumentsForCandidate({ entityId, candidateId, limitCount: 2000 }),
                    listPlacementsForCandidate({ entityId, candidateId, statusList: ["active", "ended"], limitCount: 2000 }),
                ]);

                if (!alive) return;
                setCandidate(cand || null);
                setDocs(d || []);
                setPlacements(pls || []);
            } catch (e) {
                if (!alive) return;
                setError(e?.message || "Failed to load candidate.");
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [candidateId]);

    const docChart = useMemo(() => groupByDayCount(docs, "createdAt"), [docs]);

    if (loading) {
        return (
            <div className="flex items-center gap-2">
                {LoadingSpinner ? <LoadingSpinner /> : null}
                <div className="text-sm text-muted-foreground">Loading candidate…</div>
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">Candidate detail error</div>
                    <div className="text-sm text-red-400">{error}</div>
                    <Button asChild variant="outline">
                        <Link to="/labourhire/manager/candidates">Back to candidates</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const name = candidate?.profile?.fullName || candidate?.profile?.name || "Candidate";

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-2xl font-semibold">{name}</div>
                    <div className="text-sm text-muted-foreground">{candidate?.profile?.email || "—"}</div>
                </div>
                <Button asChild variant="outline">
                    <Link to="/labourhire/manager/candidates">Back</Link>
                </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{candidate?.status || "—"}</div><div className="text-sm text-muted-foreground">Status</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{docs.length}</div><div className="text-sm text-muted-foreground">Documents</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{placements.filter((p) => String(p.status || "").toLowerCase() === "active").length}</div><div className="text-sm text-muted-foreground">Active placements</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{placements.length}</div><div className="text-sm text-muted-foreground">Total placements</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">Document uploads over time</div>
                    <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={docChart}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Line type="monotone" dataKey="count" dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="font-semibold">Placements</div>
                    <Separator />
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Role</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {placements.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell>{p.status || "—"}</TableCell>
                                        <TableCell>{p.hiringCompanyName || p.hiringCompanyId || "—"}</TableCell>
                                        <TableCell>{p.roleTitle || p.role || "—"}</TableCell>
                                    </TableRow>
                                ))}
                                {placements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                                            No placements found for this candidate.
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="font-semibold">Documents</div>
                    <Separator />
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kind</TableHead>
                                    <TableHead>File</TableHead>
                                    <TableHead className="text-right">Open</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {docs.map((d) => (
                                    <TableRow key={d.id}>
                                        <TableCell>{d.kind || "—"}</TableCell>
                                        <TableCell className="truncate max-w-[420px]">{d.fileName || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            {d.downloadUrl ? (
                                                <Button asChild size="sm" variant="outline">
                                                    <a href={d.downloadUrl} target="_blank" rel="noreferrer">
                                                        Open
                                                    </a>
                                                </Button>
                                            ) : "—"}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {docs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                                            No documents uploaded yet.
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}