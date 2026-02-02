// src/pages/PdfTemplateAdmin.jsx
// FIXES INCLUDED:
// 1) Radix SelectItem cannot have value="" -> use MANUAL_SENTINEL everywhere (no empty values)
// 2) Jump/shrink + resize regression -> lock overlay dimensions at pointer start (move + resize)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { pdfjsLib } from "@/lib/pdf/pdfjs";
import { loadPdfBytes } from "@/lib/pdf/loadPdfBytes";
import { pdfUnitsToPxRect, pxToPdfUnitsRect } from "@/lib/pdf/coords";

import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCUMENT_TYPES } from "@/constants/documentTypes";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Plus, Save, Trash2, FileText, Upload, RefreshCw } from "lucide-react";

const DEFAULT_FIELD_SIZE_PX = { wPx: 220, hPx: 34 };
const MIN_SIZE = { w: 18, h: 18 };

const FIELD_TYPES = [
    { type: "text", label: "Text" },
    { type: "date", label: "Date" },
    { type: "checkbox", label: "Checkbox" },
    { type: "signature", label: "Signature" },
];

function makeId(prefix = "fld") {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

// Radix SelectItem cannot have value=""; use a sentinel for "Manual"
const MANUAL_SENTINEL = "__manual__";

const QUICK_MAP_OPTIONS = [
    { group: "Participant", label: "First name", value: "Participant.first_name" },
    { group: "Participant", label: "Last name", value: "Participant.last_name" },
    { group: "Participant", label: "Full name (computed)", value: "computed.full_name" },
    { group: "Participant", label: "DOB", value: "Participant.date_of_birth" },
    { group: "Participant", label: "DOB (AU formatted, computed)", value: "computed.dob_au" },
    { group: "Participant", label: "Gender", value: "Participant.gender" },
    { group: "Participant", label: "Indigenous status", value: "Participant.indigenous_status" },
    { group: "Participant", label: "Phone", value: "Participant.contact_phone" },
    { group: "Participant", label: "Email", value: "Participant.contact_email" },
    { group: "Participant", label: "Address line 1", value: "Participant.address_line1" },
    { group: "Participant", label: "Address line 2", value: "Participant.address_line2" },
    { group: "Participant", label: "Suburb", value: "Participant.suburb" },
    { group: "Participant", label: "State", value: "Participant.state" },
    { group: "Participant", label: "Postcode", value: "Participant.postcode" },
    { group: "Participant", label: "Emergency contact name", value: "Participant.emergency_contact_name" },
    { group: "Participant", label: "Emergency contact phone", value: "Participant.emergency_contact_phone" },
    { group: "Participant", label: "Current phase", value: "Participant.current_phase" },
    { group: "Participant", label: "Status", value: "Participant.status" },

    { group: "Case worker", label: "Case worker name", value: "User.full_name" },
    { group: "Case worker", label: "Case worker email", value: "User.email" },

    { group: "System", label: "Today (AU formatted)", value: "computed.today_au" },
];

export default function PdfTemplateAdmin() {
    const [templates, setTemplates] = useState([]);
    const [loadingTemplates, setLoadingTemplates] = useState(true);
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);
    const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    const [uploading, setUploading] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState("");

    const [pdfDoc, setPdfDoc] = useState(null);
    const [pdfMeta, setPdfMeta] = useState({ pageCount: 0 });
    const [activePage, setActivePage] = useState(1);

    const [scale, setScale] = useState(1.35);
    const [rendering, setRendering] = useState(false);

    const [fieldSchema, setFieldSchema] = useState([]);
    const [selectedFieldId, setSelectedFieldId] = useState(null);

    // stable overlay sizing
    const [pageSize, setPageSize] = useState({ w: 0, h: 0 });

    const dragCreateRef = useRef(null);
    const moveRef = useRef(null);
    const resizeRef = useRef(null);

    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const renderTaskRef = useRef(null);

    const [templateWorkflow, setTemplateWorkflow] = useState({
        category: "Participant",
        trigger_event: "participant_submit_for_approval",
        availability: "required",
        auto_create: true,
        choice_group: "",
        document_category: "Consent",
    });

    async function refreshTemplates() {
        setLoadingTemplates(true);
        try {
            const list = await base44.entities.PdfTemplate.list("-created_date", 200);
            setTemplates(Array.isArray(list) ? list : []);
        } finally {
            setLoadingTemplates(false);
        }
    }

    useEffect(() => {
        refreshTemplates();
    }, []);

    useEffect(() => {
        const t = templates.find((x) => x.id === selectedTemplateId) || null;
        setSelectedTemplate(t);
        setPdfDoc(null);
        setPdfMeta({ pageCount: 0 });
        setActivePage(1);
        setSelectedFieldId(null);
        setPageSize({ w: 0, h: 0 });

        const schema = Array.isArray(t?.field_schema) ? t.field_schema : [];
        setFieldSchema(schema);

        if (t) {
            setTemplateWorkflow({
                category: t.category || "Participant",
                trigger_event: t.trigger_event || "participant_submit_for_approval",
                availability: t.availability || "required",
                auto_create: t.auto_create !== false,
                choice_group: t.choice_group || "",
                document_category: t.document_category || "Consent",
            });
        }
    }, [selectedTemplateId, templates]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!selectedTemplate) return;

            const storagePath = selectedTemplate?.storage_path || selectedTemplate?.pdf_storage_path;
            const url = selectedTemplate?.pdf_url || selectedTemplate?.file_url;

            if (!storagePath && !url) return;

            try {
                const bytes = await loadPdfBytes({ storagePath, url });
                if (cancelled) return;

                const loadingTask = pdfjsLib.getDocument({ data: bytes });
                const doc = await loadingTask.promise;
                if (cancelled) return;

                setPdfDoc(doc);
                setPdfMeta({ pageCount: doc.numPages });
                setActivePage(1);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error("Failed to load PDF", e);
                alert(`Failed to load PDF: ${e?.message || e}`);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [selectedTemplate]);

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
            } catch (_) {
                // ignore
            }

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
                // eslint-disable-next-line no-console
                console.error("Render failed", e);
            } finally {
                if (!cancelled) setRendering(false);
            }
        }

        renderPage();
        return () => {
            cancelled = true;
        };
    }, [pdfDoc, activePage, scale]);

    const activePageFields = useMemo(() => {
        return fieldSchema.filter((f) => Number(f.page) === Number(activePage));
    }, [fieldSchema, activePage]);

    async function handleUploadNewTemplate(file) {
        if (!file) return;
        if (!newTemplateName.trim()) {
            alert("Please enter a template name first.");
            return;
        }

        setUploading(true);
        try {
            const upload = await base44.integrations.Core.UploadFile({
                file,
                pathPrefix: "pdf_templates",
            });

            const created = await base44.entities.PdfTemplate.create({
                name: newTemplateName.trim(),
                pdf_url: upload.url,
                storage_path: upload.storage_path,
                file_name: upload.file_name,
                content_type: upload.content_type,
                size: upload.size,
                field_schema: [],
                is_active: true,

                category: "Participant",
                trigger_event: "participant_submit_for_approval",
                availability: "required",
                auto_create: true,
                choice_group: "",
                document_category: "Consent",
            });

            setNewTemplateName("");
            await refreshTemplates();
            setSelectedTemplateId(created.id);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            alert(`Upload failed: ${e?.message || e}`);
        } finally {
            setUploading(false);
        }
    }

    async function saveSchema() {
        if (!selectedTemplate) return;

        try {
            await base44.entities.PdfTemplate.update(selectedTemplate.id, {
                field_schema: fieldSchema,
            });
            await refreshTemplates();
            alert("Saved field schema.");
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            alert(`Save failed: ${e?.message || e}`);
        }
    }

    async function saveTemplateWorkflowSettings() {
        if (!selectedTemplate) return;

        try {
            await base44.entities.PdfTemplate.update(selectedTemplate.id, {
                category: templateWorkflow.category,
                trigger_event: templateWorkflow.trigger_event,
                availability: templateWorkflow.availability,
                auto_create: templateWorkflow.auto_create,
                choice_group: templateWorkflow.choice_group?.trim() || "",
                document_category: templateWorkflow.document_category?.trim() || "Other",
            });
            await refreshTemplates();
            alert("Saved template workflow settings.");
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            alert(`Save failed: ${e?.message || e}`);
        }
    }

    async function deleteTemplate() {
        if (!selectedTemplate) return;
        const ok = window.confirm(`Delete template "${selectedTemplate.name}"? This cannot be undone.`);
        if (!ok) return;

        try {
            await base44.entities.PdfTemplate.delete(selectedTemplate.id);
            setSelectedTemplateId(null);
            await refreshTemplates();
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
            alert(`Delete failed: ${e?.message || e}`);
        }
    }

    function onDragStartCreate(field) {
        dragCreateRef.current = field;
    }

    function onDropOnOverlay(e) {
        e.preventDefault();
        const field = dragCreateRef.current;
        if (!field) return;

        const overlay = overlayRef.current;
        if (!overlay) return;

        const rect = overlay.getBoundingClientRect();
        const xPx = e.clientX - rect.left;
        const yPx = e.clientY - rect.top;

        const wPx = field.type === "checkbox" ? 24 : DEFAULT_FIELD_SIZE_PX.wPx;
        const hPx = field.type === "checkbox" ? 24 : DEFAULT_FIELD_SIZE_PX.hPx;

        const boundedX = clamp(xPx - wPx / 2, 0, rect.width - wPx);
        const boundedY = clamp(yPx - hPx / 2, 0, rect.height - hPx);

        const pdfRect = pxToPdfUnitsRect({
            xPx: boundedX,
            yPx: boundedY,
            wPx,
            hPx,
            scale,
        });

        const newField = {
            id: makeId("field"),
            type: field.type,
            label: `${field.label}`,
            page: activePage,
            rect: pdfRect,
            map_key: "",
            required: false,
            editable_after_prefill: true,
        };

        setFieldSchema((prev) => [...prev, newField]);
        setSelectedFieldId(newField.id);
        dragCreateRef.current = null;
    }

    function onDragOverOverlay(e) {
        e.preventDefault();
    }

    // FIX: lock overlay dimensions at pointer start so drag/resizes do not jump/shrink on re-render
    function startMovePointer(e, field) {
        e.stopPropagation();
        setSelectedFieldId(field.id);

        // do not start move if a resize is active
        if (resizeRef.current) return;

        const overlay = overlayRef.current;
        if (!overlay) return;

        try {
            if (e.currentTarget?.setPointerCapture && e.pointerId !== undefined) {
                e.currentTarget.setPointerCapture(e.pointerId);
            }
        } catch (_) {
            // ignore
        }

        const overlayRect = overlay.getBoundingClientRect();
        const lockedOverlay = { width: overlayRect.width, height: overlayRect.height };

        const { xPx, yPx, wPx, hPx } = pdfUnitsToPxRect({ ...field.rect, scale });

        moveRef.current = {
            fieldId: field.id,
            page: field.page,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startX: xPx,
            startY: yPx,
            overlayW: lockedOverlay.width,
            overlayH: lockedOverlay.height,
            fieldW: wPx,
            fieldH: hPx,
        };
    }

    // FIX: lock overlay dimensions at pointer start so drag/resizes do not jump/shrink on re-render
    function startResizePointer(e, field) {
        e.stopPropagation();
        setSelectedFieldId(field.id);

        const overlay = overlayRef.current;
        if (!overlay) return;

        try {
            if (e.currentTarget?.setPointerCapture && e.pointerId !== undefined) {
                e.currentTarget.setPointerCapture(e.pointerId);
            }
        } catch (_) {
            // ignore
        }

        const overlayRect = overlay.getBoundingClientRect();
        const lockedOverlay = { width: overlayRect.width, height: overlayRect.height };

        const { xPx, yPx, wPx, hPx } = pdfUnitsToPxRect({ ...field.rect, scale });

        // kill any active move
        moveRef.current = null;

        resizeRef.current = {
            fieldId: field.id,
            page: field.page,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startW: wPx,
            startH: hPx,
            x: xPx,
            y: yPx,
            overlayW: lockedOverlay.width,
            overlayH: lockedOverlay.height,
        };
    }

    function handlePointerMove(e) {
        // move
        if (moveRef.current) {
            const st = moveRef.current;
            const dx = e.clientX - st.startClientX;
            const dy = e.clientY - st.startClientY;

            const nextX = clamp(st.startX + dx, 0, st.overlayW - st.fieldW);
            const nextY = clamp(st.startY + dy, 0, st.overlayH - st.fieldH);

            setFieldSchema((prev) =>
                prev.map((f) => {
                    if (f.id !== st.fieldId) return f;
                    if (Number(f.page) !== Number(st.page)) return f;

                    const nextRect = pxToPdfUnitsRect({
                        xPx: nextX,
                        yPx: nextY,
                        wPx: st.fieldW,
                        hPx: st.fieldH,
                        scale,
                    });

                    return { ...f, rect: nextRect };
                })
            );
            return;
        }

        // resize
        if (resizeRef.current) {
            const st = resizeRef.current;
            const dx = e.clientX - st.startClientX;
            const dy = e.clientY - st.startClientY;

            // new size in px, clamped within overlay bounds
            const maxW = Math.max(MIN_SIZE.w, st.overlayW - st.x);
            const maxH = Math.max(MIN_SIZE.h, st.overlayH - st.y);

            const nextW = clamp(st.startW + dx, MIN_SIZE.w, maxW);
            const nextH = clamp(st.startH + dy, MIN_SIZE.h, maxH);

            setFieldSchema((prev) =>
                prev.map((f) => {
                    if (f.id !== st.fieldId) return f;
                    if (Number(f.page) !== Number(st.page)) return f;

                    const nextRect = pxToPdfUnitsRect({
                        xPx: st.x,
                        yPx: st.y,
                        wPx: nextW,
                        hPx: nextH,
                        scale,
                    });

                    return { ...f, rect: nextRect };
                })
            );
        }
    }

    function handlePointerUp() {
        moveRef.current = null;
        resizeRef.current = null;
    }

    function updateSelectedField(patch) {
        if (!selectedFieldId) return;
        setFieldSchema((prev) => prev.map((f) => (f.id === selectedFieldId ? { ...f, ...patch } : f)));
    }

    function deleteSelectedField() {
        if (!selectedFieldId) return;
        setFieldSchema((prev) => prev.filter((f) => f.id !== selectedFieldId));
        setSelectedFieldId(null);
    }

    const selectedField = useMemo(() => {
        return fieldSchema.find((f) => f.id === selectedFieldId) || null;
    }, [fieldSchema, selectedFieldId]);

    const quickMapGroups = useMemo(() => {
        const groups = {};
        for (const opt of QUICK_MAP_OPTIONS) {
            if (!groups[opt.group]) groups[opt.group] = [];
            groups[opt.group].push(opt);
        }
        return groups;
    }, []);

    // FIX: never return "" for Radix Select value; use MANUAL_SENTINEL instead
    function getQuickMapSelectValue(mapKey) {
        const v = String(mapKey || "");
        if (!v) return MANUAL_SENTINEL;
        return v;
    }

    function handleQuickMapChange(v) {
        if (v === MANUAL_SENTINEL) {
            updateSelectedField({ map_key: "" });
            return;
        }
        updateSelectedField({ map_key: v });
    }

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader title="PDF Template Admin" subtitle="Upload flat PDFs and drag fields onto pages" />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Card className="bg-slate-900/50 border-slate-800 xl:col-span-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-white flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            Templates
                        
    </CardTitle>
    {selectedTemplate && !isSettingsCollapsed && (
        <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-300 hover:bg-slate-800"
            onClick={() => setIsSettingsCollapsed((v) => !v)}
        >
            {isSettingsCollapsed ? (
                <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Show Settings
                </>
            ) : (
                <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Hide Settings
                </>
            )}
        </Button>
    )}
</CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3">
                            <div>
                                <Label className="text-slate-300">New template name</Label>
                                <Input
                                    value={newTemplateName}
                                    onChange={(e) => setNewTemplateName(e.target.value)}
                                    className="bg-slate-900 border-slate-700 text-white"
                                    placeholder="e.g., Consent Form"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center">
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        id="pdf-upload-input"
                                        onChange={(e) => handleUploadNewTemplate(e.target.files?.[0])}
                                        disabled={uploading}
                                    />
                                    <span className="inline-flex">
                                        <Button
                                            type="button"
                                            className="bg-blue-600 hover:bg-blue-700"
                                            disabled={uploading || !newTemplateName.trim()}
                                            onClick={() => {
                                                const el = document.getElementById("pdf-upload-input");
                                                if (el) el.click();
                                            }}
                                        >
                                            <Upload className="h-4 w-4 mr-2" />
                                            {uploading ? "Uploading..." : "Upload PDF"}
                                        </Button>
                                    </span>
                                </label>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-slate-700 text-slate-200"
                                    onClick={refreshTemplates}
                                    disabled={loadingTemplates}
                                >
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Refresh
                                </Button>
                            </div>

                            <p className="text-xs text-slate-400">
                                PDFs are loaded via Storage SDK bytes to avoid browser CORS/range issues.
                            </p>
                        </div>

                        {loadingTemplates ? (
                            <LoadingSpinner />
                        ) : templates.length === 0 ? (
                            <p className="text-slate-500 text-sm">No templates yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {templates.map((t) => {
                                    const isActive = t.id === selectedTemplateId;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setSelectedTemplateId(t.id)}
                                            className={`w-full text-left rounded-lg p-3 border ${isActive ? "border-blue-500/40 bg-blue-500/10" : "border-slate-800 bg-slate-800/30"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-white font-medium min-w-0 truncate">{t.name || t.file_name || "Untitled"}</p>
                                                <Badge
                                                    className={
                                                        t.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                                                    }
                                                >
                                                    {t.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1">
                                                Fields: {Array.isArray(t.field_schema) ? t.field_schema.length : 0}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {selectedTemplate && (
                            <>
                                <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3">
                                    <p className="text-white font-semibold">Workflow Settings</p>


<div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-100">
    <p className="font-semibold">Important</p>
    <p className="text-blue-100/90 mt-1">
        Save the <span className="font-semibold">Schema</span> first, then save{" "}
        <span className="font-semibold">Workflow Settings</span>.
    </p>
</div>

                                    <div>
                                        <Label className="text-slate-300">Category</Label>
                                        <Select value={templateWorkflow.category} onValueChange={(v) => setTemplateWorkflow((s) => ({ ...s, category: v }))}>
                                            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                <SelectItem value="Participant" className="text-white">Participant</SelectItem>
                                                <SelectItem value="Program" className="text-white">Program</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Trigger event</Label>
                                        <Select value={templateWorkflow.trigger_event} onValueChange={(v) => setTemplateWorkflow((s) => ({ ...s, trigger_event: v }))}>
                                            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                <SelectItem value="participant_submit_for_approval" className="text-white">
                                                    participant_submit_for_approval
                                                </SelectItem>
                                                <SelectItem value="program_submit_for_approval" className="text-white">
                                                    program_submit_for_approval
                                                </SelectItem>
                                                <SelectItem value="manual" className="text-white">
                                                    manual
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Availability</Label>
                                        <Select value={templateWorkflow.availability} onValueChange={(v) => setTemplateWorkflow((s) => ({ ...s, availability: v }))}>
                                            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                <SelectItem value="required" className="text-white">required</SelectItem>
                                                <SelectItem value="optional" className="text-white">optional</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!templateWorkflow.auto_create}
                                            onChange={(e) => setTemplateWorkflow((s) => ({ ...s, auto_create: e.target.checked }))}
                                            className="rounded"
                                        />
                                        <Label className="text-white">Auto-create on trigger</Label>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Document category (for migrate)</Label>
                                        <Select
                                            value={templateWorkflow.document_category}
                                            onValueChange={(v) => setTemplateWorkflow((s) => ({ ...s, document_category: v }))}
                                        >
                                            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                                <SelectValue placeholder="Select a document category" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                                {DOCUMENT_TYPES.map((t) => (
                                                    <SelectItem key={t} value={t}>
                                                        {t}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Choice group (optional)</Label>
                                        <Input
                                            value={templateWorkflow.choice_group}
                                            onChange={(e) => setTemplateWorkflow((s) => ({ ...s, choice_group: e.target.value }))}
                                            className="bg-slate-900 border-slate-700 text-white"
                                            placeholder="e.g., ParticipantIntakePack"
                                        />
                                    </div>

                                    <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={saveTemplateWorkflowSettings}>
                                        Save Workflow Settings
                                    </Button>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 pt-2">
                                    <Button type="button" className="bg-violet-600 hover:bg-violet-700" onClick={saveSchema}>
                                        <Save className="h-4 w-4 mr-2" />
                                        Save Schema
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                                        onClick={deleteTemplate}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete Template
                                    </Button>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800 xl:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-white flex flex-wrap items-center justify-between gap-3">
                            <span className="min-w-0">Editor</span>
                            <div className="flex items-center gap-2">
                                <Label className="text-slate-400 text-xs">Scale</Label>
                                <Input
                                    type="number"
                                    value={scale}
                                    step="0.05"
                                    min="0.5"
                                    max="3"
                                    onChange={(e) => setScale(Number(e.target.value || 1))}
                                    className="w-24 bg-slate-900 border-slate-700 text-white"
                                />
                            </div>
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {!selectedTemplate ? (
                            <p className="text-slate-500">Select a template to begin.</p>
                        ) : !pdfDoc ? (
                            <div className="space-y-2">
                                <p className="text-slate-400 text-sm">Loading PDF...</p>
                                <LoadingSpinner />
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 text-slate-200"
                                            onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                                            disabled={activePage <= 1}
                                        >
                                            Prev
                                        </Button>

                                        <div className="text-slate-300 text-sm whitespace-nowrap">
                                            Page <span className="text-white font-semibold">{activePage}</span> of{" "}
                                            <span className="text-white font-semibold">{pdfMeta.pageCount}</span>
                                            {rendering && <span className="text-slate-500 ml-2">(rendering)</span>}
                                        </div>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 text-slate-200"
                                            onClick={() => setActivePage((p) => Math.min(pdfMeta.pageCount, p + 1))}
                                            disabled={activePage >= pdfMeta.pageCount}
                                        >
                                            Next
                                        </Button>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 min-w-0">
                                        <span className="text-xs text-slate-400">Drag a field onto the page:</span>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {FIELD_TYPES.map((ft) => (
                                                <div
                                                    key={ft.type}
                                                    draggable
                                                    onDragStart={() => onDragStartCreate(ft)}
                                                    className="cursor-grab active:cursor-grabbing select-none px-3 py-1 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-200 text-xs"
                                                    title="Drag onto the PDF"
                                                >
                                                    <Plus className="h-3.5 w-3.5 inline mr-1" />
                                                    {ft.label}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-2">
                                        <div className="relative inline-block border border-slate-800 rounded-xl bg-slate-950 p-2 max-w-full overflow-auto">
                                            <canvas ref={canvasRef} className="block rounded-lg" />

                                            <div
                                                ref={overlayRef}
                                                className="absolute left-2 top-2"
                                                onDrop={onDropOnOverlay}
                                                onDragOver={onDragOverOverlay}
                                                onPointerMove={handlePointerMove}
                                                onPointerUp={handlePointerUp}
                                                style={{
                                                    width: pageSize.w || 0,
                                                    height: pageSize.h || 0,
                                                }}
                                            >
                                                {activePageFields.map((f) => {
                                                    const { xPx, yPx, wPx, hPx } = pdfUnitsToPxRect({
                                                        x: f.rect?.x || 0,
                                                        y: f.rect?.y || 0,
                                                        w: f.rect?.w || 1,
                                                        h: f.rect?.h || 1,
                                                        scale,
                                                    });

                                                    const isSelected = f.id === selectedFieldId;

                                                    return (
                                                        <div
                                                            key={f.id}
                                                            onPointerDown={(e) => startMovePointer(e, f)}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedFieldId(f.id);
                                                            }}
                                                            className={`absolute rounded-md border ${isSelected ? "border-blue-400 bg-blue-500/10" : "border-emerald-400/60 bg-emerald-500/10"
                                                                }`}
                                                            style={{
                                                                left: xPx,
                                                                top: yPx,
                                                                width: Math.max(10, wPx),
                                                                height: Math.max(10, hPx),
                                                                cursor: "move",
                                                                touchAction: "none",
                                                            }}
                                                            title="Click to edit. Drag to move."
                                                        >
                                                            <div className="px-2 py-1 text-[10px] text-black flex items-center justify-between gap-2 pointer-events-none">
                                                                <span className="truncate">
                                                                    {f.label} <span className="text-black/60">({f.type})</span>
                                                                </span>
                                                                {f.required && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-800">Req</span>
                                                                )}
                                                            </div>

                                                            <div
                                                                onPointerDown={(e) => startResizePointer(e, f)}
                                                                className={`absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 rounded border ${isSelected ? "border-blue-300 bg-blue-500/70" : "border-slate-200/70 bg-slate-500/60"
                                                                    }`}
                                                                style={{
                                                                    width: 12,
                                                                    height: 12,
                                                                    cursor: "nwse-resize",
                                                                    touchAction: "none",
                                                                }}
                                                                title="Resize"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-500 mt-2">Tip: drag to move. Use the bottom-right handle to resize.</p>
                                    </div>

                                    <div className="lg:col-span-1">
                                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-4">
                                            <p className="text-white font-semibold">Field Settings</p>

                                            {!selectedField ? (
                                                <p className="text-slate-500 text-sm">Select a field on the page to edit.</p>
                                            ) : (
                                                <>
                                                    <div>
                                                        <Label className="text-slate-300">Label</Label>
                                                        <Input
                                                            value={selectedField.label || ""}
                                                            onChange={(e) => updateSelectedField({ label: e.target.value })}
                                                            className="bg-slate-900 border-slate-700 text-white"
                                                        />
                                                    </div>

                                                    <div>
                                                        <Label className="text-slate-300">Type</Label>
                                                        <Input value={selectedField.type} readOnly className="bg-slate-900 border-slate-700 text-white opacity-80" />
                                                        <p className="text-xs text-slate-500 mt-1">Type is fixed for now (v1).</p>
                                                    </div>

                                                    <div>
                                                        <Label className="text-slate-300">Quick Map (recommended)</Label>
                                                        <Select
                                                            value={getQuickMapSelectValue(selectedField.map_key)}
                                                            onValueChange={handleQuickMapChange}
                                                        >
                                                            <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                                                                <SelectValue placeholder="Select a binding (or Manual)" />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                                {/* FIX: explicit Manual option, never value="" */}
                                                                <SelectItem value={MANUAL_SENTINEL} className="text-slate-400">
                                                                    Manual (no prefill)
                                                                </SelectItem>

                                                                {Object.keys(quickMapGroups).map((grp) => (
                                                                    <div key={grp}>
                                                                        <div className="px-2 py-1 text-xs text-slate-400">{grp}</div>
                                                                        {quickMapGroups[grp].map((opt) => (
                                                                            <SelectItem
                                                                                key={`${grp}-${opt.value}-${opt.label}`}
                                                                                value={opt.value}
                                                                                className="text-white"
                                                                            >
                                                                                {opt.label}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </div>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>

                                                        <p className="text-xs text-slate-500 mt-1">This auto-populates from Participant and logged-in User.</p>
                                                    </div>

                                                    <div>
                                                        <Label className="text-slate-300">Map key (manual override)</Label>
                                                        <Input
                                                            value={selectedField.map_key || ""}
                                                            onChange={(e) => updateSelectedField({ map_key: e.target.value })}
                                                            className="bg-slate-900 border-slate-700 text-white"
                                                            placeholder='e.g., Participant.first_name or computed.full_name'
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!selectedField.required}
                                                            onChange={(e) => updateSelectedField({ required: e.target.checked })}
                                                            className="rounded"
                                                        />
                                                        <Label className="text-white">Required</Label>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedField.editable_after_prefill !== false}
                                                            onChange={(e) => updateSelectedField({ editable_after_prefill: e.target.checked })}
                                                            className="rounded"
                                                        />
                                                        <Label className="text-white">Editable after prefill</Label>
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10"
                                                        onClick={deleteSelectedField}
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete Field
                                                    </Button>
                                                </>
                                            )}
                                        </div>

                                        <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 mt-4">
                                            <p className="text-white font-semibold mb-2">Schema Summary</p>
                                            <p className="text-slate-400 text-sm">
                                                Total fields: <span className="text-white font-semibold">{fieldSchema.length}</span>
                                            </p>
                                            <p className="text-slate-400 text-sm">
                                                Page {activePage} fields: <span className="text-white font-semibold">{activePageFields.length}</span>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
