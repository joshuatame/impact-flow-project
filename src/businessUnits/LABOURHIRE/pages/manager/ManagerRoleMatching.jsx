/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/manager/ManagerRoleMatching.jsx  (NEW)
 **************************************************************************************************/

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import { Checkbox } from "../../../../components/ui/checkbox.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select.jsx";
import { Textarea } from "../../../../components/ui/textarea.jsx";
import { listCandidatesForEntity, listHiringCompanies, createCandidatePresentations, getWfConnectUser } from "../../api/labourHireApi.js";
import { groupByTier, scoreCandidateMatch } from "../../lib/matching.js";

function parseCSV(v) {
    return String(v || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
function toCSV(arr) {
    return (Array.isArray(arr) ? arr : []).join(", ");
}

function TierBadge({ tier }) {
    const variants = { A: "default", B: "secondary", C: "outline", D: "outline" };
    return <Badge variant={variants[tier] || "outline"}>Tier {tier}</Badge>;
}

export default function ManagerRoleMatching() {
    const user = auth.currentUser;

    const [entityId, setEntityId] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [companyId, setCompanyId] = useState("");

    const [candidates, setCandidates] = useState([]);
    const [selectedIds, setSelectedIds] = useState({});

    const [roleTitle, setRoleTitle] = useState("Role");
    const [roleReq, setRoleReq] = useState({
        requiredSkills: [],
        requiredQualifications: [],
        requiredTickets: [],
        industries: [],
        location: "",
        minYearsExperience: 0,
        experienceTags: [],
        notes: "",
    });

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

    useEffect(() => {
        let alive = true;
        async function load() {
            if (!entityId) return;
            setErr("");
            try {
                const [cs, cands] = await Promise.all([
                    listHiringCompanies({ entityId }),
                    listCandidatesForEntity({ entityId, statusIn: ["approved", "active", "onboarding"] }),
                ]);
                if (!alive) return;

                setCompanies(cs);
                setCompanyId(cs?.[0]?.id || "");
                setCandidates(cands);

                // default selection: none
                setSelectedIds({});
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load candidates.");
            }
        }
        load();
        return () => (alive = false);
    }, [entityId]);

    const scored = useMemo(() => {
        const rows = (candidates || []).map((c) => {
            const { score, tier, reasons } = scoreCandidateMatch({ candidate: c, roleReq });
            const name =
                c?.profile?.firstName || c?.profile?.lastName
                    ? `${c?.profile?.firstName || ""} ${c?.profile?.lastName || ""}`.trim()
                    : c.id;

            return { candidate: c, name, score, tier, reasons };
        });
        rows.sort((a, b) => b.score - a.score);
        return rows;
    }, [candidates, roleReq]);

    const buckets = useMemo(() => groupByTier(scored), [scored]);

    const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

    function toggle(id, checked) {
        setSelectedIds((prev) => ({ ...prev, [id]: !!checked }));
    }

    function selectTier(tier) {
        const ids = (buckets[tier] || []).map((r) => r.candidate.id);
        setSelectedIds((prev) => {
            const next = { ...prev };
            ids.forEach((id) => (next[id] = true));
            return next;
        });
    }

    function clearSelection() {
        setSelectedIds({});
    }

    async function presentShortlist() {
        setErr("");
        setInfo("");
        try {
            if (!companyId) throw new Error("Select a company.");
            const ids = Object.entries(selectedIds)
                .filter(([, v]) => v)
                .map(([id]) => id);
            if (!ids.length) throw new Error("Select at least one candidate to present.");

            setBusy(true);
            await createCandidatePresentations({
                entityId,
                hiringCompanyId: companyId,
                roleTitle,
                roleReq: {
                    ...roleReq,
                    requiredSkills: roleReq.requiredSkills,
                    requiredQualifications: roleReq.requiredQualifications,
                    requiredTickets: roleReq.requiredTickets,
                    industries: roleReq.industries,
                    experienceTags: roleReq.experienceTags,
                    minYearsExperience: Number(roleReq.minYearsExperience || 0),
                    location: roleReq.location || "",
                },
                candidateIds: ids,
                user,
            });

            setInfo(`Presented ${ids.length} candidate(s).`);
            clearSelection();
            setTimeout(() => setInfo(""), 2500);
        } catch (e) {
            setErr(e?.message || "Failed to present shortlist.");
        } finally {
            setBusy(false);
        }
    }

    function CandidateRow({ row }) {
        const c = row.candidate;
        const skills = (c?.profile?.skills || []).slice(0, 6);
        const quals = (c?.profile?.qualifications || []).slice(0, 3);
        const tickets = (c?.profile?.tickets || []).slice(0, 3);

        const missingSkills = (row.reasons?.missing?.skills || []).slice(0, 6);
        const missingQuals = (row.reasons?.missing?.qualifications || []).slice(0, 4);

        return (
            <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="font-medium">{row.name}</div>
                            <TierBadge tier={row.tier} />
                            <Badge variant="outline">{row.score}/100</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {Number(c?.profile?.experienceYears || 0)}y exp · {Array.isArray(c?.profile?.preferredLocations) ? c.profile.preferredLocations.join(", ") : "—"}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Checkbox checked={!!selectedIds[c.id]} onCheckedChange={(v) => toggle(c.id, v)} />
                        <span className="text-sm">Select</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {skills.length ? skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>) : <span className="text-sm text-muted-foreground">No skills</span>}
                    {quals.map((q) => <Badge key={q} variant="outline">{q}</Badge>)}
                    {tickets.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>

                {(missingSkills.length || missingQuals.length) ? (
                    <div className="text-xs text-muted-foreground">
                        Missing:{" "}
                        {missingSkills.length ? <span>skills ({missingSkills.join(", ")})</span> : null}
                        {missingSkills.length && missingQuals.length ? <span> · </span> : null}
                        {missingQuals.length ? <span>quals ({missingQuals.join(", ")})</span> : null}
                    </div>
                ) : (
                    <div className="text-xs text-muted-foreground">No critical gaps detected.</div>
                )}
            </div>
        );
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
                    <CardTitle>Role → Candidate matching</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label>Hiring company (who will receive shortlist)</Label>
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
                            <div className="text-xs text-muted-foreground">Company portal only shows candidates you present.</div>
                        </div>

                        <div className="grid gap-2">
                            <Label>Role title</Label>
                            <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
                        </div>

                        <div className="grid gap-2">
                            <Label>Preferred location (single)</Label>
                            <Input value={roleReq.location} onChange={(e) => setRoleReq((p) => ({ ...p, location: e.target.value }))} placeholder="brisbane" />
                        </div>

                        <div className="grid gap-2">
                            <Label>Min experience (years)</Label>
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                value={roleReq.minYearsExperience}
                                onChange={(e) => setRoleReq((p) => ({ ...p, minYearsExperience: Number(e.target.value || 0) }))}
                            />
                        </div>

                        <div className="grid gap-2 lg:col-span-2">
                            <Label>Notes (internal)</Label>
                            <Textarea value={roleReq.notes} onChange={(e) => setRoleReq((p) => ({ ...p, notes: e.target.value }))} placeholder="Shift pattern, start date, PPE needs…" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader><CardTitle className="text-base">Requirements</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid gap-2">
                                    <Label>Skills (comma separated)</Label>
                                    <Input
                                        value={toCSV(roleReq.requiredSkills)}
                                        onChange={(e) => setRoleReq((p) => ({ ...p, requiredSkills: parseCSV(e.target.value) }))}
                                        placeholder="forklift, pick pack, RF scanning"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Qualifications (comma separated)</Label>
                                    <Input
                                        value={toCSV(roleReq.requiredQualifications)}
                                        onChange={(e) => setRoleReq((p) => ({ ...p, requiredQualifications: parseCSV(e.target.value) }))}
                                        placeholder="Cert II Security"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Tickets / Licences (comma separated)</Label>
                                    <Input
                                        value={toCSV(roleReq.requiredTickets)}
                                        onChange={(e) => setRoleReq((p) => ({ ...p, requiredTickets: parseCSV(e.target.value) }))}
                                        placeholder="White Card, LF Forklift"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Industries (comma separated)</Label>
                                    <Input
                                        value={toCSV(roleReq.industries)}
                                        onChange={(e) => setRoleReq((p) => ({ ...p, industries: parseCSV(e.target.value) }))}
                                        placeholder="construction, warehousing"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Experience tags (comma separated)</Label>
                                    <Input
                                        value={toCSV(roleReq.experienceTags)}
                                        onChange={(e) => setRoleReq((p) => ({ ...p, experienceTags: parseCSV(e.target.value) }))}
                                        placeholder="night shift, high reach, customer facing"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle className="text-base">Shortlist</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex gap-2 flex-wrap">
                                    <Button variant="outline" onClick={() => selectTier("A")}>Select Tier A</Button>
                                    <Button variant="outline" onClick={() => selectTier("B")}>Select Tier B</Button>
                                    <Button variant="outline" onClick={clearSelection}>Clear</Button>
                                    <div className="ml-auto text-sm text-muted-foreground">
                                        Selected: <span className="font-medium text-foreground">{selectedCount}</span>
                                    </div>
                                </div>

                                <Button onClick={presentShortlist} disabled={busy || !selectedCount}>
                                    Present shortlist to company
                                </Button>

                                <div className="text-xs text-muted-foreground">
                                    Presenting creates records in <code>candidatePresentations</code>. Company sees only those candidates.
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader><CardTitle className="text-base">Results (tiered)</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            {(["A", "B", "C", "D"]).map((tier) => (
                                <div key={tier} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <TierBadge tier={tier} />
                                        <span className="text-sm text-muted-foreground">{(buckets[tier] || []).length} candidate(s)</span>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {(buckets[tier] || []).slice(0, 50).map((r) => (
                                            <CandidateRow key={r.candidate.id} row={r} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </CardContent>
            </Card>
        </div>
    );
}