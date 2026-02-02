// src/pages/PdfFormFill.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

import { pdfjsLib } from "@/lib/pdf/pdfjs";
import { loadPdfBytes } from "@/lib/pdf/loadPdfBytes";
import { pdfUnitsToPxRect } from "@/lib/pdf/coords";
import { resolveAllFieldValues } from "@/lib/pdf/pdfFieldResolver";

import SignaturePad from "@/components/pdf/SignaturePad.jsx";

import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Save, Send } from "lucide-react";

function safeString(v) {
    if (v === null || v === undefined) return "";
    return String(v);
}

export default function PdfFormFill() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const instanceId = params.get("id");
    const wrParam = params.get("wr");

    const [loading, setLoading] = useState(true);
    const [documentCategory, setDocumentCategory] = useState("Other");
    const [saving, setSaving] = useState(false);

    const [instance, setInstance] = useState(null);
    const [template, setTemplate] = useState(null);
    const [participant, setParticipant] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);

    const [pdfDoc, setPdfDoc] = useState(null);
    const [pageCount, setPageCount] = useState(0);
    const [activePage, setActivePage] = useState(1);
    const [scale, setScale] = useState(1.2);
    const [rendering, setRendering] = useState(false);

    const [pageSize, setPageSize] = useState({ w: 0, h: 0 });

    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);

    const [values, setValues] = useState({});

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!instanceId) {
                alert("Missing PdfFormInstance id in query string (use ?id=...)");
                return;
            }

            setLoading(true);
            try {
                const inst = await base44.entities.PdfFormInstance.get(instanceId);
                if (cancelled) return;
                if (!inst) throw new Error("PdfFormInstance not found");

                const tplId = inst.template_id || inst.pdf_template_id;
                if (!tplId) throw new Error("Instance missing template_id");

                const tpl = await base44.entities.PdfTemplate.get(tplId);
                if (cancelled) return;
                if (!tpl) throw new Error("PdfTemplate not found");

                const me = await base44.auth.me();
                if (cancelled) return;

                const participantId =
                    inst.participant_id ||
                    inst.linked_participant_id ||
                    inst.participantId ||
                    inst.linked_participantId ||
                    null;

                let p = null;
                if (participantId) {
                    p = await base44.entities.Participant.get(participantId);
                    if (cancelled) return;
                }

                const existingValues = inst.values && typeof inst.values === "object" ? inst.values : {};

                setInstance(inst);
                setTemplate(tpl);
                setCurrentUser(me || null);
                setParticipant(p || null);
                setValues(existingValues);
            } catch (e) {
                console.error(e);
                alert(e?.message || e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [instanceId]);

    useEffect(() => {
        let cancelled = false;

        async function loadPdf() {
            if (!template) return;

            const storagePath = template?.storage_path || template?.pdf_storage_path;
            const url = template?.pdf_url || template?.file_url;

            try {
                const bytes = await loadPdfBytes({ storagePath, url });
                if (cancelled) return;

                const loadingTask = pdfjsLib.getDocument({ data: bytes });
                const doc = await loadingTask.promise;
                if (cancelled) return;

                setPdfDoc(doc);
                setPageCount(doc.numPages);
                setActivePage(1);
            } catch (e) {
                console.error(e);
                alert(`Failed to load PDF: ${e?.message || e}`);
            }
        }

        loadPdf();
        return () => {
            cancelled = true;
        };
    }, [template]);

    useEffect(() => {
        let cancelled = false;

        async function renderPage() {
            if (!pdfDoc || !canvasRef.current) return;

            setRendering(true);

            try {
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }
            } catch (_) { }

            try {
                const page = await pdfDoc.getPage(activePage);
                if (cancelled) return;

                const viewport = page.getViewport({ scale });
                const canvas = canvasRef.current;
                const ctx = canvas.getContext("2d");

                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);

                setPageSize({ w: canvas.width, h: canvas.height });

                const task = page.render({ canvasContext: ctx, viewport });
                renderTaskRef.current = task;

                await task.promise;
                renderTaskRef.current = null;
            } catch (e) {
                if (String(e?.name || "").toLowerCase().includes("rendercancelled")) return;
                console.error(e);
            } finally {
                if (!cancelled) setRendering(false);
            }
        }

        renderPage();
        return () => {
            cancelled = true;
        };
    }, [pdfDoc, activePage, scale]);

    const schema = useMemo(() => {
        return Array.isArray(template?.field_schema) ? template.field_schema : [];
    }, [template]);

    // Key fix: use instance.participant_snapshot pre-approval
    const participantCtx = useMemo(() => {
        if (participant && typeof participant === "object") return participant;
        if (instance?.participant_snapshot && typeof instance.participant_snapshot === "object") {
            return instance.participant_snapshot;
        }
        return {};
    }, [participant, instance]);

    const ctx = useMemo(() => {
        return {
            Participant: participantCtx || {},
            User: currentUser || {},
        };
    }, [participantCtx, currentUser]);

    const resolvedValues = useMemo(() => {
        const prefilled = resolveAllFieldValues({
            schema,
            ctx,
            manualValues: values,
        });

        const out = { ...prefilled };
        for (const f of schema) {
            if (f.type === "checkbox") out[f.id] = !!out[f.id];
        }
        return out;
    }, [schema, ctx, values]);

    const activePageFields = useMemo(() => {
        return schema.filter((f) => Number(f.page) === Number(activePage));
    }, [schema, activePage]);

    function isPrefilledLocked(field) {
        if (field.editable_after_prefill === false) {
            const v = resolvedValues?.[field.id];
            return v !== undefined && v !== null && String(v).trim() !== "";
        }
        return false;
    }

    function canSignField(field) {
        if (field.type !== "signature") return true;
        const role = field.signer_role || "participant";
        const meRole = instance?.actor_role || "caseworker";

        if (role === "either") return true;
        if (role === meRole) return true;

        // Allow caseworkers to capture participant signatures during pre-approval.
        if (meRole === "caseworker" && role === "participant") return true;

        return false;
    }

    function setFieldValue(fieldId, v) {
        setValues((prev) => ({ ...prev, [fieldId]: v }));
    }

    function validateRequired() {
        const missing = [];
        for (const f of schema) {
            if (!f.required) continue;
            const v = resolvedValues?.[f.id];
            const ok = !(v === undefined || v === null || String(v).trim() === "");
            if (!ok) missing.push(f.label || f.id);
        }
        return missing;
    }

    async function saveDraft() {
        if (!instance) return;

        setSaving(true);
        try {
            await base44.entities.PdfFormInstance.update(instance.id, {
                values,
                status: "InProgress",
            });
            alert("Draft saved.");
        } catch (e) {
            console.error(e);
            alert(`Save failed: ${e?.message || e}`);
        } finally {
            setSaving(false);
        }
    }

    async function submit() {
        if (!instance) return;

        const missing = validateRequired();
        if (missing.length > 0) {
            alert(`Missing required fields:\n- ${missing.join("\n- ")}`);
            return;
        }

        setSaving(true);
        try {
            const resp = await base44.functions.generateSignedPdf({
                formInstanceId: instance.id,
                manual_values: values,
                documentCategory,
            });

            const refreshed = await base44.entities.PdfFormInstance.get(instance.id);
            if (refreshed) {
                setInstance(refreshed);
                setValues(refreshed.values && typeof refreshed.values === "object" ? refreshed.values : values);
            }

            const isManualParticipantPdf = !!(instance?.participant_id) && !(wrParam || instance?.workflow_request_id);

            alert(
                resp?.completedPdfUrl
                    ? (isManualParticipantPdf
                        ? "Completed. Saved to Participant Documents."
                        : "Completed. PDF generated for manager review.")
                    : "Completed."
            );

            const wr = wrParam || instance?.workflow_request_id;
            if (wr) navigate(createPageUrl(`PdfPacketReview?wr=${wr}`));
            else navigate(-1);
        } catch (e) {
            console.error(e);
            alert(`Submit failed: ${e?.message || e}`);
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <LoadingSpinner />;

    if (!instance || !template) {
        return (
            <div className="p-4 md:p-8">
                <PageHeader title="PDF Form Fill" subtitle="No instance loaded" />

            <div className="mt-3 max-w-xs">
                <label className="text-xs text-slate-400">Document category</label>
                <select
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
                    value={documentCategory}
                    onChange={(e) => setDocumentCategory(e.target.value)}
                >
                    <option value="Consent">Consent</option>
                    <option value="Medical">Medical</option>
                    <option value="Other">Other</option>
                </select>
            </div>

                <p className="text-slate-400">Check the URL includes ?id=YOUR_INSTANCE_ID</p>
            </div>
        );
    }

    const hasParticipant = !!participant?.id;
    const usingSnapshot = !hasParticipant && !!instance?.participant_snapshot;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="PDF Form Fill"
                subtitle={`Template: ${template.name || template.file_name || "Untitled"} - Instance: ${instance.id}`}
            />

            <div className="mb-3 flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="border-slate-700 text-slate-200"
                    onClick={() => {
                        const wr = wrParam || instance?.workflow_request_id;
                        if (wr) navigate(createPageUrl(`PdfPacketReview?wr=${wr}`));
                        else navigate(-1);
                    }}
                >
                    Back
                </Button>
            </div>

            {!hasParticipant && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                    <p className="text-amber-200 text-sm font-semibold">
                        Participant not created yet (pre-approval).
                    </p>
                    <p className="text-amber-100/80 text-xs mt-1">
                        Prefill source: {usingSnapshot ? "WorkflowRequest snapshot" : "none"}.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="bg-slate-900/50 border-slate-800 xl:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center justify-between">
                            <span>Document</span>
                            <div className="flex items-center gap-2">
                                <Label className="text-slate-400 text-xs">Scale</Label>
                                <Input
                                    type="number"
                                    value={scale}
                                    step="0.05"
                                    min="0.5"
                                    max="2"
                                    onChange={(e) => setScale(Number(e.target.value || 1))}
                                    className="w-24 bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {!pdfDoc ? (
                            <div className="space-y-2">
                                <p className="text-slate-400 text-sm">Loading PDF...</p>
                                <LoadingSpinner />
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 text-slate-200"
                                            onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                                            disabled={activePage <= 1}
                                        >
                                            Prev
                                        </Button>

                                        <div className="text-slate-300 text-sm">
                                            Page <span className="text-white font-semibold">{activePage}</span> of{" "}
                                            <span className="text-white font-semibold">{pageCount}</span>
                                            {rendering && <span className="text-slate-500 ml-2">(rendering)</span>}
                                        </div>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 text-slate-200"
                                            onClick={() => setActivePage((p) => Math.min(pageCount, p + 1))}
                                            disabled={activePage >= pageCount}
                                        >
                                            Next
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 text-slate-200"
                                            onClick={saveDraft}
                                            disabled={saving}
                                        >
                                            <Save className="h-4 w-4 mr-2" />
                                            {saving ? "Saving..." : "Save Draft"}
                                        </Button>

                                        <Button
                                            type="button"
                                            className="bg-emerald-600 hover:bg-emerald-700"
                                            onClick={submit}
                                            disabled={saving}
                                        >
                                            <Send className="h-4 w-4 mr-2" />
                                            {saving ? "Submitting..." : "Submit"}
                                        </Button>
                                    </div>
                                </div>

                                <div className="relative inline-block border border-slate-800 rounded-xl bg-slate-950 p-2 max-w-full overflow-auto">
                                    <canvas ref={canvasRef} className="block rounded-lg" />

                                    <div
                                        className="absolute left-2 top-2"
                                        style={{
                                            width: pageSize.w || 0,
                                            height: pageSize.h || 0,
                                        }}
                                    >
                                        {activePageFields.map((f) => {
                                            const px = pdfUnitsToPxRect({
                                                x: f.rect?.x || 0,
                                                y: f.rect?.y || 0,
                                                w: f.rect?.w || 1,
                                                h: f.rect?.h || 1,
                                                scale,
                                            });

                                            const locked = isPrefilledLocked(f);

                                            if (f.type === "checkbox") {
                                                const checked = !!resolvedValues?.[f.id];
                                                return (
                                                    <div
                                                        key={f.id}
                                                        className="absolute"
                                                        style={{
                                                            left: px.xPx,
                                                            top: px.yPx,
                                                            width: Math.max(18, px.wPx),
                                                            height: Math.max(18, px.hPx),
                                                        }}
                                                        title={f.label}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            disabled={locked}
                                                            onChange={(e) => setFieldValue(f.id, e.target.checked)}
                                                            className="w-full h-full accent-emerald-500"
                                                        />
                                                    </div>
                                                );
                                            }

                                            if (f.type === "signature") {
                                                const allowed = canSignField(f);
                                                return (
                                                    <div
                                                        key={f.id}
                                                        className="absolute"
                                                        style={{
                                                            left: px.xPx,
                                                            top: px.yPx,
                                                            width: Math.max(220, px.wPx),
                                                            height: Math.max(110, px.hPx),
                                                        }}
                                                        title={f.label}
                                                    >
                                                        <SignaturePad
                                                            value={safeString(resolvedValues?.[f.id])}
                                                            onChange={(v) => setFieldValue(f.id, v)}
                                                            disabled={locked || !allowed}
                                                            width={Math.max(220, Math.floor(px.wPx))}
                                                            height={Math.max(90, Math.floor(px.hPx))}
                                                        />
                                                        {!allowed && (
                                                            <p className="text-[10px] text-amber-300 mt-1">
                                                                This signature is assigned to: {f.signer_role}. Current actor cannot sign.
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div
                                                    key={f.id}
                                                    className="absolute"
                                                    style={{
                                                        left: px.xPx,
                                                        top: px.yPx,
                                                        width: Math.max(80, px.wPx),
                                                        height: Math.max(24, px.hPx),
                                                    }}
                                                    title={f.label}
                                                >
                                                    <input
                                                        type={f.type === "date" ? "date" : "text"}
                                                        value={safeString(resolvedValues?.[f.id])}
                                                        disabled={locked}
                                                        onChange={(e) => setFieldValue(f.id, e.target.value)}
                                                        className={`w-full h-full rounded-md px-2 text-sm bg-white border ${locked ? "border-slate-300 text-slate-500" : "border-emerald-500/40 text-black"
                                                            }`}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <p className="text-xs text-slate-500">
                                    Prefill comes from WorkflowRequest snapshot (pre-approval) and later from Participant (post-approval). Manual edits save into instance.values.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800 xl:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-white">Field Checklist</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {schema.length === 0 ? (
                            <p className="text-slate-500 text-sm">No fields configured on this template.</p>
                        ) : (
                            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                                {schema.map((f) => {
                                    const v = resolvedValues?.[f.id];
                                    const filled = !(v === undefined || v === null || String(v).trim() === "");
                                    const locked = isPrefilledLocked(f);

                                    return (
                                        <div key={f.id} className="rounded-lg border border-slate-800 bg-slate-800/20 p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-white text-sm font-medium">{f.label || f.id}</p>
                                                    <p className="text-xs text-slate-400">
                                                        Page {f.page} - {f.type}
                                                        {f.required ? " - Required" : ""}
                                                        {f.map_key ? ` - map: ${f.map_key}` : ""}
                                                    </p>
                                                </div>
                                                <div className="text-xs">
                                                    <span
                                                        className={`px-2 py-1 rounded ${filled ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
                                                            }`}
                                                    >
                                                        {filled ? "Filled" : "Missing"}
                                                    </span>
                                                    {locked && (
                                                        <span className="ml-2 px-2 py-1 rounded bg-slate-500/10 text-slate-300">
                                                            Locked
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {!filled && f.required && (
                                                <p className="text-xs text-red-300 mt-2">Required field not completed.</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
