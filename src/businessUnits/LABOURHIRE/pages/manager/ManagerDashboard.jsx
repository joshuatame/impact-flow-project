/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerDashboard.jsx  (REPLACE ENTIRE FILE)
 * Fixes: uses real active entity; no localStorage.activeEntityId fallback message.
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card.jsx";
import { Separator } from "@/components/ui/separator.jsx";
import { Button } from "@/components/ui/button.jsx";
import * as SpinnerModule from "@/components/ui/LoadingSpinner.jsx";

import {
    listCandidatesForEntity,
    listHiringCompanies,
    listActivePlacements,
    listTimesheetsForManager,
} from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";

import { startOfWeekISO } from "@/businessUnits/LABOURHIRE/lib/timesheets.js";
import { getEntityIdOrThrow } from "@/businessUnits/LABOURHIRE/pages/manager/_entity.js";

const LoadingSpinner = SpinnerModule.LoadingSpinner ?? SpinnerModule.default;

function kpi(value, label, to) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="text-2xl font-semibold">{value}</div>
                <div className="text-sm text-muted-foreground">{label}</div>
                {to ? (
                    <div className="mt-3">
                        <Button asChild size="sm" variant="outline">
                            <Link to={to}>View</Link>
                        </Button>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}

export default function ManagerDashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [companies, setCompanies] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [placements, setPlacements] = useState([]);
    const [timesheets, setTimesheets] = useState([]);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            setError("");
            try {
                const entityId = getEntityIdOrThrow();
                const weekStartISO = startOfWeekISO(new Date());

                const [cs, cands, pls, ts] = await Promise.all([
                    listHiringCompanies({ entityId, limitCount: 500 }),
                    listCandidatesForEntity({ entityId, limitCount: 2000 }),
                    listActivePlacements({ entityId, limitCount: 2000 }),
                    listTimesheetsForManager({ entityId, weekStartISO, limitCount: 2000 }),
                ]);

                if (!alive) return;
                setCompanies(cs || []);
                setCandidates(cands || []);
                setPlacements(pls || []);
                setTimesheets(ts || []);
            } catch (e) {
                if (!alive) return;
                setCompanies([]);
                setCandidates([]);
                setPlacements([]);
                setTimesheets([]);
                setError(e?.message || "Failed to load.");
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const onboardingCount = useMemo(
        () => candidates.filter((c) => String(c.status || "").toLowerCase() === "onboarding").length,
        [candidates]
    );

    const pendingTimesheets = useMemo(() => {
        const wanted = new Set(["submitted", "approved_by_company", "approved_by_manager"]);
        return timesheets.filter((t) => wanted.has(String(t.status || "").toLowerCase())).length;
    }, [timesheets]);

    if (loading) {
        return (
            <div className="flex items-center gap-2">
                {LoadingSpinner ? <LoadingSpinner /> : null}
                <div className="text-sm text-muted-foreground">Loading manager dashboard…</div>
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">Cannot load LabourHire manager dashboard</div>
                    <div className="text-sm text-muted-foreground">{error}</div>
                    <div className="text-sm text-muted-foreground">
                        Go back to Launchpad and select a business entity (active entity).
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <div className="text-xl font-semibold">Manager Overview</div>
                <div className="text-sm text-muted-foreground">All companies + candidates in this entity.</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {kpi(companies.length, "Companies", "/labourhire/manager/companies")}
                {kpi(candidates.length, "Candidates", "/labourhire/manager/candidates")}
                {kpi(onboardingCount, "Onboarding candidates", "/labourhire/manager/candidates")}
                {kpi(pendingTimesheets, "Pending timesheets", "/labourhire/manager/timesheets")}
            </div>

            <Separator />

            <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                    <CardContent className="p-4 space-y-2">
                        <div className="font-semibold">Active placements</div>
                        <div className="text-2xl font-semibold">{placements.length}</div>
                        <div className="text-sm text-muted-foreground">
                            Drill down via Companies → a company → placements
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4 space-y-2">
                        <div className="font-semibold">Next actions</div>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild size="sm" variant="outline">
                                <Link to="/labourhire/manager/companies">Review companies</Link>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                                <Link to="/labourhire/manager/candidates">Review candidates</Link>
                            </Button>
                            <Button asChild size="sm" variant="outline">
                                <Link to="/labourhire/manager/timesheets">Approve timesheets</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}