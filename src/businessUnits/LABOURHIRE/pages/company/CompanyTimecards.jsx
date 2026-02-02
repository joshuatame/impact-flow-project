// src/businessUnits/LABOURHIRE/pages/company/CompanyTimecards.jsx

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Button } from "../../../../components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table.jsx";
import { Textarea } from "../../../../components/ui/textarea.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import { getHiringCompanyForCurrentUser, listTimesheetsForCompany, transitionTimesheetStatus } from "../../api/labourHireApi.js";
import { startOfWeekISO } from "../../lib/timesheets.js";

export default function CompanyTimecards() {
  const user = auth.currentUser;

  const [company, setCompany] = useState(null);
  const [weekStart, setWeekStart] = useState(startOfWeekISO(new Date()));
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let alive = true;
    async function run() {
      setErr("");
      const c = await getHiringCompanyForCurrentUser();
      if (!alive) return;
      setCompany(c);
    }
    run();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function run() {
      setErr("");
      setInfo("");
      if (!company?.id) return;
      try {
        const r = await listTimesheetsForCompany({
          entityId: company.entityId,
          hiringCompanyId: company.id,
          weekStartISO: weekStart,
          statusIn: ["submitted", "returned"],
        });
        if (!alive) return;
        setRows(r);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load timecards.");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [company?.id, company?.entityId, weekStart]);

  async function approve(timesheetId) {
    setErr("");
    setInfo("");
    try {
      await transitionTimesheetStatus({ timesheetId, nextStatus: "approved_by_company", note: note || "", user });
      setInfo("Approved.");
      setRows((prev) => prev.filter((r) => r.id !== timesheetId));
      setNote("");
    } catch (e) {
      setErr(e?.message || "Approve failed.");
    }
  }

  async function returnForFix(timesheetId) {
    setErr("");
    setInfo("");
    try {
      await transitionTimesheetStatus({ timesheetId, nextStatus: "returned", note: note || "Please correct and resubmit.", user });
      setInfo("Returned.");
      setRows((prev) => prev.filter((r) => r.id !== timesheetId));
      setNote("");
    } catch (e) {
      setErr(e?.message || "Return failed.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Timecards approval</CardTitle>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Week starting</Label>
              <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Note (used for Approve/Return)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note…" />
            </div>
          </div>

          <Card>
            <CardContent className="p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Breaks</TableHead>
                    <TableHead>Payable</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length ? (
                    rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.placementId}</TableCell>
                        <TableCell>{r.status}</TableCell>
                        <TableCell>{r.totals?.hours ?? 0}</TableCell>
                        <TableCell>{r.totals?.breaks ?? 0}</TableCell>
                        <TableCell>{r.totals?.payableHours ?? 0}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" onClick={() => approve(r.id)}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => returnForFix(r.id)}>
                            Return
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No submitted timecards for this week.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
