/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerQuotes.jsx  (REPLACE ENTIRE FILE)
 * - Uses the SAME quote fields as CompanyQuotes.jsx:
 *   - status, roleTitle/roleRequestTitle, rateSnapshot.bill.weekday, rateSnapshot.margin.grossPerHourWeekday, sentAt
 * - Adds filters, KPI cards, and "Generate quote" route button.
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.jsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.jsx";

import { getEntityIdOrThrow } from "@/businessUnits/LABOURHIRE/pages/manager/_entity.js";
import { listHiringCompanies, listQuotesForEntity } from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";
import { formatMoney } from "@/businessUnits/LABOURHIRE/lib/rates.js";

function safeText(v) {
    return String(v ?? "").trim();
}

function tsToString(ts) {
    try {
        const d = ts?.toDate?.() || (ts ? new Date(ts) : null);
        // eslint-disable-next-line no-restricted-globals
        if (!d || isNaN(d.getTime())) return "—";
        return d.toLocaleString();
    } catch {
        return "—";
    }
}

export default function ManagerQuotes() {
    const nav = useNavigate();

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [companies, setCompanies] = useState([]);
    const [rows, setRows] = useState([]);

    const [q, setQ] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [companyFilter, setCompanyFilter] = useState("all");

    useEffect(() => {
        let alive = true;

        async function run() {
            setErr("");
            setLoading(true);
            try {
                const entityId = getEntityIdOrThrow();
                const [cs, qs] = await Promise.all([
                    listHiringCompanies({ entityId, limitCount: 2000 }),
                    listQuotesForEntity({ entityId, limitCount: 2000 }),
                ]);
                if (!alive) return;
                setCompanies(cs || []);
                setRows(qs || []);
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load quotes.");
                setCompanies([]);
                setRows([]);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        }

        run();
        return () => {
            alive = false;
        };
    }, []);

    const companyNameById = useMemo(() => {
        const map = new Map();
        (companies || []).forEach((c) => map.set(c.id, c.name || c.id));
        return map;
    }, [companies]);

    const filtered = useMemo(() => {
        const needle = safeText(q).toLowerCase();

        return (rows || []).filter((r) => {
            const status = safeText(r.status).toLowerCase();
            const hiringCompanyId = safeText(r.hiringCompanyId);

            if (statusFilter !== "all" && status !== statusFilter) return false;
            if (companyFilter !== "all" && hiringCompanyId !== companyFilter) return false;

            if (!needle) return true;

            const cname = safeText(companyNameById.get(hiringCompanyId)).toLowerCase();
            const role = safeText(r.roleTitle || r.roleRequestTitle || r.title || r.role).toLowerCase();
            return cname.includes(needle) || role.includes(needle);
        });
    }, [rows, q, statusFilter, companyFilter, companyNameById]);

    const kpis = useMemo(() => {
        const total = rows.length;
        const sent = rows.filter((r) => safeText(r.status).toLowerCase() === "sent").length;
        const accepted = rows.filter((r) => safeText(r.status).toLowerCase() === "accepted").length;
        const declined = rows.filter((r) => safeText(r.status).toLowerCase() === "declined").length;
        return { total, sent, accepted, declined };
    }, [rows]);

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-2xl font-semibold">Quotes</div>
                    <div className="text-sm text-muted-foreground">Manager view across all companies.</div>
                </div>
                <Button type="button" onClick={() => nav("/labourhire/manager/quotes/new")}>
                    Generate quote
                </Button>
            </div>

            {err ? (
                <Card>
                    <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
                </Card>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.total}</div><div className="text-sm text-muted-foreground">Total</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.sent}</div><div className="text-sm text-muted-foreground">Awaiting action</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.accepted}</div><div className="text-sm text-muted-foreground">Accepted</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-semibold">{kpis.declined}</div><div className="text-sm text-muted-foreground">Declined</div></CardContent></Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">All quotes</CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company / role…" />

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="sent">Sent</SelectItem>
                                    <SelectItem value="accepted">Accepted</SelectItem>
                                    <SelectItem value="declined">Declined</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={companyFilter} onValueChange={setCompanyFilter}>
                                <SelectTrigger className="w-[260px]">
                                    <SelectValue placeholder="Company" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All companies</SelectItem>
                                    {(companies || []).map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name || c.id}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Separator />

                    <Card>
                        <CardContent className="p-0 overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Company</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Weekday bill/hr</TableHead>
                                        <TableHead>Margin/hr</TableHead>
                                        <TableHead>Sent</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-sm text-muted-foreground">
                                                Loading…
                                            </TableCell>
                                        </TableRow>
                                    ) : filtered.length ? (
                                        filtered.map((qRow) => {
                                            const companyName =
                                                qRow.hiringCompanyName ||
                                                companyNameById.get(qRow.hiringCompanyId) ||
                                                qRow.hiringCompanyId ||
                                                "—";

                                            return (
                                                <TableRow key={qRow.id}>
                                                    <TableCell>
                                                        <Badge variant={qRow.status === "sent" ? "default" : "secondary"}>
                                                            {qRow.status || "—"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{companyName}</TableCell>
                                                    <TableCell>{qRow.roleTitle || qRow.roleRequestTitle || "—"}</TableCell>
                                                    <TableCell>{formatMoney(qRow.rateSnapshot?.bill?.weekday || 0)}</TableCell>
                                                    <TableCell>{formatMoney(qRow.rateSnapshot?.margin?.grossPerHourWeekday || 0)}</TableCell>
                                                    <TableCell>{tsToString(qRow.sentAt || qRow.createdAt)}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-sm text-muted-foreground">
                                                No quotes found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="text-sm text-muted-foreground">
                        Action required: <span className="font-medium text-foreground">{kpis.sent}</span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}