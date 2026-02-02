// =================================================================================================
// File: src/businessUnits/LABOURHIRE/pages/dashboard/Dashboard.jsx
// =================================================================================================
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Badge } from "@/components/ui/badge.jsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.jsx";
import { auth } from "@/firebase";
import { getCurrentPortal, getWfConnectUser } from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";

function portalHome(portal) {
    if (portal === "manager") return "/labourhire/manager/dashboard";
    if (portal === "company") return "/labourhire/company/dashboard";
    if (portal === "candidate") return "/labourhire/candidate/profile";
    return "/labourhire";
}

export default function Dashboard() {
    const nav = useNavigate();
    const [portal, setPortal] = useState(null);
    const [wf, setWf] = useState(null);
    const [err, setErr] = useState("");

    const uid = auth.currentUser?.uid || null;

    useEffect(() => {
        let alive = true;

        async function load() {
            setErr("");
            try {
                const p = await getCurrentPortal().catch(() => null);
                const w = uid ? await getWfConnectUser(uid).catch(() => null) : null;
                if (!alive) return;
                setPortal(p || null);
                setWf(w || null);
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load LabourHire dashboard.");
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [uid]);

    const roles = useMemo(() => (Array.isArray(wf?.roles) ? wf.roles : []), [wf?.roles]);
    const canAdmin = roles.includes("SystemAdmin") || roles.includes("LabourHireManager") || roles.includes("Admin");

    return (
        <div className="p-4 md:p-8 space-y-4">
            <PageHeader title="LabourHire" subtitle="Quick access to your portals" />

            {err ? (
                <Alert variant="destructive">
                    <AlertTitle>Unable to load</AlertTitle>
                    <AlertDescription>{err}</AlertDescription>
                </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-slate-800 bg-slate-900/40">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            Open my portal
                            <Badge variant="secondary" className="capitalize">
                                {portal || "unknown"}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="text-sm text-slate-400">
                            This button opens the portal resolved from your WF Connect roles/claims.
                        </div>
                        <Button onClick={() => nav(portalHome(portal || "manager"))} className="w-full">
                            Go
                        </Button>
                    </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/40">
                    <CardHeader>
                        <CardTitle>Portals</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button variant="outline" className="w-full" onClick={() => nav("/labourhire/manager/dashboard")}>
                            Manager
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => nav("/labourhire/company/dashboard")}>
                            Company
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => nav("/labourhire/candidate/profile")}>
                            Candidate
                        </Button>
                        <div className="text-xs text-slate-400">
                            Some portals may redirect if you don’t have access.
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/40">
                    <CardHeader>
                        <CardTitle>WF Connect status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-sm text-slate-300">
                            UID: <span className="text-slate-100">{uid || "not signed in"}</span>
                        </div>
                        <div className="text-sm text-slate-300">
                            Entity: <span className="text-slate-100">{wf?.entityId || "—"}</span>
                        </div>
                        <div className="text-sm text-slate-300">
                            Roles:{" "}
                            <span className="text-slate-100">
                                {(roles.length ? roles.join(", ") : "—")}
                            </span>
                        </div>
                        {canAdmin ? (
                            <Button variant="outline" onClick={() => nav("/Admin/users")} className="w-full">
                                Open Admin
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
