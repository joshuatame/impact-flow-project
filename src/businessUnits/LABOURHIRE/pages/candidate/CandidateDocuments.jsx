// src/businessUnits/LABOURHIRE/pages/candidate/CandidateDocuments.jsx

import React, { useEffect, useState } from "react";
import { auth } from "../../../../firebase";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Badge } from "../../../../components/ui/badge.jsx";
import { Button } from "../../../../components/ui/button.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table.jsx";
import { getCandidateForCurrentUser, listDocumentsForCandidate, uploadCandidateDocument, upsertCandidate } from "../../api/labourHireApi.js";

export default function CandidateDocuments() {
    const user = auth.currentUser;

    const [candidate, setCandidate] = useState(null);
    const [rows, setRows] = useState([]);
    const [kind, setKind] = useState("resume");
    const [err, setErr] = useState("");
    const [info, setInfo] = useState("");

    async function reload(c) {
        const docs = await listDocumentsForCandidate({ entityId: c.entityId, candidateId: c.id });
        setRows(docs);
    }

    useEffect(() => {
        let alive = true;
        async function run() {
            setErr("");
            try {
                const c = await getCandidateForCurrentUser();
                if (!alive) return;
                setCandidate(c);
                if (!c?.id) return;
                await reload(c);
            } catch (e) {
                if (!alive) return;
                setErr(e?.message || "Failed to load documents.");
            }
        }
        run();
        return () => {
            alive = false;
        };
    }, []);

    async function onUpload(file) {
        if (!candidate?.id || !file) return;
        setErr("");
        setInfo("");
        try {
            await uploadCandidateDocument({
                entityId: candidate.entityId,
                candidateId: candidate.id,
                file,
                kind,
                user,
            });

            await upsertCandidate({
                entityId: candidate.entityId,
                candidateId: candidate.id,
                data: { checklist: { ...(candidate.checklist || {}), [kind]: true } },
                user,
            });

            setInfo("Uploaded.");
            await reload(candidate);
        } catch (e) {
            setErr(e?.message || "Upload failed.");
        } finally {
            setTimeout(() => setInfo(""), 2000);
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>My documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {err ? <div className="text-sm text-destructive">{err}</div> : null}
                    {info ? <div className="text-sm">{info}</div> : null}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="grid gap-2">
                            <Label>Type</Label>
                            <select
                                className="h-10 rounded-md border px-3 text-sm"
                                value={kind}
                                onChange={(e) => setKind(e.target.value)}
                            >
                                <option value="resume">Resume</option>
                                <option value="id">ID</option>
                                <option value="tickets">Tickets</option>
                                <option value="licence">Licence</option>
                                <option value="contract">Contract</option>
                                <option value="policy">Policy</option>
                                <option value="payslip">Payslip</option>
                            </select>
                        </div>

                        <div className="grid gap-2 md:col-span-2">
                            <Label>Upload</Label>
                            <Input
                                type="file"
                                onChange={(e) => {
                                    const f = e.target.files?.[0] || null;
                                    if (f) onUpload(f);
                                    e.target.value = "";
                                }}
                            />
                            <div className="text-xs text-muted-foreground">Stored securely in Firebase Storage with metadata in Firestore.</div>
                        </div>
                    </div>

                    <Card>
                        <CardContent className="p-0 overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Kind</TableHead>
                                        <TableHead>File</TableHead>
                                        <TableHead>Uploaded</TableHead>
                                        <TableHead>Link</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.length ? (
                                        rows.map((d) => (
                                            <TableRow key={d.id}>
                                                <TableCell>
                                                    <Badge variant="secondary">{d.kind}</Badge>
                                                </TableCell>
                                                <TableCell>{d.fileName || "—"}</TableCell>
                                                <TableCell>{d.createdAt?.toDate?.()?.toLocaleString?.() || "—"}</TableCell>
                                                <TableCell>
                                                    {d.downloadUrl ? (
                                                        <Button size="sm" variant="outline" asChild>
                                                            <a href={d.downloadUrl} target="_blank" rel="noreferrer">
                                                                Open
                                                            </a>
                                                        </Button>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-sm text-muted-foreground">
                                                No documents uploaded yet.
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
