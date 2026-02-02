// src/businessUnits/LABOURHIRE/pages/manager/ManagerGenerateQuote.jsx

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select.jsx";
import { Textarea } from "../../../../components/ui/textarea.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import {
    createQuote,
    getWfConnectUser,
    listAwardRateTables,
    listAwards,
    listHiringCompanies,
    listMarginRules,
} from "../../api/labourHireApi.js";
import { computeRateSnapshot, dayKeyToLabel, formatMoney } from "../../lib/rates.js";

const DAY_TYPES = ["weekday", "saturday", "sunday", "publicHoliday"];

export default function ManagerGenerateQuote() {
    const user = auth.currentUser;

    const [entityId, setEntityId] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [awards, setAwards] = useState([]);
    const [tables, setTables] = useState([]);
    const [margins, setMargins] = useState([]);

    const [companyId, setCompanyId] = useState("");
    const [awardId, setAwardId] = useState("");
    const [tableId, setTableId] = useState("");
    const [marginId, setMarginId] = useState("");

    const [classification, setClassification] = useState("L1");
    const [roleTitle, setRoleTitle] = useState("General Labour");
    const [terms, setTerms] = useState("Standard terms apply. Rates exclude GST.");

    const [err, setErr] = useState("");
    const [info, setInfo] = useState("");

    const selectedAward = useMemo(() => awards.find((a) => a.id === awardId) || null, [awards, awardId]);
    const selectedTable = useMemo(() => tables.find((t) => t.id === tableId) || null, [tables, tableId]);
    const selectedMargin = useMemo(() => margins.find((m) => m.id === marginId) || null, [margins, marginId]);

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
        return () => {
            alive = false;
        };
    }, [user?.uid]);

    useEffect(() => {
        let alive = true;
        async function load() {
            if (!entityId) return;
            setErr("");
            try {
                const [cs, as, ms] = await Promise.all([
                    listHiringCompanies({ entityId }),
                    listAwards({ entityId }),
                    listMarginRules({ entityId }),
                ]);
                if (!alive) return;

                setCompanies(cs);
                setAwards(as);
                setMargins(ms);

                setCompanyId(cs?.[0]?.id || "");
                setAwardId(as?.[0]?.id || "");
                setMarginId(ms?.[0]?.id || "");
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load reference data.");
            }
        }
        load();
        return () => {
            alive = false;
        };
    }, [entityId]);

    useEffect(() => {
        let alive = true;
        async function loadTables() {
            if (!entityId || !awardId) return;
            try {
                const t = await listAwardRateTables({ entityId, awardId });
                if (!alive) return;
                setTables(t);
                setTableId(t?.[0]?.id || "");
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load rate tables.");
            }
        }
        loadTables();
        return () => {
            alive = false;
        };
    }, [entityId, awardId]);

    useEffect(() => {
        const fallback = selectedAward?.classifications?.[0] || "L1";
        setClassification(fallback);
    }, [selectedAward?.id]);

    const preview = useMemo(() => {
        if (!selectedTable || !selectedMargin || !selectedAward) return null;
        try {
            return computeRateSnapshot({
                awardRateTable: { ...selectedTable, id: selectedTable.id, awardId: selectedAward.id },
                marginRule: { ...selectedMargin, id: selectedMargin.id },
                classification,
                effectiveFromISO: selectedTable.effectiveFrom,
            });
        } catch (e) {
            return { _error: e?.message || "Invalid selection" };
        }
    }, [selectedTable, selectedMargin, selectedAward, classification]);

    async function sendQuote() {
        setErr("");
        setInfo("");
        try {
            if (!companyId) throw new Error("Select a company.");
            if (!preview || preview._error) throw new Error(preview?._error || "Missing preview.");
            if (!roleTitle.trim()) throw new Error("Enter role title.");

            const company = companies.find((c) => c.id === companyId);

            const id = await createQuote({
                entityId,
                payload: {
                    hiringCompanyId: companyId,
                    hiringCompanyName: company?.name || null,
                    roleTitle: roleTitle.trim(),
                    rateSnapshot: preview,
                    terms: { text: terms, version: "v1" },
                },
                user,
            });

            setInfo(`Quote sent (${id}).`);
        } catch (e) {
            setErr(e?.message || "Failed to send quote.");
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
                    <CardTitle>Generate quote</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label>Company</Label>
                            <Select value={companyId} onValueChange={setCompanyId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select company" />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Award</Label>
                            <Select value={awardId} onValueChange={setAwardId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select award" />
                                </SelectTrigger>
                                <SelectContent>
                                    {awards.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Rate table</Label>
                            <Select value={tableId} onValueChange={setTableId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select table" />
                                </SelectTrigger>
                                <SelectContent>
                                    {tables.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.effectiveFrom}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Margin rule</Label>
                            <Select value={marginId} onValueChange={setMarginId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select margin" />
                                </SelectTrigger>
                                <SelectContent>
                                    {margins.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name} · {m.type}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label>Classification</Label>
                            <Input value={classification} onChange={(e) => setClassification(e.target.value)} />
                        </div>

                        <div className="grid gap-2">
                            <Label>Role title</Label>
                            <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Terms</Label>
                        <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} />
                    </div>

                    <Card>
                        <CardContent className="p-4 space-y-3">
                            <div className="text-sm font-medium">Preview</div>
                            {preview?._error ? (
                                <div className="text-sm text-destructive">{preview._error}</div>
                            ) : preview ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {DAY_TYPES.map((d) => (
                                        <Card key={d}>
                                            <CardContent className="p-3 space-y-1">
                                                <div className="text-xs text-muted-foreground">{dayKeyToLabel(d)}</div>
                                                <div className="text-sm">Pay: {formatMoney(preview.pay[d])}</div>
                                                <div className="text-sm">Bill: {formatMoney(preview.bill[d])}</div>
                                                <div className="text-sm font-medium">
                                                    Margin: {formatMoney(Number(preview.bill[d]) - Number(preview.pay[d]))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground">Select award/table/margin to preview.</div>
                            )}
                        </CardContent>
                    </Card>

                    <div className="flex gap-2">
                        <Button onClick={sendQuote}>Send quote</Button>
                        <Button variant="outline" asChild>
                            <a href="/labourhire/company/quotes">Company quotes</a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
