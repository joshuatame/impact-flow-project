// src/businessUnits/LABOURHIRE/pages/candidate/CandidatePlacements.jsx

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table.jsx";
import { getCandidateForCurrentUser, listPlacementsForCandidate } from "../../api/labourHireApi.js";
import { formatMoney } from "../../lib/rates.js";

export default function CandidatePlacements() {
  const user = auth.currentUser;
  const [candidate, setCandidate] = useState(null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    async function run() {
      setErr("");
      try {
        const c = await getCandidateForCurrentUser();
        if (!alive) return;
        setCandidate(c);
        if (!c?.id) return;

        const pls = await listPlacementsForCandidate({
          entityId: c.entityId,
          candidateId: c.id,
          statusList: ["active", "paused", "ended"],
        });
        if (!alive) return;
        setRows(pls);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load placements.");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, []);

  const activeCount = useMemo(() => rows.filter((r) => r.status === "active").length, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My placements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {err ? <div className="text-sm text-destructive">{err}</div> : null}

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Active: <span className="font-medium text-foreground">{activeCount}</span>
            </div>
            <Button variant="outline" asChild>
              <a href="/labourhire/candidate/timesheets">Go to timesheets</a>
            </Button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Pay (weekday)</TableHead>
                    <TableHead>Bill (weekday)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length ? (
                    rows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                        </TableCell>
                        <TableCell>{p.hiringCompanyName || p.hiringCompanyId || "—"}</TableCell>
                        <TableCell>{p.roleTitle || "—"}</TableCell>
                        <TableCell>{p.startDate || "—"}</TableCell>
                        <TableCell>{formatMoney(p.rateSnapshot?.pay?.weekday || 0)}</TableCell>
                        <TableCell>{formatMoney(p.rateSnapshot?.bill?.weekday || 0)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground">
                        No placements yet.
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
