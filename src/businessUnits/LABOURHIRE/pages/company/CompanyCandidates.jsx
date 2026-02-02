/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/pages/company/CompanyCandidates.jsx  (REPLACE)
 **************************************************************************************************/

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Textarea } from "../../../../components/ui/textarea.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table.jsx";
import {
    getHiringCompanyForCurrentUser,
    listPlacementsForCompany,
    listCandidatePresentationsForCompany,
    getCandidate,
    updatePresentationDecision,
} from "../../api/labourHireApi.js";
import { auth } from "../../../../firebase";

export default function CompanyCandidates() {
    const user = auth.currentUser;

    const [company, setCompany] = useState(null);
    const [placements, setPlacements] = useState([]);
    const [presentations, setPresentations] = useState([]);
    const [candidateMap, setCandidateMap] = useState({});
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
        return () => (alive = false);
    }, []);

    useEffect(() => {
        let alive = true;
        async function run() {
            if (!company?.id) return;
            setErr("");
            try {
                const [pls, pres] = await Promise.all([
                    listPlacementsForCompany({ entityId: company.entityId, hiringCompanyId: company.id, statusList: ["active", "paused"] }),
                    listCandidatePresentationsForCompany({ entityId: company.entityId, hiringCompanyId: company.id }),
                ]);
                if (!alive) return;
                setPlacements(pls);
                setPresentations(pres);

                const ids = [
                    ...new Set([
                        ...pls.map((p) => p.candidateId).filter(Boolean),
                        ...pres.map((p) => p.candidateId).filter(Boolean),
                    ]),
                ];
                const pairs = await Promise.all(ids.map(async (id) => [id, await getCandidate(id)]));
                if (!alive) return;
                setCandidateMap(Object.fromEntries(pairs));
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load candidates.");
            }
        }
        run();
        return () => (alive = false);
    }, [company?.id, company?.entityId]);

    const presentedRows = useMemo(() => {
        return presentations
            .filter((p) => p.status === "presented" || p.status === "accepted" || p.status === "declined")
            .map((p) => {
                const cand = candidateMap[p.candidateId];
                const name =
                    cand?.profile?.firstName || cand?.profile?.lastName
                        ? `${cand?.profile?.firstName || ""} ${cand?.profile?.lastName || ""}`.trim()
                        : p.candidateId;
                const skills = (cand?.profile?.skills || []).slice(0, 6);
                return { p, cand, name, skills };
            });
    }, [presentations, candidateMap]);

    const placementRows = useMemo(() => {
        return placements.map((pl) => {
            const cand = candidateMap[pl.candidateId];
            const name =
                cand?.profile?.firstName || cand?.profile?.lastName
                    ? `${cand?.profile?.firstName || ""} ${cand?.profile?.lastName || ""}`.trim()
                    : pl.candidateId;
            return { pl, name };
        });
    }, [placements, candidateMap]);

    async function decide(presentationId, next) {
        
        setErr("");
        setInfo("");
        try {
            await updatePresentationDecision({ presentationId, next, note, user });
            setInfo(`Marked ${next}.`);
            setPresentations((prev) => prev.map((x) => (x.id === presentationId ? { ...x, status: next } : x)));
            setNote("");
            setTimeout(() => setInfo(""), 2000);
        } catch (e) {
            setErr(e?.message || "Update failed.");
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Presented candidates</CardTitle>
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
                                        <TableHead>Candidate</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Top skills</TableHead>
                                        <TableHead className="text-right">Decision</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {presentedRows.length ? (
                                        presentedRows.map(({ p, name, skills }) => (
                                            <TableRow key={p.id}>
                                                <TableCell>
                                                    <Badge variant={p.status === "presented" ? "default" : "secondary"}>{p.status}</Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">{name || "—"}</TableCell>
                                                <TableCell>{p.roleTitle || "—"}</TableCell>
                                                <TableCell className="flex flex-wrap gap-2">
                                                    {skills.length ? skills.map((s) => <Badge key={s} variant="outline">{s}</Badge>) : <span className="text-sm text-muted-foreground">—</span>}
                                                </TableCell>
                                                <TableCell className="text-right space-x-2">
                                                    <Button size="sm" onClick={() => decide(p.id, "accepted")} disabled={p.status !== "presented"}>
                                                        Accept
                                                    </Button>
                                                    <Button size="sm" variant="outline" onClick={() => decide(p.id, "declined")} disabled={p.status !== "presented"}>
                                                        Decline
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-sm text-muted-foreground">
                                                No candidates have been presented to your company yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="text-xs text-muted-foreground">
                        You only see candidates WF Connect has presented to you (not the full database).
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Active placements</CardTitle>
                </CardHeader>
                <CardContent>
                    <Card>
                        <CardContent className="p-0 overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Candidate</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Start</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {placementRows.length ? (
                                        placementRows.map(({ pl, name }) => (
                                            <TableRow key={pl.id}>
                                                <TableCell>
                                                    <Badge variant={pl.status === "active" ? "default" : "secondary"}>{pl.status}</Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">{name || "—"}</TableCell>
                                                <TableCell>{pl.roleTitle || "—"}</TableCell>
                                                <TableCell>{pl.startDate || "—"}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-sm text-muted-foreground">
                                                No active placements.
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