// src/businessUnits/LABOURHIRE/pages/company/CompanyDashboard.jsx

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { listTimesheetsForCompany, getHiringCompanyForCurrentUser } from "../../api/labourHireApi.js";
import { startOfWeekISO } from "../../lib/timesheets.js";

export default function CompanyDashboard() {
  const user = auth.currentUser;

  const [company, setCompany] = useState(null);
  const [stats, setStats] = useState({ pending: 0, returned: 0, approved: 0 });
  const [err, setErr] = useState("");

  const weekStart = useMemo(() => startOfWeekISO(new Date()), []);

  useEffect(() => {
    let alive = true;
    async function run() {
      setErr("");
      try {
        const c = await getHiringCompanyForCurrentUser();
        if (!alive) return;
        setCompany(c);
        if (!c?.id) return;

        const rows = await listTimesheetsForCompany({
          entityId: c.entityId,
          hiringCompanyId: c.id,
          weekStartISO: weekStart,
          statusIn: ["submitted", "returned", "approved_by_company", "approved_by_manager"],
        });

        const pending = rows.filter((r) => r.status === "submitted").length;
        const returned = rows.filter((r) => r.status === "returned").length;
        const approved = rows.filter((r) => r.status === "approved_by_company" || r.status === "approved_by_manager").length;
        setStats({ pending, returned, approved });
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Failed to load dashboard.");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [weekStart]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Company dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {err ? <div className="text-sm text-destructive">{err}</div> : null}

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{company?.name || "Your company"}</div>
              <div className="text-sm text-muted-foreground">Week starting {weekStart}</div>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <a href="/labourhire/company/timecards">Review timecards</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/labourhire/company/candidates">View candidates</a>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard title="Pending approval" value={stats.pending} variant="secondary" />
            <StatCard title="Returned" value={stats.returned} variant="outline" />
            <StatCard title="Approved (this week)" value={stats.approved} variant="default" />
          </div>

          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Tip: Your fastest workflow is <strong>Approve</strong> if accurate, or <strong>Return</strong> with a short note.
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, variant }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="flex items-center justify-between">
          <div className="text-3xl font-semibold">{value}</div>
          <Badge variant={variant}>{title}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
