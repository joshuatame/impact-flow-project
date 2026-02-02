/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerTimecardsGrid.jsx  (REPLACE)
 * - Adds compliance column
 * - Requires override reason to approve non-compliant sheets
 **************************************************************************************************/

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../../../components/ui/dialog.jsx";
import { Textarea } from "../../../../components/ui/textarea.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import { startOfWeekISO } from "../../lib/timesheets.js";
import { getWfConnectUser, watchTimesheetsForManager, transitionTimesheetStatus, upsertTimesheetWeek } from "../../api/labourHireApi.js";

function statusBadgeVariant(s) {
    if (s === "submitted") return "default";
    if (s === "approved_by_company") return "secondary";
    if (s === "approved_by_manager") return "outline";
    if (s === "sent_to_payroll") return "outline";
    return "secondary";
}

function complianceSummary(ts) {
    const ok = ts?.compliance?.ok === true;
    const override = ts?.complianceOverride?.reason ? true : false;
    const issues = ts?.compliance?.issues || [];
    return { ok, override, issues };
}

export default function ManagerTimecardsGrid() {
    const user = auth.currentUser;

    const [entityId, setEntityId] = useState(null);
    const [weekStart, setWeekStart] = useState(startOfWeekISO(new Date()));
    const [rows, setRows] = useState([]);

    const [err, setErr] = useState("");
    const [info, setInfo] = useState("");

    useEffect(() => {
        let alive = true;
        async function run() {
            try {
                const wfUser = await getWfConnectUser(user.uid);
                if (!alive) return;
                setEntityId(wfUser?.entityId || null);
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load manager context.");
            }
        }
        run();
        return () => (alive = false);
    }, [user?.uid]);

    useEffect(() => {
        if (!entityId || !weekStart) return;

        setErr("");
        const unsub = watchTimesheetsForManager(
            { entityId, weekStartISO: weekStart, statusIn: ["submitted", "approved_by_company", "approved_by_manager", "sent_to_payroll"] },
            (data) => setRows(data),
            (e) => setErr(e?.message || "Realtime load failed.")
        );

        return () => unsub?.();
    }, [entityId, weekStart]);

    const counts = useMemo(() => {
        const c = { submitted: 0, approved_by_company: 0, approved_by_manager: 0, sent_to_payroll: 0 };
        rows.forEach((r) => {
            c[r.status] = (c[r.status] || 0) + 1;
        });
        return c;
    }, [rows]);

    async function approveByManager(ts, overrideReason) {
        setErr("");
        setInfo("");
        try {
            const { ok } = complianceSummary(ts);
            if (!ok && !overrideReason?.trim()) throw new Error("Override reason required for non-compliant timesheet.");

            if (!ok) {
                await upsertTimesheetWeek({
                    entityId,
                    timesheetId: ts.id,
                    patch: {
                        complianceOverride: {
                            reason: overrideReason.trim(),
                            by: user.uid,
                            at: new Date().toISOString(),
                        },
                    },
                    user,
                });
            }

            await transitionTimesheetStatus({ timesheetId: ts.id, nextStatus: "approved_by_manager", note: overrideReason || "", user });
            setInfo("Approved by manager.");
            setTimeout(() => setInfo(""), 2000);
        } catch (e) {
            setErr(e?.message || "Approve failed.");
        }
    }

    async function sendToPayroll(ts) {
        setErr("");
        setInfo("");
        try {
            if (ts.status !== "approved_by_manager") throw new Error("Must be approved by manager first.");
            await transitionTimesheetStatus({ timesheetId: ts.id, nextStatus: "sent_to_payroll", note: "", user });
            setInfo("Sent to payroll queue.");
            setTimeout(() => setInfo(""), 2000);
        } catch (e) {
            setErr(e?.message || "Send failed.");
        }
    }

    return (
        <div className="space-y-4">
            {err ? (
                <Alert variant="destructive">
                    <AlertTitle>Problem</AlertTitle>
                    <AlertDescription>{err}</AlertDescription>
                </Alert>
            ) : null}
            {info ? (
                <Alert>
                    <AlertTitle>Done</AlertTitle>
                    <AlertDescription>{info}</AlertDescription>
                </Alert>
            ) : null}

            <Card>
                <CardHeader>
                    <CardTitle>Timecards grid</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="grid gap-2">
                            <Label>Week starting (Mon)</Label>
                            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
                        </div>
                        <div className="flex items-end gap-2 flex-wrap md:col-span-3">
                            <Badge variant="default">Submitted: {counts.submitted}</Badge>
                            <Badge variant="secondary">Company approved: {counts.approved_by_company}</Badge>
                            <Badge variant="outline">Manager approved: {counts.approved_by_manager}</Badge>
                            <Badge variant="outline">Payroll queue: {counts.sent_to_payroll}</Badge>
                        </div>
                    </div>

                    <Card>
                        <CardContent className="p-0 overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Placement</TableHead>
                                        <TableHead>Candidate</TableHead>
                                        <TableHead>Company</TableHead>
                                        <TableHead>Hours</TableHead>
                                        <TableHead>Compliance</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.length ? (
                                        rows.map((ts) => {
                                            const comp = complianceSummary(ts);
                                            const compLabel = comp.ok ? "OK" : comp.override ? "Override" : "Issue";
                                            const compVariant = comp.ok ? "default" : comp.override ? "secondary" : "destructive";

                                            return (
                                                <TableRow key={ts.id}>
                                                    <TableCell>
                                                        <Badge variant={statusBadgeVariant(ts.status)}>{ts.status}</Badge>
                                                    </TableCell>
                                                    <TableCell>{ts.placementId || "—"}</TableCell>
                                                    <TableCell>{ts.candidateId || "—"}</TableCell>
                                                    <TableCell>{ts.hiringCompanyId || "—"}</TableCell>
                                                    <TableCell className="font-medium">{ts.totals?.payableHours ?? ts.totals?.hours ?? 0}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant={compVariant}>{compLabel}</Badge>
                                                            {!comp.ok && comp.issues?.length ? (
                                                                <span className="text-xs text-muted-foreground">{String(comp.issues[0]).slice(0, 60)}…</span>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right space-x-2">
                                                        <Dialog>
                                                            <DialogTrigger asChild>
                                                                <Button
                                                                    size="sm"
                                                                    disabled={ts.status !== "approved_by_company" && ts.status !== "submitted"}
                                                                    variant={ts.status === "approved_by_company" ? "default" : "outline"}
                                                                >
                                                                    Approve (mgr)
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent>
                                                                <DialogHeader>
                                                                    <DialogTitle>Manager approval</DialogTitle>
                                                                </DialogHeader>

                                                                {!comp.ok ? (
                                                                    <Alert variant="destructive">
                                                                        <AlertTitle>Non-compliant</AlertTitle>
                                                                        <AlertDescription>
                                                                            Approval requires an override reason. Issue: {comp.issues?.[0] || "See timesheet details."}
                                                                        </AlertDescription>
                                                                    </Alert>
                                                                ) : (
                                                                    <Alert>
                                                                        <AlertTitle>Compliant</AlertTitle>
                                                                        <AlertDescription>Approval will proceed.</AlertDescription>
                                                                    </Alert>
                                                                )}

                                                                <div className="grid gap-2">
                                                                    <Label>Override reason (required if non-compliant)</Label>
                                                                    <Textarea id={`override-${ts.id}`} placeholder="Explain why this is approved despite award compliance issues…" />
                                                                </div>

                                                                <DialogFooter>
                                                                    <Button
                                                                        onClick={() => {
                                                                            const el = document.getElementById(`override-${ts.id}`);
                                                                            const reason = el?.value || "";
                                                                            approveByManager(ts, reason);
                                                                        }}
                                                                    >
                                                                        Confirm approve
                                                                    </Button>
                                                                </DialogFooter>
                                                            </DialogContent>
                                                        </Dialog>

                                                        <Button size="sm" variant="outline" onClick={() => sendToPayroll(ts)} disabled={ts.status !== "approved_by_manager"}>
                                                            Send to payroll
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-sm text-muted-foreground">
                                                No timecards found for this week.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="text-xs text-muted-foreground">
                        Manager approvals are blocked for non-compliant sheets unless an override reason is recorded.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}