/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/AwardsRates.jsx  (REPLACE)
 * - Dropdown from awardsCatalog
 * - Buttons: Sync Catalog + Interpret Selected Award
 * - Create entity-scoped Award and apply compliance defaults
 **************************************************************************************************/

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select.jsx";
import {
    createAward,
    getAwardInterpretation,
    getWfConnectUser,
    interpretAward,
    listAwards,
    listAwardsCatalog,
    syncAwardsCatalog,
    updateAwardComplianceDefaults,
} from "../../api/labourHireApi.js";

export default function AwardsRates() {
    const user = auth.currentUser;

    const [entityId, setEntityId] = useState(null);

    const [catalog, setCatalog] = useState([]);
    const [catalogCode, setCatalogCode] = useState("");

    const [interpretation, setInterpretation] = useState(null);
    const [entityAwards, setEntityAwards] = useState([]);
    const [selectedEntityAwardId, setSelectedEntityAwardId] = useState("");

    const [industry, setIndustry] = useState("general");
    const [err, setErr] = useState("");
    const [info, setInfo] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        async function run() {
            setErr("");
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

    async function refreshCatalog() {
        setErr("");
        try {
            const rows = await listAwardsCatalog({ limitCount: 800 });
            setCatalog(rows);
            setCatalogCode(rows?.[0]?.awardCode || "");
        } catch (e) {
            setErr(e?.message || "Failed to load awards catalog.");
        }
    }

    async function refreshEntityAwards() {
        if (!entityId) return;
        setErr("");
        try {
            const rows = await listAwards({ entityId });
            setEntityAwards(rows);
            setSelectedEntityAwardId(rows?.[0]?.id || "");
        } catch (e) {
            setErr(e?.message || "Failed to load entity awards.");
        }
    }

    useEffect(() => {
        refreshCatalog();
    }, []);

    useEffect(() => {
        refreshEntityAwards();
    }, [entityId]);

    const selectedCatalog = useMemo(() => catalog.find((a) => a.awardCode === catalogCode) || null, [catalog, catalogCode]);
    const selectedEntityAward = useMemo(() => entityAwards.find((a) => a.id === selectedEntityAwardId) || null, [entityAwards, selectedEntityAwardId]);

    async function runSync() {
        setErr("");
        setInfo("");
        try {
            setBusy(true);
            const res = await syncAwardsCatalog();
            setInfo(`Synced ${res?.count || 0} awards into catalog.`);
            await refreshCatalog();
        } catch (e) {
            setErr(e?.message || "Sync failed.");
        } finally {
            setBusy(false);
            setTimeout(() => setInfo(""), 2500);
        }
    }

    async function runInterpret() {
        setErr("");
        setInfo("");
        try {
            if (!catalogCode) throw new Error("Select an award code.");
            setBusy(true);
            await interpretAward(catalogCode);
            const interp = await getAwardInterpretation(catalogCode);
            setInterpretation(interp);
            setInfo("Interpretation saved.");
        } catch (e) {
            setErr(e?.message || "Interpret failed.");
        } finally {
            setBusy(false);
            setTimeout(() => setInfo(""), 2500);
        }
    }

    async function createEntityAwardFromCatalog() {
        setErr("");
        setInfo("");
        try {
            if (!entityId) throw new Error("Missing entityId.");
            if (!selectedCatalog) throw new Error("Select an award from catalog.");

            setBusy(true);
            const interp = await getAwardInterpretation(selectedCatalog.awardCode);

            const id = await createAward({
                entityId,
                name: selectedCatalog.name,
                industry,
                classifications: [],
                awardCode: selectedCatalog.awardCode,
                sourceUrl: selectedCatalog.awardHtmlUrl,
                complianceDefaults: interp?.complianceDefaults || null,
                user,
            });

            setInfo(`Created award (${id}).`);
            await refreshEntityAwards();
        } catch (e) {
            setErr(e?.message || "Create failed.");
        } finally {
            setBusy(false);
            setTimeout(() => setInfo(""), 2500);
        }
    }

    async function applyComplianceDefaultsToEntityAward() {
        setErr("");
        setInfo("");
        try {
            if (!entityId) throw new Error("Missing entityId.");
            if (!selectedEntityAwardId) throw new Error("Select an entity award.");
            if (!interpretation?.complianceDefaults) throw new Error("No compliance defaults available. Interpret an award first.");

            setBusy(true);
            await updateAwardComplianceDefaults({
                awardId: selectedEntityAwardId,
                entityId,
                complianceDefaults: interpretation.complianceDefaults,
                user,
            });
            setInfo("Compliance defaults applied to entity award.");
            await refreshEntityAwards();
        } catch (e) {
            setErr(e?.message || "Apply failed.");
        } finally {
            setBusy(false);
            setTimeout(() => setInfo(""), 2500);
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
                    <CardTitle>Awards & compliance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2 flex-wrap">
                        <Button onClick={runSync} disabled={busy} variant="outline">
                            Sync awards catalog (FWC)
                        </Button>
                        <Button onClick={runInterpret} disabled={busy || !catalogCode}>
                            Interpret selected award
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label>Catalog award</Label>
                            <Select value={catalogCode} onValueChange={setCatalogCode}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select award code" />
                                </SelectTrigger>
                                <SelectContent>
                                    {catalog.map((a) => (
                                        <SelectItem key={a.awardCode} value={a.awardCode}>
                                            {a.name} [{a.awardCode}]
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-muted-foreground">{selectedCatalog?.awardHtmlUrl || "—"}</div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Industry (for entity award)</Label>
                            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="security / construction / hospitality…" />
                            <Button variant="outline" onClick={createEntityAwardFromCatalog} disabled={busy || !selectedCatalog || !entityId}>
                                Create entity award from catalog
                            </Button>
                        </div>

                        <div className="grid gap-2">
                            <Label>Entity awards</Label>
                            <Select value={selectedEntityAwardId} onValueChange={setSelectedEntityAwardId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select entity award" />
                                </SelectTrigger>
                                <SelectContent>
                                    {entityAwards.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name} {a.awardCode ? `[${a.awardCode}]` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button
                                variant="outline"
                                onClick={applyComplianceDefaultsToEntityAward}
                                disabled={busy || !selectedEntityAwardId || !interpretation?.complianceDefaults}
                            >
                                Apply interpreted compliance defaults to entity award
                            </Button>
                        </div>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Interpretation</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {interpretation ? (
                                <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="secondary">{interpretation.awardCode}</Badge>
                                        <Badge variant="outline">Interpreted</Badge>
                                        {interpretation.awardHtmlUrl ? (
                                            <a className="text-sm underline" href={interpretation.awardHtmlUrl} target="_blank" rel="noreferrer">
                                                View award
                                            </a>
                                        ) : null}
                                    </div>

                                    <div className="text-sm">{interpretation.summary || "—"}</div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-sm">Compliance defaults</CardTitle>
                                            </CardHeader>
                                            <CardContent className="text-sm space-y-1">
                                                <div>Break after: <b>{interpretation.complianceDefaults?.breakRequiredAfterHours ?? 5}h</b></div>
                                                <div>Min break: <b>{interpretation.complianceDefaults?.minBreakHours ?? 0.5}h</b></div>
                                                <div>Max daily hours: <b>{interpretation.complianceDefaults?.maxDailyHours ?? 12}h</b></div>
                                                <div>Daily OT after: <b>{interpretation.complianceDefaults?.overtimeDailyAfterHours ?? 8}h</b></div>
                                            </CardContent>
                                        </Card>

                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-sm">Entity award</CardTitle>
                                            </CardHeader>
                                            <CardContent className="text-sm space-y-1">
                                                <div>Name: <b>{selectedEntityAward?.name || "—"}</b></div>
                                                <div>Code: <b>{selectedEntityAward?.awardCode || "—"}</b></div>
                                                <div>
                                                    Stored compliance defaults:{" "}
                                                    <b>{selectedEntityAward?.complianceDefaults ? "Yes" : "No"}</b>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </>
                            ) : (
                                <div className="text-sm text-muted-foreground">
                                    Interpret an award to generate compliance defaults and a plain-English summary.
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="text-xs text-muted-foreground">
                        Sync and interpretation are performed by Cloud Functions: <code>wfConnectSyncAwardsCatalog</code> and <code>wfConnectInterpretAward</code>.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}