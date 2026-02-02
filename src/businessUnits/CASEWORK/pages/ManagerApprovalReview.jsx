// src/pages/ManagerApprovalReview.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";

import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { pdfjsLib } from "@/lib/pdf/pdfjs";
import { loadPdfBytes } from "@/lib/pdf/loadPdfBytes";

import { Eye, CheckCircle2, XCircle } from "lucide-react";

function statusBadge(s) {
    const v = String(s || "").toLowerCase();
    if (v === "completed" || v === "migrated") return "bg-emerald-500/10 text-emerald-300";
    return "bg-slate-500/10 text-slate-300";
}

async function renderPdfThumbnailFromUrl(pdfUrl) {
    const res = await fetch(pdfUrl);
    if (!res.ok) throw new Error("Failed to fetch PDF for thumbnail");
    const buf = await res.arrayBuffer();

    const loadingTask = pdfjsLib.getDocument({ data: buf });
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);

    const scale = 0.35;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    return canvas.toDataURL("image/jpeg", 0.82);
}

export default function ManagerApprovalReview() {
    const [params] = useSearchParams();
    const workflowRequestId = params.get("wr");

    const [loading, setLoading] = useState(true);
    const [workflow, setWorkflow] = useState(null);
    const [instances, setInstances] = useState([]);
    const [thumbs, setThumbs] = useState({}); // instanceId -> dataURL
    const [preview, setPreview] = useState(null); // { url, title }
    const [approving, setApproving] = useState(false);

    async function loadAll() {
        if (!workflowRequestId) return;

        setLoading(true);
        try {
            const wr = await base44.entities.WorkflowRequest.get(workflowRequestId);

            // Load instances (adjust if your list supports filtering)
            const list = await base44.entities.PdfFormInstance.list("-created_at", 200);
            const filtered = (Array.isArray(list) ? list : []).filter(
                (x) => String(x.workflow_request_id || "") === String(workflowRequestId)
            );

            setWorkflow(wr || null);
            setInstances(filtered);

            // Build thumbnails for completed PDFs
            const completed = filtered.filter((x) => !!x.completed_pdf_url);
            const nextThumbs = {};
            for (const inst of completed) {
                try {
                    nextThumbs[inst.id] = await renderPdfThumbnailFromUrl(inst.completed_pdf_url);
                } catch (e) {
                    console.warn("Thumbnail failed", inst.id, e);
                }
            }
            setThumbs(nextThumbs);
        } catch (e) {
            console.error(e);
            alert(e?.message || e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workflowRequestId]);

    const allHavePdf = useMemo(() => {
        if (!instances.length) return false;
        return instances.every((x) => !!x.completed_pdf_url);
    }, [instances]);

    async function approveAndCreateParticipant() {
        if (!workflowRequestId) return;
        if (!workflow) return;

        if (!allHavePdf) {
            alert("Not all PDFs are completed. Case worker must generate final PDFs first.");
            return;
        }

        setApproving(true);
        try {
            // 1) Create Participant from WorkflowRequest participant_data.
            // You likely already have a function or entity create call for this.
            // Adjust these fields to your Participant schema.
            const participantData = workflow.participant_data || {};
            const created = await base44.entities.Participant.create({
                ...participantData,
                status: "Active",
                created_from_workflow_request_id: workflowRequestId,
                created_date: new Date().toISOString(),
            });

            const participantId = created?.id;
            if (!participantId) throw new Error("Participant create did not return an id.");

            // 2) Mark workflow approved and link the participant
            await base44.entities.WorkflowRequest.update(workflowRequestId, {
                status: "Approved",
                approved_at: new Date().toISOString(),
                created_participant_id: participantId,
            });

            // 3) Migrate PDF instances into Document records for participant
            await base44.functions.migratePdfForms({
                workflowRequestId,
                participantId,
            });

            alert("Approved. Participant created and PDFs saved to Documents.");
        } catch (e) {
            console.error(e);
            alert(e?.message || e);
        } finally {
            setApproving(false);
        }
    }

    if (!workflowRequestId) {
        return (
            <div className="p-4 md:p-8">
                <PageHeader title="Manager Approval" subtitle="Missing workflow request id" />
                <p className="text-slate-400">Open with ?wr=WORKFLOW_REQUEST_ID</p>
            </div>
        );
    }

    if (loading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="Manager Approval Review"
                subtitle={`Workflow: ${workflowRequestId} - PDFs: ${instances.filter((x) => x.completed_pdf_url).length}/${instances.length}`}
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={approveAndCreateParticipant}
                    disabled={approving || !allHavePdf}
                >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {approving ? "Approving..." : "Approve and Create Participant"}
                </Button>

                {!allHavePdf ? (
                    <span className="text-amber-300 text-sm">
                        Case worker must generate final PDFs for all forms first.
                    </span>
                ) : null}
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">PDFs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {instances.length === 0 ? (
                        <p className="text-slate-400 text-sm">No instances found.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {instances.map((inst) => {
                                const url = inst.completed_pdf_url;
                                const thumb = thumbs[inst.id];

                                return (
                                    <div
                                        key={inst.id}
                                        className="rounded-xl border border-slate-800 bg-slate-800/20 p-3"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-white font-semibold truncate">
                                                    {inst.template_name || inst.template_title || "PDF Form"}
                                                </p>
                                                <Badge className={statusBadge(inst.status)}>{inst.status || "Unknown"}</Badge>
                                            </div>
                                        </div>

                                        <div className="mt-3">
                                            {url ? (
                                                <button
                                                    type="button"
                                                    className="w-full"
                                                    onClick={() => setPreview({ url, title: inst.template_name || "PDF" })}
                                                >
                                                    {thumb ? (
                                                        <img
                                                            src={thumb}
                                                            alt="PDF preview"
                                                            className="w-full rounded-lg border border-slate-700 hover:opacity-90"
                                                        />
                                                    ) : (
                                                        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-8 text-slate-300 text-sm text-center">
                                                            <Eye className="h-5 w-5 inline mr-2" />
                                                            Click to preview
                                                        </div>
                                                    )}
                                                </button>
                                            ) : (
                                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 text-sm">
                                                    Final PDF not generated.
                                                </div>
                                            )}
                                        </div>

                                        {url ? (
                                            <div className="mt-3 flex items-center gap-2">
                                                <a href={url} target="_blank" rel="noreferrer" className="inline-flex">
                                                    <Button type="button" variant="outline" className="border-slate-700 text-slate-200">
                                                        Open PDF
                                                    </Button>
                                                </a>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {preview ? (
                <div
                    className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                    onClick={() => setPreview(null)}
                >
                    <div
                        className="w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-white font-semibold truncate">{preview.title}</p>
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-700 text-slate-200"
                                onClick={() => setPreview(null)}
                            >
                                <XCircle className="h-4 w-4 mr-2" />
                                Close
                            </Button>
                        </div>
                        <div className="mt-3 w-full">
                            <iframe
                                title="PDF Preview"
                                src={preview.url}
                                className="w-full h-[75vh] rounded-xl border border-slate-800 bg-white"
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
