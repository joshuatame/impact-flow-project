// src/pages/PdfPacketReview.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { FileText, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";

function statusBadge(s) {
    const v = String(s || "").toLowerCase();
    if (v === "completed" || v === "migrated") return "bg-emerald-500/10 text-emerald-300";
    if (v === "inprogress" || v === "draft" || v === "pending") return "bg-amber-500/10 text-amber-300";
    return "bg-slate-500/10 text-slate-300";
}

export default function PdfPacketReview() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const workflowRequestId = params.get("wr");

    const [loading, setLoading] = useState(true);
    const [instances, setInstances] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const [gating, setGating] = useState({ total: 0, completed: 0, allCompleted: false });

    async function loadPacket() {
        if (!workflowRequestId) return;

        setLoading(true);
        try {
            // 1) Load instances for this workflow request
            // NOTE: If your base44 list does not support filtering, replace with a tiny cloud function query.
            const list = await base44.entities.PdfFormInstance.list("-created_at", 200);
            const filtered = (Array.isArray(list) ? list : []).filter(
                (x) => String(x.workflow_request_id || "") === String(workflowRequestId)
            );
            setInstances(filtered);

            // 2) Load gating
            const gate = await base44.functions.checkPdfFormsCompleteForWorkflow({ workflowRequestId });
            setGating(gate || { total: 0, completed: 0, allCompleted: false });
        } catch (e) {
            console.error(e);
            alert(e?.message || e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadPacket();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workflowRequestId]);

    const requiredCount = gating.total;
    const completedCount = gating.completed;

    const hasAllCompleted = !!gating.allCompleted;

    async function submitToManagers() {
        if (!workflowRequestId) return;

        if (!hasAllCompleted) {
            alert("All PDF forms must be completed before submitting to managers.");
            return;
        }

        setSubmitting(true);
        try {
            // Update your WorkflowRequest status so it appears in manager approvals.
            // Adjust fields to your schema.
            await base44.entities.WorkflowRequest.update(workflowRequestId, {
                status: "Pending",
                pdf_packet_ready: true,
                submitted_for_manager_at: new Date().toISOString(),
            });

            alert("Submitted to managers for approval.");
            navigate(createPageUrl("Dashboard"));
        } catch (e) {
            console.error(e);
            alert(e?.message || e);
        } finally {
            setSubmitting(false);
        }
    }

    if (!workflowRequestId) {
        return (
            <div className="p-4 md:p-8">
                <PageHeader title="PDF Packet Review" subtitle="Missing workflow request id" />
                <p className="text-slate-400">Open with ?wr=WORKFLOW_REQUEST_ID</p>
            </div>
        );
    }

    if (loading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="PDF Packet Review"
                subtitle={`Workflow: ${workflowRequestId} - Completed ${completedCount}/${requiredCount}`}
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="border-slate-700 text-slate-200"
                    onClick={loadPacket}
                >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                </Button>

                <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={submitToManagers}
                    disabled={!hasAllCompleted || submitting}
                >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    {submitting ? "Submitting..." : "Submit to Managers"}
                </Button>

                {!hasAllCompleted ? (
                    <div className="flex items-center gap-2 text-amber-300 text-sm">
                        <AlertTriangle className="h-4 w-4" />
                        Complete all forms to continue.
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-emerald-300 text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        Packet complete.
                    </div>
                )}
            </div>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Forms
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {instances.length === 0 ? (
                        <p className="text-slate-400 text-sm">No PDF instances found for this workflow.</p>
                    ) : (
                        instances.map((inst) => (
                            <div
                                key={inst.id}
                                className="rounded-xl border border-slate-800 bg-slate-800/20 p-4 flex flex-wrap items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <p className="text-white font-semibold truncate">
                                        {inst.template_name || inst.template_title || "PDF Form"}
                                    </p>
                                    <div className="text-xs text-slate-400 mt-1">
                                        Status:{" "}
                                        <Badge className={statusBadge(inst.status)}>{inst.status || "Unknown"}</Badge>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                        to={`/PdfFormFill?id=${encodeURIComponent(inst.id)}&wr=${encodeURIComponent(
                                            workflowRequestId
                                        )}`}
                                    >
                                        <Button type="button" className="bg-blue-600 hover:bg-blue-700">
                                            Open and Fill
                                        </Button>
                                    </Link>

                                    {inst.completed_pdf_url ? (
                                        <a href={inst.completed_pdf_url} target="_blank" rel="noreferrer">
                                            <Button type="button" variant="outline" className="border-slate-700 text-slate-200">
                                                View Final PDF
                                            </Button>
                                        </a>
                                    ) : null}
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
