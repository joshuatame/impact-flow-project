// src/pages/WorkflowRequestForms.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, PenTool, Download, Save, Wand2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import SignaturePadField from "@/components/forms/SignaturePadField.jsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

function safeString(v) {
    if (v === null || v === undefined) return "";
    return String(v);
}

export default function WorkflowRequestForms() {
    const qc = useQueryClient();
    const urlParams = new URLSearchParams(window.location.search);
    const workflowRequestId = urlParams.get("id");

    const { data: currentUser } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: workflowRequest } = useQuery({
        queryKey: ["workflowRequest", workflowRequestId],
        queryFn: () => base44.entities.WorkflowRequest.get(workflowRequestId),
        enabled: !!workflowRequestId,
    });

    const { data: instances = [], isLoading } = useQuery({
        queryKey: ["pdfFormInstancesByWorkflow", workflowRequestId],
        queryFn: async () => {
            const all = await base44.entities.PdfFormInstance.list("-created_date", 500);
            return all.filter((x) => x.workflow_request_id === workflowRequestId);
        },
        enabled: !!workflowRequestId,
    });

    const [openId, setOpenId] = useState(null);
    const activeInstance = useMemo(() => instances.find((x) => x.id === openId) || null, [instances, openId]);

    const { data: template } = useQuery({
        queryKey: ["pdfTemplate", activeInstance?.template_id],
        queryFn: () => base44.entities.PdfTemplate.get(activeInstance.template_id),
        enabled: !!activeInstance?.template_id,
    });

    const [values, setValues] = useState({});
    const [saving, setSaving] = useState(false);

    const openInstance = async (inst) => {
        setOpenId(inst.id);
        setValues(inst.values && typeof inst.values === "object" ? inst.values : {});
    };

    const saveInstance = async () => {
        if (!activeInstance) return;
        setSaving(true);
        try {
            await base44.entities.PdfFormInstance.update(activeInstance.id, {
                values,
                status: "InProgress",
            });
            await qc.invalidateQueries({ queryKey: ["pdfFormInstancesByWorkflow", workflowRequestId] });
        } finally {
            setSaving(false);
        }
    };

    const saveSignature = async (dataUrl) => {
        if (!activeInstance) return;

        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `signature_${activeInstance.id}.png`, { type: "image/png" });

        const uploaded = await base44.integrations.Core.UploadFile({
            file,
            pathPrefix: "signatures",
        });

        await base44.entities.PdfFormInstance.update(activeInstance.id, {
            signature_storage_path: uploaded.storage_path,
            signature_url: uploaded.url || uploaded.file_url,
            signed_by_id: currentUser?.id || null,
            signed_by_name: currentUser?.full_name || currentUser?.display_name || null,
        });

        await qc.invalidateQueries({ queryKey: ["pdfFormInstancesByWorkflow", workflowRequestId] });
    };

    const generateMut = useMutation({
        mutationFn: async (formInstanceId) => {
            return base44.functions.generateSignedPdf({ formInstanceId });
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["pdfFormInstancesByWorkflow", workflowRequestId] });
        },
    });

    const allocateMut = useMutation({
        mutationFn: async () => {
            return base44.functions.allocatePdfFormsForWorkflowRequest({
                workflowRequestId,
                eventType: "participant_submit_for_approval",
            });
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["pdfFormInstancesByWorkflow", workflowRequestId] });
        },
    });

    // Optional templates chooser
    const { data: optionalTemplates = [] } = useQuery({
        queryKey: ["optionalPdfTemplatesForWorkflow", workflowRequestId],
        enabled: !!workflowRequestId,
        queryFn: async () => {
            // list active optional Participant templates matching event
            const all = await base44.entities.PdfTemplate.list("-display_order", 500);
            const matches = (all || []).filter((t) => {
                if (!t?.is_active) return false;
                if (t.category !== "Participant") return false;
                if (t.trigger_event !== "participant_submit_for_approval") return false;
                if (t.auto_create !== true) return false;
                if (t.availability !== "optional") return false;
                return true;
            });

            // Hide ones already allocated
            const allocatedTemplateIds = new Set((instances || []).map((i) => i.template_id));
            return matches.filter((t) => !allocatedTemplateIds.has(t.id));
        },
    });

    const [optionalTemplateId, setOptionalTemplateId] = useState("");

    const addOptionalMut = useMutation({
        mutationFn: async () => {
            if (!optionalTemplateId) throw new Error("Choose an optional template first.");
            return base44.functions.addOptionalPdfInstance({
                workflowRequestId,
                templateId: optionalTemplateId,
            });
        },
        onSuccess: async () => {
            setOptionalTemplateId("");
            await qc.invalidateQueries({ queryKey: ["pdfFormInstancesByWorkflow", workflowRequestId] });
            await qc.invalidateQueries({ queryKey: ["optionalPdfTemplatesForWorkflow", workflowRequestId] });
        },
    });

    if (isLoading) return <LoadingSpinner />;

    const schema = Array.isArray(template?.field_schema) ? template.field_schema : [];

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Forms - Pre-Approval</h1>
                    <p className="text-sm text-slate-400 mt-1">Workflow request: {workflowRequestId || "N/A"}</p>
                </div>

                <Button
                    onClick={() => allocateMut.mutate()}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={allocateMut.isPending || !workflowRequestId}
                >
                    <Wand2 className="h-4 w-4 mr-2" />
                    {allocateMut.isPending ? "Allocating..." : "Allocate Forms"}
                </Button>
            </div>

            {workflowRequest?.status && (
                <div className="text-xs text-slate-500 mb-4">
                    Current request status: <span className="text-slate-300">{workflowRequest.status}</span>
                </div>
            )}

            {/* Optional add */}
            <div className="mb-5 bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                    <Label className="text-slate-300">Add optional form (caseworker choice)</Label>
                    <Select value={optionalTemplateId} onValueChange={setOptionalTemplateId}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                            <SelectValue placeholder={optionalTemplates.length ? "Choose a template" : "No optional templates available"} />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                            {optionalTemplates.map((t) => (
                                <SelectItem key={t.id} value={t.id} className="text-white">
                                    {t.name || t.file_name || t.id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => addOptionalMut.mutate()}
                    disabled={addOptionalMut.isPending || !optionalTemplateId}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    {addOptionalMut.isPending ? "Adding..." : "Add Form"}
                </Button>
            </div>

            {instances.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-slate-300">
                    No forms allocated yet. Click Allocate Forms.
                </div>
            ) : (
                <div className="space-y-3">
                    {instances.map((inst) => (
                        <div
                            key={inst.id}
                            className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-start gap-3"
                        >
                            <div className="p-2 rounded-lg bg-slate-800">
                                <FileText className="h-4 w-4 text-slate-200" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="text-white font-medium">{inst.template_title || inst.template_name || inst.template_id}</div>
                                <div className="text-xs text-slate-500 mt-1">
                                    Status: {inst.status || "Draft"}
                                    {inst.signature_url ? " | Signature saved" : ""}
                                    {inst.generated_pdf_url ? " | PDF generated" : ""}
                                </div>

                                {inst.generated_pdf_url && (
                                    <a
                                        href={inst.generated_pdf_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 text-sm inline-flex items-center gap-2 mt-2"
                                    >
                                        <Download className="h-4 w-4" />
                                        Open generated PDF
                                    </a>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" className="border-slate-700" onClick={() => openInstance(inst)}>
                                    <PenTool className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>

                                <Button
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => generateMut.mutate(inst.id)}
                                    disabled={generateMut.isPending}
                                >
                                    {generateMut.isPending ? "Generating..." : "Generate PDF"}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={!!openId} onOpenChange={(o) => (!o ? setOpenId(null) : null)}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white">Complete Form</DialogTitle>
                    </DialogHeader>

                    {!activeInstance ? (
                        <div className="text-slate-300">No form selected.</div>
                    ) : (
                        <div className="space-y-5 mt-4">
                            <div className="text-sm text-slate-400">
                                Template: <span className="text-slate-200">{activeInstance.template_title || activeInstance.template_id}</span>
                            </div>

                            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-4">
                                <h3 className="text-white font-semibold">Manual fields</h3>

                                {schema.length === 0 ? (
                                    <p className="text-slate-400 text-sm">
                                        No fields configured on this template yet. Add fields in Admin - PDF Templates.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {schema
                                            .filter((f) => !f.map_key || String(f.map_key).trim() === "")
                                            .filter((f) => f.type !== "signature")
                                            .map((f) => (
                                                <div key={f.id} className="space-y-1">
                                                    <Label className="text-slate-300">{f.label || f.id}</Label>
                                                    <Input
                                                        type={f.type === "date" ? "date" : "text"}
                                                        value={safeString(values[f.id])}
                                                        onChange={(e) => setValues((p) => ({ ...p, [f.id]: e.target.value }))}
                                                        className="bg-slate-800 border-slate-700 text-white"
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                                <SignaturePadField onSavePng={saveSignature} disabled={saving} />
                                {activeInstance.signature_url && (
                                    <div className="mt-3">
                                        <div className="text-xs text-slate-400 mb-2">Saved signature preview</div>
                                        <img
                                            src={activeInstance.signature_url}
                                            alt="signature"
                                            className="max-h-24 bg-white rounded border border-slate-700"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <Button variant="outline" className="border-slate-700" onClick={() => setOpenId(null)}>
                                    Close
                                </Button>
                                <Button onClick={saveInstance} className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
                                    <Save className="h-4 w-4 mr-2" />
                                    {saving ? "Saving..." : "Save"}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
