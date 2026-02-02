/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/candidate/CandidateProfile.jsx  (REPLACE)
 **************************************************************************************************/

import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Textarea } from "../../../../components/ui/textarea.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import { getCandidateForCurrentUser, upsertCandidate } from "../../api/labourHireApi.js";

function parseCSV(v) {
    return String(v || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
function toCSV(arr) {
    return (Array.isArray(arr) ? arr : []).join(", ");
}
function Chips({ items, onRemove }) {
    const list = Array.isArray(items) ? items : [];
    return (
        <div className="flex flex-wrap gap-2">
            {list.length ? (
                list.map((x) => (
                    <Badge key={x} variant="secondary" className="gap-2">
                        <span>{x}</span>
                        <button className="text-xs opacity-70 hover:opacity-100" onClick={() => onRemove?.(x)} type="button">
                            ✕
                        </button>
                    </Badge>
                ))
            ) : (
                <span className="text-sm text-muted-foreground">—</span>
            )}
        </div>
    );
}

export default function CandidateProfile() {
    const user = auth.currentUser;
    const [candidate, setCandidate] = useState(null);

    const [err, setErr] = useState("");
    const [info, setInfo] = useState("");
    const [saving, setSaving] = useState(false);

    const [profile, setProfile] = useState({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        summary: "",
        workRights: "unknown",
        skills: [],
        qualifications: [],
        tickets: [],
        industries: [],
        preferredLocations: [],
        experienceYears: 0,
        experienceTags: [],
    });

    useEffect(() => {
        let alive = true;
        async function run() {
            setErr("");
            try {
                const c = await getCandidateForCurrentUser();
                if (!alive) return;
                setCandidate(c);

                const p = c?.profile || {};
                setProfile({
                    firstName: p.firstName || "",
                    lastName: p.lastName || "",
                    phone: p.phone || "",
                    email: p.email || user?.email || "",
                    summary: p.summary || "",
                    workRights: p.workRights || "unknown",
                    skills: Array.isArray(p.skills) ? p.skills : [],
                    qualifications: Array.isArray(p.qualifications) ? p.qualifications : [],
                    tickets: Array.isArray(p.tickets) ? p.tickets : [],
                    industries: Array.isArray(p.industries) ? p.industries : [],
                    preferredLocations: Array.isArray(p.preferredLocations) ? p.preferredLocations : [],
                    experienceYears: Number(p.experienceYears || 0),
                    experienceTags: Array.isArray(p.experienceTags) ? p.experienceTags : [],
                });
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load profile.");
            }
        }
        run();
        return () => {
            alive = false;
        };
    }, [user?.email]);

    const headerName = useMemo(() => {
        const n = `${profile.firstName} ${profile.lastName}`.trim();
        return n || "My Profile";
    }, [profile.firstName, profile.lastName]);

    async function save() {
        if (!candidate?.id || !candidate?.entityId) return;
        setSaving(true);
        setErr("");
        setInfo("");
        try {
            if (!profile.firstName.trim()) throw new Error("First name required.");
            if (!profile.lastName.trim()) throw new Error("Last name required.");

            const patch = {
                profile: {
                    ...profile,
                    skills: profile.skills,
                    qualifications: profile.qualifications,
                    tickets: profile.tickets,
                    industries: profile.industries,
                    preferredLocations: profile.preferredLocations,
                    experienceTags: profile.experienceTags,
                    experienceYears: Number(profile.experienceYears || 0),
                },
                status: candidate.status === "onboarding" ? "onboarding" : candidate.status,
            };

            await upsertCandidate({ entityId: candidate.entityId, candidateId: candidate.id, data: patch, user });
            setInfo("Saved.");
            setTimeout(() => setInfo(""), 2000);
        } catch (e) {
            setErr(e?.message || "Save failed.");
        } finally {
            setSaving(false);
        }
    }

    function removeFrom(key, value) {
        setProfile((prev) => ({ ...prev, [key]: (prev[key] || []).filter((x) => x !== value) }));
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
                    <CardTitle>{headerName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label>First name</Label>
                            <Input value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Last name</Label>
                            <Input value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Work rights</Label>
                            <select
                                className="h-10 rounded-md border px-3 text-sm"
                                value={profile.workRights}
                                onChange={(e) => setProfile((p) => ({ ...p, workRights: e.target.value }))}
                            >
                                <option value="unknown">Unknown</option>
                                <option value="citizen">Citizen</option>
                                <option value="pr">Permanent resident</option>
                                <option value="visa">Visa holder</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label>Phone</Label>
                            <Input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Email</Label>
                            <Input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                            <Label>Experience (years)</Label>
                            <Input
                                type="number"
                                min="0"
                                step="1"
                                value={profile.experienceYears}
                                onChange={(e) => setProfile((p) => ({ ...p, experienceYears: Number(e.target.value || 0) }))}
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>Summary (share-ready)</Label>
                        <Textarea value={profile.summary} onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Skills</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Comma separated</Label>
                                <Input
                                    value={toCSV(profile.skills)}
                                    onChange={(e) => setProfile((p) => ({ ...p, skills: parseCSV(e.target.value) }))}
                                    placeholder="forklift, customer service, traffic control"
                                />
                                <Chips items={profile.skills} onRemove={(v) => removeFrom("skills", v)} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Qualifications</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Comma separated</Label>
                                <Input
                                    value={toCSV(profile.qualifications)}
                                    onChange={(e) => setProfile((p) => ({ ...p, qualifications: parseCSV(e.target.value) }))}
                                    placeholder="Cert II Security, RSA"
                                />
                                <Chips items={profile.qualifications} onRemove={(v) => removeFrom("qualifications", v)} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Tickets / Licences</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Comma separated</Label>
                                <Input
                                    value={toCSV(profile.tickets)}
                                    onChange={(e) => setProfile((p) => ({ ...p, tickets: parseCSV(e.target.value) }))}
                                    placeholder="White Card, LF Forklift, Driver Licence"
                                />
                                <Chips items={profile.tickets} onRemove={(v) => removeFrom("tickets", v)} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Industries + Locations</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid gap-2">
                                    <Label className="text-xs text-muted-foreground">Industries (comma separated)</Label>
                                    <Input
                                        value={toCSV(profile.industries)}
                                        onChange={(e) => setProfile((p) => ({ ...p, industries: parseCSV(e.target.value) }))}
                                        placeholder="construction, hospitality, security"
                                    />
                                    <Chips items={profile.industries} onRemove={(v) => removeFrom("industries", v)} />
                                </div>
                                <div className="grid gap-2">
                                    <Label className="text-xs text-muted-foreground">Preferred locations (comma separated)</Label>
                                    <Input
                                        value={toCSV(profile.preferredLocations)}
                                        onChange={(e) => setProfile((p) => ({ ...p, preferredLocations: parseCSV(e.target.value) }))}
                                        placeholder="brisbane, logan, ipswich"
                                    />
                                    <Chips items={profile.preferredLocations} onRemove={(v) => removeFrom("preferredLocations", v)} />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle className="text-base">Experience tags (for matching)</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Comma separated</Label>
                                <Input
                                    value={toCSV(profile.experienceTags)}
                                    onChange={(e) => setProfile((p) => ({ ...p, experienceTags: parseCSV(e.target.value) }))}
                                    placeholder="night shift, warehousing, CCTV, EWP"
                                />
                                <Chips items={profile.experienceTags} onRemove={(v) => removeFrom("experienceTags", v)} />
                                <div className="text-xs text-muted-foreground">
                                    These tags drive manager role matching (skills/quals/tickets + experience tags + years).
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={save} disabled={saving}>
                            Save
                        </Button>
                        <Button variant="outline" asChild>
                            <a href="/labourhire/candidate/documents">Upload documents</a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}