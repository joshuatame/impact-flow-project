// src/businessUnits/LABOURHIRE/pages/candidate/CandidateTimesheets.jsx

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Button } from "../../../../components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import {
    getCandidateForCurrentUser,
    listPlacementsForCandidate,
    transitionTimesheetStatus,
    upsertTimesheetWeek,
    getTimesheetWeekById,
    getAwardInterpretation,
} from "../../api/labourHireApi.js";
import {
    DAY_ORDER_KEYS,
    calcTotals,
    canEdit,
    emptyDays,
    startOfWeekISO,
    validateTimesheet,
    dayLabel,
    checkAwardCompliance,
} from "../../lib/timesheets.js";

function timesheetIdFor(placementId, weekStartISO) {
    return `${placementId}_${weekStartISO}`;
}

export default function CandidateTimesheets() {
    const user = auth.currentUser;

    const [candidate, setCandidate] = useState(null);
    const [placements, setPlacements] = useState([]);
    const [weekStart, setWeekStart] = useState(startOfWeekISO(new Date()));
    const [activePlacementId, setActivePlacementId] = useState("");

    const [ts, setTs] = useState(null);
    const [days, setDays] = useState(emptyDays());
    const [status, setStatus] = useState("draft");
    const [awardCfg, setAwardCfg] = useState(null);

    const [err, setErr] = useState("");
    const [info, setInfo] = useState("");
    const [saving, setSaving] = useState(false);

    const totals = useMemo(() => calcTotals(days), [days]);
    const compliance = useMemo(() => checkAwardCompliance({ days, awardConfig: awardCfg }), [days, awardCfg]);

    useEffect(() => {
        let alive = true;
        async function run() {
            setErr("");
            const c = await getCandidateForCurrentUser();
            if (!alive) return;
            setCandidate(c);
            if (!c?.id) return;

            const pls = await listPlacementsForCandidate({ entityId: c.entityId, candidateId: c.id, statusList: ["active"] });
            if (!alive) return;
            setPlacements(pls);
            setActivePlacementId(pls?.[0]?.id || "");
        }
        run();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        let alive = true;
        async function loadTimesheet() {
            setErr("");
            setInfo("");
            if (!candidate?.entityId || !activePlacementId) return;

            const placement = placements.find((p) => p.id === activePlacementId);
            const awardCode = placement?.rateSnapshot?.source?.awardCode || placement?.awardCode || null;

            if (awardCode) {
                const interp = await getAwardInterpretation(awardCode);
                if (!alive) return;
                setAwardCfg(interp?.complianceDefaults || null);
            } else {
                setAwardCfg(null);
            }

            const id = timesheetIdFor(activePlacementId, weekStart);
            const existing = await getTimesheetWeekById(id);
            if (!alive) return;

            if (existing) {
                setTs(existing);
                setDays(existing.days || emptyDays());
                setStatus(existing.status || "draft");
            } else {
                setTs(null);
                setDays(emptyDays());
                setStatus("draft");
                await upsertTimesheetWeek({
                    entityId: candidate.entityId,
                    timesheetId: id,
                    patch: {
                        placementId: activePlacementId,
                        candidateId: candidate.id,
                        hiringCompanyId: placement?.hiringCompanyId || null,
                        weekStartISO: weekStart,
                        status: "draft",
                        days: emptyDays(),
                        totals: calcTotals(emptyDays()),
                        audit: [],
                    },
                    user,
                });
                const created = await getTimesheetWeekById(id);
                if (!alive) return;
                setTs(created);
            }
        }
        loadTimesheet();
        return () => {
            alive = false;
        };
    }, [candidate?.entityId, candidate?.id, activePlacementId, weekStart, placements, user]);

    async function saveDraft() {
        if (!candidate?.entityId || !activePlacementId) return;
        setSaving(true);
        setErr("");
        setInfo("");
        try {
            const v = validateTimesheet(days);
            if (!v.ok) throw new Error(v.errors[0]);

            if (!compliance.ok) throw new Error(`Award compliance: ${compliance.issues[0]}`);

            const id = timesheetIdFor(activePlacementId, weekStart);
            await upsertTimesheetWeek({
                entityId: candidate.entityId,
                timesheetId: id,
                patch: { days, totals, status: status || "draft", compliance: { ok: true, checkedAt: new Date().toISOString() } },
                user,
            });
            setInfo("Saved.");
        } catch (e) {
            setErr(e?.message || "Save failed.");
        } finally {
            setSaving(false);
            setTimeout(() => setInfo(""), 2000);
        }
    }

    async function submit() {
        if (!ts?.id) return;
        setSaving(true);
        setErr("");
        setInfo("");
        try {
            const v = validateTimesheet(days);
            if (!v.ok) throw new Error(v.errors[0]);

            if (!compliance.ok) throw new Error(`Award compliance: ${compliance.issues[0]}`);

            await upsertTimesheetWeek({
                entityId: candidate.entityId,
                timesheetId: ts.id,
                patch: { days, totals, compliance: { ok: true, checkedAt: new Date().toISOString() } },
                user,
            });
            await transitionTimesheetStatus({ timesheetId: ts.id, nextStatus: "submitted", note: "", user });
            setStatus("submitted");
            setInfo("Submitted.");
        } catch (e) {
            setErr(e?.message || "Submit failed.");
        } finally {
            setSaving(false);
            setTimeout(() => setInfo(""), 2000);
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Weekly timesheet</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {err ? (
                        <Alert variant="destructive">
                            <AlertTitle>Action failed</AlertTitle>
                            <AlertDescription>{err}</AlertDescription>
                        </Alert>
                    ) : null}

                    {info ? (
                        <Alert>
                            <AlertTitle>Done</AlertTitle>
                            <AlertDescription>{info}</AlertDescription>
                        </Alert>
                    ) : null}

                    {!compliance.ok ? (
                        <Alert variant="destructive">
                            <AlertTitle>Award compliance issue</AlertTitle>
                            <AlertDescription>{compliance.issues[0]}</AlertDescription>
                        </Alert>
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label>Week starting (Mon)</Label>
                            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Placement</Label>
                            <Select value={activePlacementId} onValueChange={setActivePlacementId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select placement" />
                                </SelectTrigger>
                                <SelectContent>
                                    {placements.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.roleTitle || "Placement"} · {p.hiringCompanyName || p.hiringCompanyId || "Company"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>Status</Label>
                            <Input value={status} readOnly />
                        </div>
                    </div>

                    <Card>
                        <CardContent className="p-0 overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Day</TableHead>
                                        <TableHead className="w-[140px]">Hours</TableHead>
                                        <TableHead className="w-[140px]">Break (hrs)</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {DAY_ORDER_KEYS.map((k) => (
                                        <TableRow key={k}>
                                            <TableCell className="font-medium">{dayLabel(k)}</TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.25"
                                                    value={days?.[k]?.hours ?? 0}
                                                    disabled={!canEdit(status)}
                                                    onChange={(e) =>
                                                        setDays((prev) => ({
                                                            ...prev,
                                                            [k]: { ...(prev[k] || {}), hours: Number(e.target.value || 0) },
                                                        }))
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    step="0.25"
                                                    value={days?.[k]?.breakHours ?? 0}
                                                    disabled={!canEdit(status)}
                                                    onChange={(e) =>
                                                        setDays((prev) => ({
                                                            ...prev,
                                                            [k]: { ...(prev[k] || {}), breakHours: Number(e.target.value || 0) },
                                                        }))
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    value={days?.[k]?.notes ?? ""}
                                                    disabled={!canEdit(status)}
                                                    onChange={(e) =>
                                                        setDays((prev) => ({
                                                            ...prev,
                                                            [k]: { ...(prev[k] || {}), notes: e.target.value },
                                                        }))
                                                    }
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow>
                                        <TableCell className="font-semibold">Totals</TableCell>
                                        <TableCell className="font-medium">{totals.hours}</TableCell>
                                        <TableCell className="font-medium">{totals.breaks}</TableCell>
                                        <TableCell className="font-medium">Payable: {totals.payableHours}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" onClick={saveDraft} disabled={saving || !canEdit(status)}>
                            Save draft
                        </Button>
                        <Button onClick={submit} disabled={saving || !canEdit(status)}>
                            Submit
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
