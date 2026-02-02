// src/businessUnits/LABOURHIRE/pages/company/CompanyQuotes.jsx

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table.jsx";
import { Textarea } from "../../../../components/ui/textarea.jsx";
import { getHiringCompanyForCurrentUser, listQuotesForCompany, transitionQuoteStatus } from "../../api/labourHireApi.js";
import { formatMoney } from "../../lib/rates.js";

export default function CompanyQuotes() {
  const user = auth.currentUser;

  const [company, setCompany] = useState(null);
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let alive = true;
    async function run() {
      setErr("");
      try {
        const c = await getHiringCompanyForCurrentUser();
        if (!alive) return;
        setCompany(c);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load company.");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!company?.id) return;
      setErr("");
      try {
        const q = await listQuotesForCompany({ entityId: company.entityId, hiringCompanyId: company.id });
        if (!alive) return;
        setRows(q);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load quotes.");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [company?.id, company?.entityId]);

  const actionable = useMemo(() => rows.filter((r) => r.status === "sent"), [rows]);

  async function accept(id) {
    setErr("");
    setInfo("");
    try {
      await transitionQuoteStatus({ quoteId: id, nextStatus: "accepted", note, user });
      setInfo("Accepted.");
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "accepted" } : r)));
      setNote("");
    } catch (e) {
      setErr(e?.message || "Accept failed.");
    }
  }

  async function decline(id) {
    setErr("");
    setInfo("");
    try {
      await transitionQuoteStatus({ quoteId: id, nextStatus: "declined", note, user });
      setInfo("Declined.");
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "declined" } : r)));
      setNote("");
    } catch (e) {
      setErr(e?.message || "Decline failed.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quotes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {err ? <div className="text-sm text-destructive">{err}</div> : null}
          {info ? <div className="text-sm">{info}</div> : null}

          <div className="grid gap-2">
            <div className="text-sm text-muted-foreground">Notes for accept/decline (optional)</div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" />
          </div>

          <Card>
            <CardContent className="p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Weekday bill/hr</TableHead>
                    <TableHead>Margin/hr</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length ? (
                    rows.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell>
                          <Badge variant={q.status === "sent" ? "default" : "secondary"}>{q.status}</Badge>
                        </TableCell>
                        <TableCell>{q.roleTitle || q.roleRequestTitle || "—"}</TableCell>
                        <TableCell>{formatMoney(q.rateSnapshot?.bill?.weekday || 0)}</TableCell>
                        <TableCell>{formatMoney(q.rateSnapshot?.margin?.grossPerHourWeekday || 0)}</TableCell>
                        <TableCell>{q.sentAt?.toDate?.()?.toLocaleString?.() || "—"}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" onClick={() => accept(q.id)} disabled={q.status !== "sent"}>
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => decline(q.id)} disabled={q.status !== "sent"}>
                            Decline
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No quotes yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="text-sm text-muted-foreground">
            Action required: <span className="font-medium text-foreground">{actionable.length}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
