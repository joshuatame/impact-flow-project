// src/pages/PdfFormDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import SignaturePad from "@/components/pdf/SignaturePad.jsx";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";

function getInstanceId() {
    const p = new URLSearchParams(window.location.search);
    return p.get("id") || p.get("instance_id") || "";
}

/**
 * NEW TEMPLATE SHAPE (from AdminPdfTemplates.jsx):
 * template.fields: array of field placements
 * template.signature_field: single signature placement (optional)
 *
 * Backward compatible:
 * - template.designer_fields (older)
 * - template.signature_fields (older)
 */
function getTemplateFields(template) {
    const a = template?.fields;
    if (Array.isArray(a)) return a;
    const b = template?.designer_fields;
    if (Array.isArray(b)) return b;
    return [];
}

function getManualFields(allFields) {
    const arr = Array.isArray(allFields) ? allFields : [];
    return arr.filter((f) => f?.mapping?.mode === "manual");
}

function getRequiresSignature(template) {
    // New shape: template.signature_field
    if (template?.signature_field) {
        return template.signature_field?.required !== false;
    }

    // Backward compat: signature fields array
    const fields = Array.isArray(template?.designer_fields) ? template.designer_fields : [];
    const sigs = fields.filter((f) => f?.mapping?.mode === "signature");
    if (sigs.length === 0) return false;
    return sigs.some((f) => f?.mapping?.required !== false);
}

/**
 * Manual field key strategy:
 * - Preferred (if you later add it): f.mapping.manualKey
 * - Otherwise: stable id-based key, so values persist across edits:
 *      "manual:" + f.id
 */
function getManualKey(f) {
    const mk = f?.mapping?.manualKey;
    if (mk && String(mk).trim()) return String(mk).trim();
    const id = f?.id ? String(f.id) : "";
    return `manual:${id || "unknown"}`;
}

function getManualLabel(f) {
    // New designer uses mapping.manualLabel; keep fallbacks
    return (
        f?.mapping?.manualLabel ||
        f?.label ||
        f?.display?.label ||
        "Manual field"
    );
}

export default function PdfFormDetail() {
    const id = getInstanceId();
    const queryClient = useQueryClient();

    const [manualValues, setManualValues] = useState({});
    const [signatureBlob, setSignatureBlob] = useState(null);
    const [submitError, setSubmitError] = useState("");

    const { data: user } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: form, isLoading: loadingForm } = useQuery({
        queryKey: ["pdfFormInstance", id],
        queryFn: () => base44.entities.PdfFormInstance.get(id),
        enabled: !!id,
    });

    const { data: template, isLoading: loadingTemplate } = useQuery({
        queryKey: ["pdfTemplate", form?.template_id],
        queryFn: () => base44.entities.PdfTemplate.get(form?.template_id),
        enabled: !!form?.template_id,
    });

    useEffect(() => {
        if (!form) return;
        // Persisted manual values live on form.values (new) or form.field_values (old)
        setManualValues(form.values || form.field_values || {});
    }, [form]);

    const templateFields = useMemo(() => getTemplateFields(template), [template]);
    const manualFields = useMemo(() => getManualFields(templateFields), [templateFields]);

    const requiresSignature = useMemo(() => getRequiresSignature(template), [template]);

    const canComplete = useMemo(() => {
        if (!user || !form) return false;

        const isAssigned = form.assigned_to_id && form.assigned_to_id === user.id;
        const role = user.app_role;
        const isPrivileged = ["SystemAdmin", "Manager", "ContractsAdmin"].includes(role);

        return isAssigned || isPrivileged;
    }, [user, form]);

    const missingManualRequired = useMemo(() => {
        const missing = [];
        for (const f of manualFields) {
            const required = f?.mapping?.required !== false; // default true
            const key = getManualKey(f);
            const val = manualValues[key];
            if (required && !String(val || "").trim()) {
                missing.push({ key, label: getManualLabel(f) });
            }
        }
        return missing;
    }, [manualFields, manualValues]);

    const submitMutation = useMutation({
        mutationFn: async () => {
            setSubmitError("");

            if (!canComplete) throw new Error("You do not have permission to complete this form.");

            if (missingManualRequired.length > 0) {
                throw new Error("Please complete all required manual fields.");
            }

            if (requiresSignature && !signatureBlob) {
                throw new Error("Signature is required.");
            }

            let signature_storage_path = null;

            if (signatureBlob) {
                const sigFile = new File([signatureBlob], `signature_${id}.png`, { type: "image/png" });
                const uploaded = await base44.integrations.Core.UploadFile({
                    file: sigFile,
                    pathPrefix: "pdf_signatures",
                });
                signature_storage_path = uploaded.storage_path;
            }

            // Persist manual values to the instance first
            await base44.entities.PdfFormInstance.update(id, {
                values: manualValues,
                status: "Draft",
            });

            // Generate PDF (backend should resolve db mappings and combine mappings itself)
            // Send both parameter styles for compatibility.
            const resp = await base44.functions.generateSignedPdf({
                formInstanceId: id,
                form_instance_id: id,
                manual_values: manualValues,
                signature_storage_path,
            });

            return resp;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["pdfFormInstance", id] });
            await queryClient.invalidateQueries({ queryKey: ["myTasks"] });
            await queryClient.invalidateQueries({ queryKey: ["tasks"] });
        },
        onError: (e) => {
            setSubmitError(String(e?.message || "Failed to submit form."));
        },
    });

    if (loadingForm || loadingTemplate) return <LoadingSpinner />;

    if (!form) {
        return <div className="p-8 text-center text-slate-300">Form not found.</div>;
    }

    const disabled = !canComplete || form.status === "Completed";

    // Output PDF URL (support several shapes)
    const outputPdfUrl =
        form.output_pdf?.file_url ||
        form.generated_pdf_url ||
        form.generated_pdf?.url ||
        form.generated_pdf?.file_url ||
        form.pdf_url ||
        "";

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
            <Link
                to={createPageUrl("Tasks")}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back
            </Link>

            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">
                        {template?.title || form.template_name || "PDF Form"}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge className="bg-slate-800 text-slate-300">Status: {form.status}</Badge>
                        {form.due_date && <Badge className="bg-slate-800 text-slate-300">Due: {form.due_date}</Badge>}
                        {form.assigned_to_name && <Badge className="bg-slate-800 text-slate-300">Assigned: {form.assigned_to_name}</Badge>}
                    </div>
                </div>

                {outputPdfUrl ? (
                    <a href={outputPdfUrl} target="_blank" rel="noreferrer">
                        <Button className="bg-blue-600 hover:bg-blue-700" type="button">
                            <FileText className="h-4 w-4 mr-2" />
                            Open PDF
                        </Button>
                    </a>
                ) : null}
            </div>

            {!canComplete && (
                <Alert className="mb-6 bg-blue-500/10 border-blue-500/20">
                    <AlertCircle className="h-4 w-4 text-blue-400" />
                    <AlertDescription className="text-blue-300">
                        You can view this form, but you are not authorised to complete it.
                    </AlertDescription>
                </Alert>
            )}

            {submitError && (
                <Alert className="mb-6 bg-red-500/10 border-red-500/20">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-red-300">{submitError}</AlertDescription>
                </Alert>
            )}

            {missingManualRequired.length > 0 && form.status !== "Completed" && (
                <Alert className="mb-6 bg-amber-500/10 border-amber-500/20">
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <AlertDescription className="text-amber-300">
                        Required fields missing:{" "}
                        <span className="text-amber-200">
                            {missingManualRequired.map((m) => m.label).join(", ")}
                        </span>
                    </AlertDescription>
                </Alert>
            )}

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Manual fields</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {manualFields.length === 0 ? (
                        <div className="text-sm text-slate-400">
                            No manual fields required for this template.
                        </div>
                    ) : (
                        manualFields.map((f) => {
                            const key = getManualKey(f);
                            const label = getManualLabel(f);
                            const required = f?.mapping?.required !== false;
                            const type = f.type || "text";

                            return (
                                <div key={f.id || key} className="space-y-1">
                                    <div className="text-sm text-slate-300">
                                        {label}{required ? " *" : ""}
                                    </div>

                                    {type === "textarea" ? (
                                        <Textarea
                                            value={manualValues[key] || ""}
                                            onChange={(e) => setManualValues((p) => ({ ...p, [key]: e.target.value }))}
                                            className="bg-slate-800 border-slate-700 text-white"
                                            rows={3}
                                            disabled={disabled}
                                        />
                                    ) : (
                                        <Input
                                            value={manualValues[key] || ""}
                                            onChange={(e) => setManualValues((p) => ({ ...p, [key]: e.target.value }))}
                                            className="bg-slate-800 border-slate-700 text-white"
                                            disabled={disabled}
                                        />
                                    )}
                                </div>
                            );
                        })
                    )}

                    {form.status !== "Completed" && requiresSignature && (
                        <SignaturePad onChange={(blob) => setSignatureBlob(blob)} />
                    )}

                    {form.status === "Completed" && (
                        <Alert className="bg-emerald-500/10 border-emerald-500/20">
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                            <AlertDescription className="text-emerald-300">
                                This form has been completed and saved.
                            </AlertDescription>
                        </Alert>
                    )}

                    {form.status !== "Completed" && (
                        <div className="flex justify-end">
                            <Button
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={!canComplete || submitMutation.isPending}
                                onClick={() => submitMutation.mutate()}
                                type="button"
                            >
                                {submitMutation.isPending ? "Submitting..." : "Submit and Generate PDF"}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
