// src/pages/AdminPdfTemplates.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Plus, Trash2, Edit, Save, X, MousePointer2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Badge } from "@/components/ui/badge";

// PDF.js
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure PDF.js worker for Vite
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Admin PDF Template Designer (user friendly)
 * - Upload or edit templates
 * - Preview PDF (page 1) as an image canvas
 * - Drag fields onto PDF
 * - Right-click a field to map to a DB field, manual field, or combine fields
 * - Signature field can also be dragged + configured
 *
 * Data model saved into PdfTemplate:
 * {
 *   title,
 *   storage_path,
 *   file_url,
 *   is_active,
 *   criteria: { events: ["NEW_PARTICIPANT_REQUEST"], program_ids: [] },
 *   fields: [
 *     {
 *       id, type: "text"|"textarea"|"date"|"checkbox",
 *       label,
 *       page: 0,
 *       x, y, w, h, fontSize,
 *       mapping: {
 *         mode: "db"|"manual"|"combine"|"none",
 *         source: "participant"|"workflow_request"|"caseworker"|"",
 *         field: "first_name"|"",
 *         required: boolean,
 *         manualLabel: string,
 *         parts: [{ source, field }],
 *         separator: string
 *       }
 *     }
 *   ],
 *   signature_field: { page:0, x,y,w,h, required:true }
 * }
 */

/**
 * Field catalog:
 * You can extend this list anytime without breaking existing templates.
 * The "source" is the object you resolve from when generating the PDF.
 */
const FIELD_CATALOG = {
    participant: [
        { key: "first_name", label: "First Name" },
        { key: "last_name", label: "Last Name" },
        { key: "full_name", label: "Full Name" },
        { key: "dob", label: "Date of Birth" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address" },
        { key: "suburb", label: "Suburb" },
        { key: "state", label: "State" },
        { key: "postcode", label: "Postcode" },
        { key: "indigenous_status", label: "Indigenous Status" },
        { key: "gender", label: "Gender" },
    ],
    workflow_request: [
        { key: "submitted_by_name", label: "Submitted By Name" },
        { key: "submitted_by_email", label: "Submitted By Email" },
        { key: "created_date", label: "Request Created Date" },
        { key: "notes", label: "Request Notes" },
    ],
    caseworker: [
        { key: "full_name", label: "Caseworker Full Name" },
        { key: "email", label: "Caseworker Email" },
    ],
};

const FIELD_TEMPLATES = [
    { type: "text", label: "Text" },
    { type: "textarea", label: "Text Box" },
    { type: "date", label: "Date" },
    { type: "checkbox", label: "Checkbox" },
    { type: "signature", label: "Signature" },
];

function uid() {
    return Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

/**
 * Convert mouse position to PDF coordinate space.
 * We render the PDF page into a canvas at some scale.
 * We store x/y/w/h in "PDF pixel space" relative to the rendered canvas size.
 * On generateSignedPdf, you should convert these pixels to PDF points using
 * the same scaling ratio you used when rendering server-side, or store the PDF width/height.
 *
 * For now, we store in "render pixels" and keep the render scale stable per template edit session.
 * This is practical and consistent for admin dragging and preview.
 */
export default function AdminPdfTemplates() {
    const qc = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const viewAsRole = user?.view_as_role || null;
    const effectiveRole = viewAsRole || currentUser?.app_role;
    const isAdmin = ["SystemAdmin", "Manager", "ContractsAdmin"].includes(effectiveRole);

    const { data: templates = [], isLoading } = useQuery({
        queryKey: ["pdfTemplates"],
        queryFn: () => base44.entities.PdfTemplate.list("-created_date", 500),
        enabled: !!effectiveRole,
    });

    // Editor state
    const [mode, setMode] = useState("list"); // "list" | "create" | "edit"
    const [editing, setEditing] = useState(null);

    // Template fields
    const [title, setTitle] = useState("");
    const [isActive, setIsActive] = useState(true);

    // Criteria simplified: we default to NEW_PARTICIPANT_REQUEST
    // Advanced Program IDs optional but hidden behind "Advanced".
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [programIdsCsv, setProgramIdsCsv] = useState("");

    // PDF file and preview
    const [uploading, setUploading] = useState(false);
    const [fileMeta, setFileMeta] = useState(null); // { storage_path, url, file_name }
    const [filePreviewUrl, setFilePreviewUrl] = useState(""); // object URL (blob) or remote url
    const [pdfBytes, setPdfBytes] = useState(null); // ArrayBuffer
    const [pdfPageImg, setPdfPageImg] = useState(null); // { dataUrl, width, height }
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfError, setPdfError] = useState("");

    // Designer state
    const [fields, setFields] = useState([]);
    const [signatureField, setSignatureField] = useState(null);

    // Dragging/selection state
    const [selectedId, setSelectedId] = useState(null);
    const [dragId, setDragId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 });

    // Context menu state
    const [ctx, setCtx] = useState({ open: false, x: 0, y: 0, targetId: null, targetType: null });

    // Mapping modal state
    const [mapOpen, setMapOpen] = useState(false);
    const [mapTargetId, setMapTargetId] = useState(null);
    const [mapDraft, setMapDraft] = useState(null);

    // Combine modal state
    const [combineOpen, setCombineOpen] = useState(false);
    const [combineTargetId, setCombineTargetId] = useState(null);
    const [combineDraft, setCombineDraft] = useState({
        parts: [],
        separator: " ",
        required: false,
    });

    const canvasWrapRef = useRef(null);
    const canvasRef = useRef(null);

    const sortedTemplates = useMemo(() => {
        const arr = Array.isArray(templates) ? [...templates] : [];
        arr.sort((a, b) => String(b?.created_date || "").localeCompare(String(a?.created_date || "")));
        return arr;
    }, [templates]);

    const deleteMut = useMutation({
        mutationFn: async (id) => base44.entities.PdfTemplate.delete(id),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["pdfTemplates"] });
        },
    });

    const upsertMut = useMutation({
        mutationFn: async () => {
            const programIds = programIdsCsv
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

            // Normalize data for storage
            const payload = {
                title: title || fileMeta?.file_name || editing?.title || "Untitled",
                is_active: !!isActive,
                criteria: {
                    events: ["NEW_PARTICIPANT_REQUEST"], // simple default, matches your onboarding flow
                    program_ids: programIds,
                },
                fields: fields.map((f) => ({
                    ...f,
                    // enforce black text in output: keep a consistent fontSize and no color config here
                    fontSize: Number(f.fontSize || 11),
                })),
                signature_field: signatureField
                    ? {
                        ...signatureField,
                        required: true,
                    }
                    : null,
            };

            // Only set file fields if a PDF is present (create OR user re-upload on edit)
            if (fileMeta?.storage_path) {
                payload.storage_path = fileMeta.storage_path;
                payload.file_url = fileMeta.url;
            } else if (editing?.storage_path) {
                payload.storage_path = editing.storage_path;
                payload.file_url = editing.file_url;
            } else {
                throw new Error("Upload a PDF first.");
            }

            if (mode === "edit" && editing?.id) {
                return base44.entities.PdfTemplate.update(editing.id, payload);
            }
            return base44.entities.PdfTemplate.create(payload);
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["pdfTemplates"] });
            resetToList();
        },
    });

    const resetToList = () => {
        setMode("list");
        setEditing(null);
        setTitle("");
        setIsActive(true);
        setShowAdvanced(false);
        setProgramIdsCsv("");
        setUploading(false);
        setFileMeta(null);
        setFilePreviewUrl("");
        setPdfBytes(null);
        setPdfPageImg(null);
        setPdfLoading(false);
        setPdfError("");
        setFields([]);
        setSignatureField(null);
        setSelectedId(null);
        setCtx({ open: false, x: 0, y: 0, targetId: null, targetType: null });
        setMapOpen(false);
        setMapTargetId(null);
        setMapDraft(null);
        setCombineOpen(false);
        setCombineTargetId(null);
        setCombineDraft({ parts: [], separator: " ", required: false });
    };

    const startCreate = () => {
        resetToList();
        setMode("create");
    };

    const startEdit = async (t) => {
        resetToList();
        setMode("edit");
        setEditing(t);

        setTitle(t.title || "");
        setIsActive(t.is_active !== false);

        const pids = t.criteria?.program_ids || [];
        setProgramIdsCsv(Array.isArray(pids) ? pids.join(", ") : "");

        setFields(Array.isArray(t.fields) ? t.fields : []);
        setSignatureField(t.signature_field || null);

        // Load PDF preview in edit mode.
        // We fetch the PDF as a blob and create an object URL so preview is reliable.
        if (t.file_url) {
            setPdfLoading(true);
            setPdfError("");
            try {
                const res = await fetch(t.file_url);
                if (!res.ok) throw new Error(`Failed to fetch PDF (${res.status})`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                setFilePreviewUrl(url);

                const ab = await blob.arrayBuffer();
                setPdfBytes(ab);
            } catch (e) {
                console.error(e);
                // fallback to direct URL (may still fail depending on storage / auth)
                setFilePreviewUrl(t.file_url);
                setPdfBytes(null);
                setPdfError("Could not load PDF preview from stored URL. This usually indicates a permissions or CORS issue on the file_url.");
            } finally {
                setPdfLoading(false);
            }
        }
    };

    const onUpload = async (file) => {
        setUploading(true);
        setPdfError("");
        try {
            const meta = await base44.integrations.Core.UploadFile({
                file,
                pathPrefix: "pdf_templates",
            });
            setFileMeta(meta);

            // For preview: use local object URL so it always shows instantly
            const url = URL.createObjectURL(file);
            setFilePreviewUrl(url);

            const ab = await file.arrayBuffer();
            setPdfBytes(ab);
        } finally {
            setUploading(false);
        }
    };

    // Render PDF page 1 to canvas and snapshot as image for overlay designer
    useEffect(() => {
        let cancelled = false;

        async function renderPdf() {
            if (!pdfBytes) return;
            setPdfLoading(true);
            setPdfError("");

            try {
                const pdf = await getDocument({ data: pdfBytes }).promise;
                const page = await pdf.getPage(1);

                // Fit to container width (scrollable wrapper handles overflow)
                const wrap = canvasWrapRef.current;
                const maxWidth = wrap ? Math.max(300, wrap.clientWidth - 24) : 900;

                const viewport0 = page.getViewport({ scale: 1 });
                const scale = maxWidth / viewport0.width;
                const viewport = page.getViewport({ scale });

                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx2d = canvas.getContext("2d");
                canvas.width = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);

                // White background
                ctx2d.fillStyle = "#ffffff";
                ctx2d.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({
                    canvasContext: ctx2d,
                    viewport,
                }).promise;

                const dataUrl = canvas.toDataURL("image/png");

                if (!cancelled) {
                    setPdfPageImg({ dataUrl, width: canvas.width, height: canvas.height });
                }
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setPdfError("Failed to render PDF preview. Ensure pdfjs-dist is installed and the PDF is valid.");
                }
            } finally {
                if (!cancelled) setPdfLoading(false);
            }
        }

        renderPdf();
        return () => {
            cancelled = true;
        };
    }, [pdfBytes]);

    // Helpers for designer geometry
    const pdfW = pdfPageImg?.width || 1;
    const pdfH = pdfPageImg?.height || 1;

    const selectedField = useMemo(() => {
        if (!selectedId) return null;
        if (selectedId === "signature") return signatureField ? { ...signatureField, id: "signature", type: "signature" } : null;
        return fields.find((f) => f.id === selectedId) || null;
    }, [selectedId, fields, signatureField]);

    const addField = (type) => {
        if (!pdfPageImg) return;

        if (type === "signature") {
            // Only one signature field
            const sf = {
                page: 0,
                x: 80,
                y: 80,
                w: 220,
                h: 70,
            };
            setSignatureField(sf);
            setSelectedId("signature");
            return;
        }

        const id = uid();
        const f = {
            id,
            type,
            label: type === "textarea" ? "Text Box" : type === "date" ? "Date" : type === "checkbox" ? "Checkbox" : "Text",
            page: 0,
            x: 80,
            y: 80,
            w: type === "checkbox" ? 20 : 220,
            h: type === "textarea" ? 60 : type === "checkbox" ? 20 : 28,
            fontSize: 11,
            mapping: {
                mode: "none",
                source: "",
                field: "",
                required: false,
                manualLabel: "",
                parts: [],
                separator: " ",
            },
        };
        setFields((p) => [...p, f]);
        setSelectedId(id);
    };

    const removeField = (id, type) => {
        if (type === "signature") {
            setSignatureField(null);
            if (selectedId === "signature") setSelectedId(null);
            return;
        }
        setFields((p) => p.filter((x) => x.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const updateField = (id, patch) => {
        setFields((p) => p.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    };

    const updateSignature = (patch) => {
        setSignatureField((p) => (p ? { ...p, ...patch } : p));
    };

    // Dragging fields on the PDF
    const onMouseDownField = (e, id, type) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedId(type === "signature" ? "signature" : id);

        const rect = canvasWrapRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mx = e.clientX - rect.left + (canvasWrapRef.current?.scrollLeft || 0);
        const my = e.clientY - rect.top + (canvasWrapRef.current?.scrollTop || 0);

        const target = type === "signature" ? signatureField : fields.find((f) => f.id === id);
        if (!target) return;

        setDragId(type === "signature" ? "signature" : id);
        setDragOffset({ dx: mx - target.x, dy: my - target.y });
    };

    const onMouseMoveWrap = (e) => {
        if (!dragId) return;
        const rect = canvasWrapRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mx = e.clientX - rect.left + (canvasWrapRef.current?.scrollLeft || 0);
        const my = e.clientY - rect.top + (canvasWrapRef.current?.scrollTop || 0);

        const nx = clamp(mx - dragOffset.dx, 0, pdfW - 10);
        const ny = clamp(my - dragOffset.dy, 0, pdfH - 10);

        if (dragId === "signature") {
            updateSignature({ x: nx, y: ny });
        } else {
            updateField(dragId, { x: nx, y: ny });
        }
    };

    const onMouseUpWrap = () => {
        setDragId(null);
    };

    const openContextMenu = (e, targetId, targetType) => {
        e.preventDefault();
        e.stopPropagation();

        setSelectedId(targetType === "signature" ? "signature" : targetId);

        const wrapRect = canvasWrapRef.current?.getBoundingClientRect();
        if (!wrapRect) return;

        setCtx({
            open: true,
            x: e.clientX - wrapRect.left + (canvasWrapRef.current?.scrollLeft || 0),
            y: e.clientY - wrapRect.top + (canvasWrapRef.current?.scrollTop || 0),
            targetId,
            targetType,
        });
    };

    const closeContextMenu = () => {
        setCtx({ open: false, x: 0, y: 0, targetId: null, targetType: null });
    };

    const openMapModal = (id) => {
        const target = fields.find((f) => f.id === id);
        if (!target) return;

        setMapTargetId(id);
        setMapDraft({
            label: target.label || "",
            fontSize: target.fontSize || 11,
            required: !!target.mapping?.required,
            mode: target.mapping?.mode || "none",
            source: target.mapping?.source || "",
            field: target.mapping?.field || "",
            manualLabel: target.mapping?.manualLabel || "",
        });
        setMapOpen(true);
        closeContextMenu();
    };

    const saveMapModal = () => {
        if (!mapTargetId || !mapDraft) return;

        const mode = mapDraft.mode || "none";
        const nextMapping =
            mode === "db"
                ? {
                    mode: "db",
                    source: mapDraft.source || "",
                    field: mapDraft.field || "",
                    required: !!mapDraft.required,
                    manualLabel: "",
                    parts: [],
                    separator: " ",
                }
                : mode === "manual"
                    ? {
                        mode: "manual",
                        source: "",
                        field: "",
                        required: true,
                        manualLabel: mapDraft.manualLabel || "Manual Entry",
                        parts: [],
                        separator: " ",
                    }
                    : {
                        mode: "none",
                        source: "",
                        field: "",
                        required: false,
                        manualLabel: "",
                        parts: [],
                        separator: " ",
                    };

        updateField(mapTargetId, {
            label: mapDraft.label,
            fontSize: Number(mapDraft.fontSize || 11),
            mapping: nextMapping,
        });

        setMapOpen(false);
        setMapTargetId(null);
        setMapDraft(null);
    };

    const openCombineModal = (id) => {
        const target = fields.find((f) => f.id === id);
        if (!target) return;

        const parts = Array.isArray(target.mapping?.parts) ? target.mapping.parts : [];
        setCombineTargetId(id);
        setCombineDraft({
            parts: parts.length ? parts : [],
            separator: target.mapping?.separator ?? " ",
            required: !!target.mapping?.required,
        });
        setCombineOpen(true);
        closeContextMenu();
    };

    const saveCombineModal = () => {
        if (!combineTargetId) return;

        updateField(combineTargetId, {
            mapping: {
                mode: "combine",
                source: "",
                field: "",
                required: !!combineDraft.required,
                manualLabel: "",
                parts: (combineDraft.parts || []).filter((p) => p.source && p.field),
                separator: typeof combineDraft.separator === "string" ? combineDraft.separator : " ",
            },
        });

        setCombineOpen(false);
        setCombineTargetId(null);
        setCombineDraft({ parts: [], separator: " ", required: false });
    };

    const mappingBadge = (f) => {
        const m = f?.mapping || {};
        if (f.type === "checkbox") return <Badge className="bg-slate-700/40 text-slate-200">Checkbox</Badge>;

        if (m.mode === "db" && m.source && m.field) {
            return <Badge className="bg-blue-500/10 text-blue-300">{`${m.source}.${m.field}`}</Badge>;
        }
        if (m.mode === "manual") {
            return <Badge className="bg-amber-500/10 text-amber-300">Manual</Badge>;
        }
        if (m.mode === "combine") {
            return <Badge className="bg-violet-500/10 text-violet-300">Combine</Badge>;
        }
        return <Badge className="bg-slate-700/30 text-slate-300">Unmapped</Badge>;
    };

    if (!isAdmin) {
        return <div className="p-6 text-slate-300">You do not have access to this page.</div>;
    }

    if (isLoading) return <LoadingSpinner />;

    // LIST MODE
    if (mode === "list") {
        return (
            <div className="p-4 md:p-8 max-w-6xl mx-auto">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white">PDF Templates</h1>
                        <p className="text-slate-400 mt-1">
                            Drag fields onto a PDF and map them without JSON.
                        </p>
                    </div>

                    <Button onClick={startCreate} className="bg-blue-600 hover:bg-blue-700" type="button">
                        <Plus className="h-4 w-4 mr-2" />
                        New Template
                    </Button>
                </div>

                <div className="space-y-3">
                    {sortedTemplates.map((t) => (
                        <div
                            key={t.id}
                            className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-start gap-3"
                        >
                            <div className="p-2 rounded-lg bg-slate-800">
                                <FileText className="h-4 w-4 text-slate-300" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="text-white font-medium truncate">{t.title || "Untitled"}</div>
                                <div className="text-xs text-slate-500 mt-1">
                                    Status:{" "}
                                    <span className="text-slate-300">{t.is_active !== false ? "Active" : "Disabled"}</span>
                                    {"  "}
                                    Fields:{" "}
                                    <span className="text-slate-300">{Array.isArray(t.fields) ? t.fields.length : 0}</span>
                                    {"  "}
                                    Signature:{" "}
                                    <span className="text-slate-300">{t.signature_field ? "Yes" : "No"}</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="border-slate-700"
                                    onClick={() => startEdit(t)}
                                    type="button"
                                >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-slate-700 text-red-300 hover:bg-red-500/10"
                                    onClick={() => {
                                        const ok = window.confirm(`Delete template "${t.title || "Untitled"}"?`);
                                        if (ok) deleteMut.mutate(t.id);
                                    }}
                                    disabled={deleteMut.isPending}
                                    type="button"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    ))}

                    {sortedTemplates.length === 0 && (
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                            No templates yet. Create your first template.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // CREATE / EDIT MODE (DESIGNER)
    return (
        <div className="p-0 md:p-0">
            <div className="px-4 md:px-8 pt-4 md:pt-8 pb-4 border-b border-slate-800 bg-slate-950/40">
                <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-white truncate">
                            {mode === "edit" ? "Edit PDF Template" : "Create PDF Template"}
                        </h1>
                        <p className="text-slate-400 mt-1">
                            Drag fields onto the PDF. Right-click a field to map it.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="border-slate-700" onClick={resetToList} type="button">
                            <X className="h-4 w-4 mr-2" />
                            Close
                        </Button>

                        <Button
                            onClick={() => upsertMut.mutate()}
                            disabled={upsertMut.isPending || uploading}
                            className="bg-blue-600 hover:bg-blue-700"
                            type="button"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            {upsertMut.isPending ? "Saving..." : "Save Template"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0">
                {/* LEFT SIDEBAR */}
                <div className="border-r border-slate-800 bg-slate-950/60 p-4 md:p-6">
                    <div className="space-y-4">
                        <div>
                            <Label className="text-slate-300">Title</Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white mt-1"
                                placeholder="Template title"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                className="rounded"
                            />
                            <Label className="text-white">Active</Label>
                        </div>

                        <div>
                            <Label className="text-slate-300">Upload PDF</Label>
                            <div className="mt-1 space-y-2">
                                <Input
                                    type="file"
                                    accept="application/pdf"
                                    className="bg-slate-800 border-slate-700 text-white"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) onUpload(f);
                                    }}
                                    disabled={uploading}
                                />
                                <div className="text-xs text-slate-500">
                                    {mode === "edit" && editing?.file_url && !fileMeta?.storage_path ? (
                                        <span>
                                            Using existing PDF. Upload a new PDF to replace it.
                                        </span>
                                    ) : null}
                                    {fileMeta?.file_name ? (
                                        <div className="text-slate-300 mt-1">Selected: {fileMeta.file_name}</div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                            <div className="flex items-center justify-between">
                                <div className="text-white font-semibold">Fields</div>
                                <div className="text-xs text-slate-400">{fields.length}</div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                {FIELD_TEMPLATES.map((ft) => (
                                    <Button
                                        key={ft.type}
                                        variant="outline"
                                        className="border-slate-700 text-slate-100 justify-start"
                                        onClick={() => addField(ft.type)}
                                        disabled={!pdfPageImg || (ft.type === "signature" && !!signatureField)}
                                        type="button"
                                        title={!pdfPageImg ? "Upload a PDF to place fields" : ""}
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        {ft.label}
                                    </Button>
                                ))}
                            </div>

                            {!pdfPageImg && (
                                <div className="text-xs text-slate-500 mt-3">
                                    Upload a PDF to start placing fields.
                                </div>
                            )}
                        </div>

                        <Button
                            variant="outline"
                            className="border-slate-700"
                            type="button"
                            onClick={() => setShowAdvanced((p) => !p)}
                        >
                            {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                        </Button>

                        {showAdvanced && (
                            <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40 space-y-2">
                                <div className="text-white font-semibold">Advanced</div>
                                <Label className="text-slate-300">Program IDs (optional, CSV)</Label>
                                <Input
                                    value={programIdsCsv}
                                    onChange={(e) => setProgramIdsCsv(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="programId1, programId2"
                                />
                                <p className="text-xs text-slate-500">
                                    If set, the template only applies to those programs. Leave blank to apply to all.
                                </p>
                            </div>
                        )}

                        <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                            <div className="text-white font-semibold mb-2">Selected</div>

                            {!selectedField ? (
                                <div className="text-sm text-slate-500">Click a field on the PDF.</div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="text-sm text-slate-200 font-medium">{selectedField.type === "signature" ? "Signature" : selectedField.label}</div>
                                    {selectedField.type !== "signature" ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {mappingBadge(selectedField)}
                                            {selectedField.mapping?.required ? (
                                                <Badge className="bg-amber-500/10 text-amber-300">Required</Badge>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <Badge className="bg-emerald-500/10 text-emerald-300">Required</Badge>
                                    )}

                                    <div className="text-xs text-slate-400">
                                        Position:{" "}
                                        <span className="text-slate-200">
                                            {Math.round(selectedField.x)}, {Math.round(selectedField.y)}
                                        </span>
                                    </div>

                                    <Button
                                        variant="outline"
                                        className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                                        onClick={() => removeField(selectedField.id, selectedField.type)}
                                        type="button"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Remove
                                    </Button>
                                </div>
                            )}
                        </div>

                        {upsertMut.isError && (
                            <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-3">
                                <div className="text-sm text-red-200 font-semibold">Save failed</div>
                                <div className="text-xs text-red-200 mt-1">{String(upsertMut.error?.message || upsertMut.error)}</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: PDF DESIGNER */}
                <div className="p-4 md:p-6">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-3 md:p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="text-white font-semibold flex items-center gap-2">
                                <MousePointer2 className="h-4 w-4" />
                                PDF Designer (page 1 preview)
                            </div>
                            <div className="text-xs text-slate-500">
                                Tip: Right-click a field to map it
                            </div>
                        </div>

                        {pdfError ? (
                            <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-4 text-red-200 text-sm">
                                {pdfError}
                            </div>
                        ) : null}

                        {pdfLoading && (
                            <div className="py-10 text-center text-slate-300">
                                Rendering PDF preview...
                            </div>
                        )}

                        {!pdfLoading && pdfPageImg && (
                            <div
                                ref={canvasWrapRef}
                                className="relative w-full overflow-auto rounded-xl border border-slate-800 bg-slate-950"
                                style={{ maxHeight: "78vh" }}
                                onMouseMove={onMouseMoveWrap}
                                onMouseUp={onMouseUpWrap}
                                onMouseLeave={onMouseUpWrap}
                                onMouseDown={() => {
                                    setSelectedId(null);
                                    closeContextMenu();
                                }}
                                onContextMenu={(e) => {
                                    // prevent native context menu inside designer
                                    e.preventDefault();
                                }}
                            >
                                {/* Hidden render canvas (we snapshot it to img) */}
                                <canvas ref={canvasRef} className="hidden" />

                                {/* PDF preview image */}
                                <img
                                    src={pdfPageImg.dataUrl}
                                    alt="pdf-preview"
                                    draggable={false}
                                    className="block"
                                    style={{ width: pdfPageImg.width, height: pdfPageImg.height }}
                                />

                                {/* Overlays */}
                                <div
                                    className="absolute left-0 top-0"
                                    style={{ width: pdfPageImg.width, height: pdfPageImg.height }}
                                >
                                    {/* Field overlays */}
                                    {fields.map((f) => {
                                        const isSel = selectedId === f.id;
                                        return (
                                            <div
                                                key={f.id}
                                                className={`absolute rounded-md border ${isSel ? "border-blue-400" : "border-slate-400/60"
                                                    } bg-white/10`}
                                                style={{
                                                    left: f.x,
                                                    top: f.y,
                                                    width: f.w,
                                                    height: f.h,
                                                    cursor: "move",
                                                }}
                                                onMouseDown={(e) => onMouseDownField(e, f.id, "field")}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedId(f.id);
                                                    closeContextMenu();
                                                }}
                                                onContextMenu={(e) => openContextMenu(e, f.id, "field")}
                                            >
                                                <div className="px-2 py-1 text-[11px] text-black bg-white/80 rounded-t-md border-b border-slate-300/50">
                                                    {f.label}
                                                </div>
                                                <div className="px-2 py-1 text-[10px] text-black">
                                                    {f.mapping?.mode === "db" && f.mapping?.source && f.mapping?.field
                                                        ? `${f.mapping.source}.${f.mapping.field}`
                                                        : f.mapping?.mode === "manual"
                                                            ? "Manual"
                                                            : f.mapping?.mode === "combine"
                                                                ? "Combine"
                                                                : "Unmapped"}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Signature overlay */}
                                    {signatureField ? (
                                        <div
                                            className={`absolute rounded-md border ${selectedId === "signature" ? "border-emerald-400" : "border-slate-400/60"
                                                } bg-white/10`}
                                            style={{
                                                left: signatureField.x,
                                                top: signatureField.y,
                                                width: signatureField.w,
                                                height: signatureField.h,
                                                cursor: "move",
                                            }}
                                            onMouseDown={(e) => onMouseDownField(e, "signature", "signature")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedId("signature");
                                                closeContextMenu();
                                            }}
                                            onContextMenu={(e) => openContextMenu(e, "signature", "signature")}
                                        >
                                            <div className="px-2 py-1 text-[11px] text-black bg-white/80 rounded-t-md border-b border-slate-300/50">
                                                Signature (required)
                                            </div>
                                            <div className="px-2 py-1 text-[10px] text-black">Participant signature</div>
                                        </div>
                                    ) : null}

                                    {/* Context menu */}
                                    {ctx.open ? (
                                        <div
                                            className="absolute z-50 bg-slate-950 border border-slate-700 rounded-lg shadow-xl overflow-hidden"
                                            style={{ left: ctx.x, top: ctx.y, minWidth: 220 }}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            {ctx.targetType === "field" ? (
                                                <>
                                                    <button
                                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-800"
                                                        onClick={() => openMapModal(ctx.targetId)}
                                                        type="button"
                                                    >
                                                        Map (DB or Manual)
                                                    </button>
                                                    <button
                                                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-800"
                                                        onClick={() => openCombineModal(ctx.targetId)}
                                                        type="button"
                                                    >
                                                        Combine multiple DB fields
                                                    </button>
                                                    <button
                                                        className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                                                        onClick={() => {
                                                            removeField(ctx.targetId, "field");
                                                            closeContextMenu();
                                                        }}
                                                        type="button"
                                                    >
                                                        Delete field
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                                                        onClick={() => {
                                                            removeField("signature", "signature");
                                                            closeContextMenu();
                                                        }}
                                                        type="button"
                                                    >
                                                        Delete signature
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}

                        {!pdfLoading && !pdfPageImg && (
                            <div className="py-12 text-center text-slate-400">
                                Upload a PDF to see the preview and place fields.
                            </div>
                        )}
                    </div>

                    {/* Mapping modal */}
                    {mapOpen && mapDraft ? (
                        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
                            <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-2xl p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-white font-semibold">Map Field</div>
                                        <div className="text-xs text-slate-400 mt-1">
                                            Choose DB field, or set as a required manual entry field.
                                        </div>
                                    </div>
                                    <Button variant="outline" className="border-slate-700" onClick={() => setMapOpen(false)} type="button">
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="mt-4 space-y-4">
                                    <div>
                                        <Label className="text-slate-300">Label</Label>
                                        <Input
                                            value={mapDraft.label}
                                            onChange={(e) => setMapDraft((p) => ({ ...p, label: e.target.value }))}
                                            className="bg-slate-800 border-slate-700 text-white mt-1"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-slate-300">Font size</Label>
                                            <Input
                                                type="number"
                                                value={mapDraft.fontSize}
                                                onChange={(e) => setMapDraft((p) => ({ ...p, fontSize: e.target.value }))}
                                                className="bg-slate-800 border-slate-700 text-white mt-1"
                                            />
                                        </div>

                                        <div className="flex items-center gap-2 mt-6">
                                            <input
                                                type="checkbox"
                                                checked={!!mapDraft.required}
                                                onChange={(e) => setMapDraft((p) => ({ ...p, required: e.target.checked }))}
                                                className="rounded"
                                                disabled={mapDraft.mode === "manual"}
                                            />
                                            <Label className="text-white">Required</Label>
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Mapping type</Label>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {[
                                                { v: "none", label: "Unmapped" },
                                                { v: "db", label: "Map to DB field" },
                                                { v: "manual", label: "Manual entry (required)" },
                                            ].map((opt) => (
                                                <Button
                                                    key={opt.v}
                                                    type="button"
                                                    variant="outline"
                                                    className={`border-slate-700 ${mapDraft.mode === opt.v ? "bg-slate-800 text-white" : "text-slate-200"
                                                        }`}
                                                    onClick={() =>
                                                        setMapDraft((p) => ({
                                                            ...p,
                                                            mode: opt.v,
                                                            // Make source blank by default (per your requirement)
                                                            source: opt.v === "db" ? "" : "",
                                                            field: opt.v === "db" ? "" : "",
                                                        }))
                                                    }
                                                >
                                                    {opt.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    {mapDraft.mode === "db" ? (
                                        <div className="space-y-3">
                                            <div>
                                                <Label className="text-slate-300">Source</Label>
                                                <select
                                                    value={mapDraft.source}
                                                    onChange={(e) => setMapDraft((p) => ({ ...p, source: e.target.value, field: "" }))}
                                                    className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2"
                                                >
                                                    <option value="">Select source</option>
                                                    <option value="participant">Participant</option>
                                                    <option value="workflow_request">Workflow Request</option>
                                                    <option value="caseworker">Caseworker</option>
                                                </select>
                                            </div>

                                            <div>
                                                <Label className="text-slate-300">Field</Label>
                                                <select
                                                    value={mapDraft.field}
                                                    onChange={(e) => setMapDraft((p) => ({ ...p, field: e.target.value }))}
                                                    className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2"
                                                    disabled={!mapDraft.source}
                                                >
                                                    <option value="">Select field</option>
                                                    {(FIELD_CATALOG[mapDraft.source] || []).map((f) => (
                                                        <option key={f.key} value={f.key}>
                                                            {f.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    If the exact field is not listed yet, add it to FIELD_CATALOG in this file.
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {mapDraft.mode === "manual" ? (
                                        <div className="space-y-2">
                                            <Label className="text-slate-300">Manual field prompt</Label>
                                            <Input
                                                value={mapDraft.manualLabel}
                                                onChange={(e) => setMapDraft((p) => ({ ...p, manualLabel: e.target.value }))}
                                                className="bg-slate-800 border-slate-700 text-white mt-1"
                                                placeholder="e.g., Emergency Contact Name"
                                            />
                                            <div className="text-xs text-slate-500">
                                                Manual fields are required and must be filled by the caseworker before submission.
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="outline" className="border-slate-700" onClick={() => setMapOpen(false)} type="button">
                                            Cancel
                                        </Button>
                                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={saveMapModal} type="button">
                                            Save Mapping
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* Combine modal */}
                    {combineOpen ? (
                        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
                            <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-white font-semibold">Combine DB Fields</div>
                                        <div className="text-xs text-slate-400 mt-1">
                                            Example: First Name + Last Name with separator " ".
                                        </div>
                                    </div>
                                    <Button variant="outline" className="border-slate-700" onClick={() => setCombineOpen(false)} type="button">
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="mt-4 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={!!combineDraft.required}
                                            onChange={(e) => setCombineDraft((p) => ({ ...p, required: e.target.checked }))}
                                            className="rounded"
                                        />
                                        <Label className="text-white">Required</Label>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Separator</Label>
                                        <Input
                                            value={combineDraft.separator}
                                            onChange={(e) => setCombineDraft((p) => ({ ...p, separator: e.target.value }))}
                                            className="bg-slate-800 border-slate-700 text-white mt-1"
                                            placeholder=" "
                                        />
                                    </div>

                                    <div className="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
                                        <div className="text-white font-semibold mb-2">Parts</div>

                                        <div className="space-y-2">
                                            {(combineDraft.parts || []).map((p, idx) => (
                                                <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                                                    <div>
                                                        <Label className="text-slate-300">Source</Label>
                                                        <select
                                                            value={p.source || ""}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                setCombineDraft((prev) => {
                                                                    const next = [...(prev.parts || [])];
                                                                    next[idx] = { source: v, field: "" };
                                                                    return { ...prev, parts: next };
                                                                });
                                                            }}
                                                            className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2"
                                                        >
                                                            <option value="">Select source</option>
                                                            <option value="participant">Participant</option>
                                                            <option value="workflow_request">Workflow Request</option>
                                                            <option value="caseworker">Caseworker</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <Label className="text-slate-300">Field</Label>
                                                        <select
                                                            value={p.field || ""}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                setCombineDraft((prev) => {
                                                                    const next = [...(prev.parts || [])];
                                                                    next[idx] = { ...next[idx], field: v };
                                                                    return { ...prev, parts: next };
                                                                });
                                                            }}
                                                            className="w-full mt-1 bg-slate-800 border border-slate-700 text-white rounded-md px-3 py-2"
                                                            disabled={!p.source}
                                                        >
                                                            <option value="">Select field</option>
                                                            {(FIELD_CATALOG[p.source] || []).map((f) => (
                                                                <option key={f.key} value={f.key}>
                                                                    {f.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <Button
                                                        variant="outline"
                                                        className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                                                        onClick={() => {
                                                            setCombineDraft((prev) => {
                                                                const next = (prev.parts || []).filter((_, i) => i !== idx);
                                                                return { ...prev, parts: next };
                                                            });
                                                        }}
                                                        type="button"
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-3">
                                            <Button
                                                variant="outline"
                                                className="border-slate-700"
                                                onClick={() =>
                                                    setCombineDraft((p) => ({
                                                        ...p,
                                                        parts: [...(p.parts || []), { source: "", field: "" }],
                                                    }))
                                                }
                                                type="button"
                                            >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Add Part
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button variant="outline" className="border-slate-700" onClick={() => setCombineOpen(false)} type="button">
                                            Cancel
                                        </Button>
                                        <Button className="bg-violet-600 hover:bg-violet-700" onClick={saveCombineModal} type="button">
                                            Save Combine Mapping
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
