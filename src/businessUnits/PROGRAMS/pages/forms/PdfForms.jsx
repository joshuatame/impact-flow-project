import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { createPageUrl } from "@/utils";

/**
 * PdfForms has two modes:
 *  - WorkflowRequest mode: PdfForms?workflow_request_id=... (shows assigned instances)
 *  - Participant Manual Library mode: PdfForms?participant_id=... (shows manual templates; instances created on click)
 */
function getParams(params) {
    const workflowRequestId = params.get("workflow_request_id") || params.get("wr") || null;
    const participantId = params.get("participant_id") || params.get("participantId") || null;
    return { workflowRequestId, participantId };
}

function normalizeTrigger(v) {
    return String(v || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/-+/g, "_");
}

export default function PdfForms() {
    const [params] = useSearchParams();
    const { workflowRequestId, participantId } = getParams(params);

    const isManualLibrary = !!participantId && !workflowRequestId;

    const { data: instances = [], isLoading: instancesLoading } = useQuery({
        queryKey: ["pdfFormInstances", workflowRequestId, participantId],
        queryFn: async () => {
            const all = await base44.entities.PdfFormInstance.list("-created_date", 500);
            return all.filter((x) => {
                if (workflowRequestId && x.workflow_request_id === workflowRequestId) return true;
                if (participantId && x.participant_id === participantId) return true;
                return false;
            });
        },
        enabled: !!workflowRequestId || !!participantId,
    });

    const { data: templates = [], isLoading: templatesLoading } = useQuery({
        queryKey: ["manualPdfTemplates"],
        queryFn: async () => {
            const all = await base44.entities.PdfTemplate.list("-created_date", 500);
            return all.filter((t) => {
                const trig = normalizeTrigger(t.trigger_event || t.trigger || t.triggerEvent || t.trigger_type);
                const active = t.is_active !== false;
                return active && (trig === "manual" || trig.startsWith("manual_"));
            });
        },
        enabled: isManualLibrary,
    });

    const byTemplateId = useMemo(() => {
        const m = new Map();
        for (const inst of instances) {
            if (inst.template_id) m.set(String(inst.template_id), inst);
        }
        return m;
    }, [instances]);

    const startMutation = useMutation({
        mutationFn: async ({ templateId }) => {
            const res = await base44.functions.getOrCreateManualPdfFormInstanceForParticipant({
                participantId,
                templateId,
            });
            return res;
        },
    onError: (e) => {
            console.error(e);
            alert(e?.message || String(e));
        },
        onSuccess: (res) => {
            const id = res?.instanceId;
            if (!id) return;
            window.location.href = createPageUrl(`PdfFormFill?id=${id}`);
        },
    });

    const pending = useMemo(() => instances.filter((x) => x.status !== "Completed"), [instances]);
    const completed = useMemo(() => instances.filter((x) => x.status === "Completed"), [instances]);

    if (!workflowRequestId && !participantId) {
        return (
            <div className="p-6">
                <Card className="bg-slate-900/60 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white">PDF Forms</CardTitle>
                    </CardHeader>
                    <CardContent className="text-slate-300">No record selected.</CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <FileText className="h-5 w-5 text-slate-200" />
                <h1 className="text-xl font-semibold text-white">
                    {isManualLibrary ? "Manual PDF Library" : "Assigned PDF Forms"}
                </h1>

                {workflowRequestId ? (
                    <Badge className="ml-2 bg-slate-800 text-slate-200 border-slate-700">Workflow</Badge>
                ) : (
                    <Badge className="ml-2 bg-slate-800 text-slate-200 border-slate-700">Participant</Badge>
                )}
            </div>

            {isManualLibrary ? (
                <Card className="bg-slate-900/60 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white">Available Manual PDFs</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {(templatesLoading || instancesLoading) && (
                            <div className="text-slate-300 text-sm">Loading...</div>
                        )}

                        {!templatesLoading && templates.length === 0 ? (
                            <div className="text-slate-300 text-sm">
                                No manual PDF templates found.
                            </div>
                        ) : null}

                        {templates.map((t) => {
                            const inst = byTemplateId.get(String(t.id));
                            const isCompleted = inst?.status === "Completed";
                            const hasInstance = !!inst;
                            const actionLabel = isCompleted
                                ? "View Final PDF"
                                : hasInstance
                                  ? "Continue"
                                  : "Start";

                            return (
                                <div
                                    key={t.id}
                                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="text-white font-medium truncate">{t.name || "Manual PDF"}</div>
                                        <div className="text-xs text-slate-400 truncate">
                                            Template: {t.id}
                                        </div>

                                        {hasInstance ? (
                                            <div className="mt-1">
                                                <Badge className={isCompleted ? "bg-emerald-600/20 text-emerald-200 border-emerald-700/40" : "bg-amber-600/20 text-amber-200 border-amber-700/40"}>
                                                    {isCompleted ? "Completed" : "In progress"}
                                                </Badge>
                                            </div>
                                        ) : (
                                            <div className="mt-1">
                                                <Badge className="bg-slate-800 text-slate-200 border-slate-700">Not started</Badge>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {isCompleted && inst?.completed_pdf_url ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="border-slate-700"
                                                onClick={() => window.open(inst.completed_pdf_url, "_blank")}
                                            >
                                                View Final PDF
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="border-slate-700"
                                                disabled={startMutation.isPending}
                                                onClick={() => startMutation.mutate({ templateId: t.id })}
                                            >
                                                {startMutation.isPending ? "Opening..." : actionLabel}
                                            </Button>
                                        )}

                                        {hasInstance ? (
                                            <Link to={createPageUrl(`PdfFormFill?id=${inst.id}`)}>
                                                <Button className="bg-emerald-600 hover:bg-emerald-700">
                                                    Open Form
                                                </Button>
                                            </Link>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    <Card className="bg-slate-900/60 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white">Pending</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {instancesLoading ? (
                                <div className="text-slate-300 text-sm">Loading...</div>
                            ) : pending.length === 0 ? (
                                <div className="text-slate-300 text-sm">No pending forms.</div>
                            ) : (
                                pending.map((inst) => (
                                    <div
                                        key={inst.id}
                                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-white font-medium truncate">
                                                {inst.template_name || "PDF Form"}
                                            </div>
                                            <div className="text-xs text-slate-400 truncate">Instance: {inst.id}</div>
                                        </div>
                                        <Link to={createPageUrl(`PdfFormFill?id=${inst.id}&wr=${inst.workflow_request_id || ""}`)}>
                                            <Button className="bg-emerald-600 hover:bg-emerald-700">Open</Button>
                                        </Link>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/60 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white">Completed</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {instancesLoading ? (
                                <div className="text-slate-300 text-sm">Loading...</div>
                            ) : completed.length === 0 ? (
                                <div className="text-slate-300 text-sm">No completed forms.</div>
                            ) : (
                                completed.map((inst) => (
                                    <div
                                        key={inst.id}
                                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-white font-medium truncate">
                                                {inst.template_name || "PDF Form"}
                                            </div>
                                            <div className="text-xs text-slate-400 truncate">Instance: {inst.id}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            {inst.completed_pdf_url ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="border-slate-700"
                                                    onClick={() => window.open(inst.completed_pdf_url, "_blank")}
                                                >
                                                    View Final PDF
                                                </Button>
                                            ) : null}
                                            <Link to={createPageUrl(`PdfFormFill?id=${inst.id}&wr=${inst.workflow_request_id || ""}`)}>
                                                <Button className="bg-emerald-600 hover:bg-emerald-700">Open</Button>
                                            </Link>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
