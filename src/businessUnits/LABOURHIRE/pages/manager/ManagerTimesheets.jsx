/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerTimesheets.jsx  (REPLACE ENTIRE FILE)
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
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

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

import * as SpinnerModule from "@/components/ui/LoadingSpinner.jsx";
import { getEntityIdOrThrow } from "@/businessUnits/LABOURHIRE/pages/manager/_entity.js";
import { startOfWeekISO, addDaysISO, calcTotals } from "@/businessUnits/LABOURHIRE/lib/timesheets.js";
import {
    listHiringCompanies,
    listTimesheetsForManager,
    watchTimesheetsForManager,
} from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";

const LoadingSpinner = SpinnerModule.LoadingSpinner ?? SpinnerModule.default;

function tsToDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === "function") return v.toDate();
    const d = new Date(v);
    // eslint-disable-next-line no-restricted-globals
    return isNaN(d.getTime()) ? null : d;
}

function groupByDayCount(rows, dateField = "updatedAt") {
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

export default function ManagerTimesheets() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [companies, setCompanies] = useState([]);
    const [rows, setRows] = useState([]);

    const [weekStart, setWeekStart] = useState(() => startOfWeekISO(new Date()));

    const companyNameById = useMemo(() => {
        const map = new Map();
        (companies || []).forEach((c) => map.set(c.id, c.name || c.id));
        return map;
    }, [companies]);

    async function loadWeek(ws) {
        setLoading(true);
        setError("");
        try {
            const entityId = getEntityIdOrThrow();
            const [cs, ts] = await Promise.all([
                listHiringCompanies({ entityId, limitCount: 2000 }),
                listTimesheetsForManager({ entityId, weekStartISO: ws, limitCount: 2000 }),
            ]);
            setCompanies(cs || []);
            setRows(ts || []);
        } catch (e) {
            setCompanies([]);
            setRows([]);
            setError(e?.message || "Failed to load timesheets.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let unsub = null;

        (async () => {
            await loadWeek(weekStart);

            try {
                const entityId = getEntityIdOrThrow();
                unsub = watchTimesheetsForManager(
                    { entityId, weekStartISO: weekStart, limitCount: 2000 },
                    (data) => setRows(data || []),
                    () => { }
                );
            } catch {
                // ignore
            }
        })();

        return () => unsub?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart]);

    const kpis = useMemo(() => {
        const total = rows.length;
        const submitted = rows.filter((r) => String(r.status || "").toLowerCase() === "submitted").length;
        const returned = rows.filter((r) => String(r.status || "").toLowerCase() === "returned").length;
        const approvedCompany = rows.filter((r) => String(r.status || "").toLowerCase() === "approved_by_company").length;
        return { total, submitted, returned, approvedCompany };
    }, [rows]);

    const chartData = useMemo(() => groupByDayCount(rows, "updatedAt"), [rows]);

    const weekLabel = useMemo(() => {
        const start = new Date(`${weekStart}T00:00:00`);
        const endIso = addDaysISO(weekStart, 6);
        const end = new Date(`${endIso}T00:00:00`);
        return `${format(start, "dd MMM yyyy")} → ${format(end, "dd MMM yyyy")}`;
    }, [weekStart]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="text-2xl font-semibold">Timesheets</div>
                    <div className="text-sm text-muted-foreground">Manager view across all companies for the selected week.</div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
                    >
                        Prev week
                    </Button>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => setWeekStart(startOfWeekISO(new Date()))}
                    >
                        This week
                    </Button>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
                    >
                        Next week
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-4">
                    <div className="font-medium">Week</div>
                    <div className="text-sm text-muted-foreground">{weekLabel}</div>
                </CardContent>
            </Card>

            {error ? (
                <Card>
                    <CardContent className="p-4 text-sm text-red-400">{error}</CardContent>
                </Card>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.total}</div><div className="text-sm text-muted-foreground">Total</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.submitted}</div><div className="text-sm text-muted-foreground">Submitted</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.returned}</div><div className="text-sm text-muted-foreground">Returned</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.approvedCompany}</div><div className="text-sm text-muted-foreground">Approved by company</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">Update activity</div>
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
                    <div className="font-semibold">Timesheets list</div>
                    <Separator />

                    {loading ? (
                        <div className="flex items-center gap-2">
                            {LoadingSpinner ? <LoadingSpinner /> : null}
                            <div className="text-sm text-muted-foreground">Loading week…</div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Updated</TableHead>
                                        <TableHead>Company</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Hours</TableHead>
                                        <TableHead className="text-right">Breaks</TableHead>
                                        <TableHead className="text-right">Payable</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((t) => {
                                        const upd = tsToDate(t.updatedAt);
                                        const updated = upd ? format(upd, "yyyy-MM-dd HH:mm") : "—";

                                        const company =
                                            t.hiringCompanyName ||
                                            companyNameById.get(t.hiringCompanyId) ||
                                            t.hiringCompanyId ||
                                            "—";

                                        const totals = calcTotals(t.days || t.week || t.dayTotals || null);

                                        return (
                                            <TableRow key={t.id}>
                                                <TableCell>{updated}</TableCell>
                                                <TableCell className="font-medium">{company}</TableCell>
                                                <TableCell>{t.status || "—"}</TableCell>
                                                <TableCell className="text-right">{totals.hours.toFixed(2)}</TableCell>
                                                <TableCell className="text-right">{totals.breaks.toFixed(2)}</TableCell>
                                                <TableCell className="text-right">{totals.payableHours.toFixed(2)}</TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {rows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                                                No timesheets found for this week.
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
