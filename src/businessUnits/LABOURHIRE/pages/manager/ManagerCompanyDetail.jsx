/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerCompanyDetail.jsx  (REPLACE ENTIRE FILE)
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
    getHiringCompany,
    listCandidatesForEntity,
    listCandidatePresentationsForCompany,
    listPlacementsForCompany,
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

export default function ManagerCompanyDetail() {
    const { companyId } = useParams();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [company, setCompany] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [presentations, setPresentations] = useState([]);
    const [placements, setPlacements] = useState([]);

    useEffect(() => {
        let alive = true;

        (async () => {
            setLoading(true);
            setError("");
            try {
                const entityId = getEntityIdOrThrow();

                const [comp, cands, pres, pls] = await Promise.all([
                    getHiringCompany(companyId),
                    listCandidatesForEntity({ entityId, limitCount: 5000 }),
                    listCandidatePresentationsForCompany({ entityId, hiringCompanyId: companyId, limitCount: 2000 }),
                    listPlacementsForCompany({ entityId, hiringCompanyId: companyId, statusList: ["active", "ended"], limitCount: 2000 }),
                ]);

                if (!alive) return;

                const visible = (cands || []).filter((c) => {
                    const allow = c?.share?.allowCompanyIds || [];
                    return Array.isArray(allow) && allow.includes(companyId);
                });

                setCompany(comp || null);
                setCandidates(visible);
                setPresentations(pres || []);
                setPlacements(pls || []);
            } catch (e) {
                if (!alive) return;
                setError(e?.message || "Failed to load company.");
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [companyId]);

    const chartData = useMemo(() => groupByDayCount(presentations, "createdAt"), [presentations]);

    if (loading) {
        return (
            <div className="flex items-center gap-2">
                {LoadingSpinner ? <LoadingSpinner /> : null}
                <div className="text-sm text-muted-foreground">Loading company…</div>
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">Company detail error</div>
                    <div className="text-sm text-red-400">{error}</div>
                    <Button asChild variant="outline">
                        <Link to="/labourhire/manager/companies">Back to companies</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-2xl font-semibold">{company?.name || "Company"}</div>
                    <div className="text-sm text-muted-foreground">ABN: {company?.abn || "—"}</div>
                </div>
                <Button asChild variant="outline">
                    <Link to="/labourhire/manager/companies">Back</Link>
                </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{candidates.length}</div><div className="text-sm text-muted-foreground">Visible candidates</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{presentations.length}</div><div className="text-sm text-muted-foreground">Presentations</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{placements.filter((p) => String(p.status || "").toLowerCase() === "active").length}</div><div className="text-sm text-muted-foreground">Active placements</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{placements.length}</div><div className="text-sm text-muted-foreground">Total placements</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">Presentation activity</div>
                    <div className="text-sm text-muted-foreground">Simple daily count (last data available).</div>
                    <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
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
                    <div className="font-semibold">Visible candidates</div>
                    <Separator />
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {candidates.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-medium">{c?.profile?.fullName || c?.profile?.name || "—"}</TableCell>
                                        <TableCell>{c.status || "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild size="sm" variant="outline">
                                                <Link to={`/labourhire/manager/candidates/${c.id}`}>View</Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {candidates.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                                            No candidates shared with this company yet.
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