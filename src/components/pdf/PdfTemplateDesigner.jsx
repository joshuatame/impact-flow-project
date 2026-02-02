// src/components/pdf/PdfTemplateDesigner.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { pdfjsLib } from "@/components/pdf/PdfJs";
import PdfPageCanvas from "@/components/pdf/PdfPageCanvas.jsx";
import FieldPalette from "@/components/pdf/FieldPalette.jsx";
import FieldPropertiesPanel from "@/components/pdf/FieldPropertiesPanel.jsx";
import DesignerContextMenu from "@/components/pdf/DesignerContextMenu.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rnd } from "react-rnd";
import { WORKFLOW_EVENT_TYPES } from "@/pdf/fieldDictionary";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Save, ZoomIn, ZoomOut, Move, Target } from "lucide-react";

function uid() {
    return `fld_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function defaultRectByType(type) {
    if (type === "signature") return { w: 0.35, h: 0.10 };
    if (type === "textarea") return { w: 0.45, h: 0.16 };
    if (type === "checkbox") return { w: 0.06, h: 0.06 };
    if (type === "date") return { w: 0.20, h: 0.06 };
    return { w: 0.30, h: 0.06 };
}

function typeToLabel(type) {
    if (type === "textarea") return "Text Box";
    if (type === "checkbox") return "Checkbox";
    if (type === "date") return "Date";
    if (type === "signature") return "Signature";
    return "Text";
}

function isFieldMapped(field) {
    const m = field?.mapping;
    if (!m) return false;
    if (m.mode === "manual") return !!m.manualKey;
    if (m.mode === "signature") return true;
    if (m.mode === "db") return !!m.source && (!!m.field || (Array.isArray(m.fields) && m.fields.length > 0));
    return false;
}

// Robust loader: always prefer arrayBuffer data so pdf.js does not rely on range requests.
// This helps with Firebase URLs and signed URLs.
async function loadPdfDocument(filePreviewUrl) {
    if (!filePreviewUrl) return null;

    // If it's already a blob URL, fetching is safe.
    // If it's http(s), fetching avoids CORS/range issues in pdf.js direct url load.
    const res = await fetch(filePreviewUrl);
    if (!res.ok) throw new Error(`Failed to load PDF (${res.status})`);
    const ab = await res.arrayBuffer();

    const task = pdfjsLib.getDocument({ data: ab });
    const doc = await task.promise;
    return doc;
}

export default function PdfTemplateDesigner({
    filePreviewUrl,
    initialTemplateTitle,
    initialEventType,
    initialFields,
    onSave,
    onCancel,
    saving,
    programs = [],
    initialProgramIds = [],
}) {
    const [pdf, setPdf] = useState(null);
    const [pageCount, setPageCount] = useState(0);
    const [pdfError, setPdfError] = useState("");

    const [scale, setScale] = useState(1); // auto-fit
    const [templateTitle, setTemplateTitle] = useState(initialTemplateTitle || "");
    const [eventType, setEventType] = useState(initialEventType || "NEW_PARTICIPANT_REQUEST");
    const [programIds, setProgramIds] = useState(Array.isArray(initialProgramIds) ? initialProgramIds : []);

    const [fields, setFields] = useState(Array.isArray(initialFields) ? initialFields : []);
    const [selectedFieldId, setSelectedFieldId] = useState(null);

    const selectedField = useMemo(
        () => fields.find((f) => f.id === selectedFieldId) || null,
        [fields, selectedFieldId]
    );

    const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0, fieldId: null });

    // container sizes
    const pagesWrapRef = useRef(null);
    const pageMetaRef = useRef({}); // pageIndex -> { widthPx, heightPx }

    const unmappedCount = useMemo(() => fields.filter((f) => !isFieldMapped(f)).length, [fields]);

    // IMPORTANT: Re-hydrate when editing changes template props.
    useEffect(() => {
        setTemplateTitle(initialTemplateTitle || "");
    }, [initialTemplateTitle]);

    useEffect(() => {
        setEventType(initialEventType || "NEW_PARTICIPANT_REQUEST");
    }, [initialEventType]);

    useEffect(() => {
        setProgramIds(Array.isArray(initialProgramIds) ? initialProgramIds : []);
    }, [initialProgramIds]);

    useEffect(() => {
        setFields(Array.isArray(initialFields) ? initialFields : []);
        setSelectedFieldId(null);
    }, [initialFields]);

    // Load PDF on URL change
    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!filePreviewUrl) return;
            setPdfError("");

            try {
                const doc = await loadPdfDocument(filePreviewUrl);
                if (cancelled) return;
                setPdf(doc);
                setPageCount(doc.numPages);
            } catch (e) {
                if (!cancelled) {
                    setPdf(null);
                    setPageCount(0);
                    setPdfError(String(e?.message || "Failed to load PDF."));
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [filePreviewUrl]);

    const fitToWidth = async () => {
        if (!pdf) return;
        const wrap = pagesWrapRef.current;
        if (!wrap) return;

        // Use page 1 at scale 1 to compute fit.
        const page = await pdf.getPage(1);
        const rotation = page.rotate || 0;
        const viewport = page.getViewport({ scale: 1, rotation });

        const pad = 24;
        const avail = Math.max(320, wrap.clientWidth - pad);
        const nextScale = avail / viewport.width;

        const clamped = Math.max(0.5, Math.min(2.0, nextScale));
        setScale(Number(clamped.toFixed(3)));
    };

    // Auto fit once pdf loads
    useEffect(() => {
        if (!pdf) return;
        fitToWidth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdf]);

    // Refit on window resize
    useEffect(() => {
        const onResize = () => {
            if (!pdf) return;
            fitToWidth();
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdf]);

    const addField = (type) => {
        const rect = defaultRectByType(type);
        const f = {
            id: uid(),
            type,
            page: 0,
            rect: { x: 0.10, y: 0.12, w: rect.w, h: rect.h },
            display: {
                label: `Unmapped ${typeToLabel(type)}`,
                fontSize: 11,
                color: "#000000", // ensures backend can default to black if it respects this
            },
            mapping: null,
        };
        setFields((p) => [...p, f]);
        setSelectedFieldId(f.id);
    };

    const updateField = (nextField) => {
        setFields((p) => p.map((f) => (f.id === nextField.id ? nextField : f)));
    };

    const deleteField = (field) => {
        setFields((p) => p.filter((x) => x.id !== field.id));
        if (selectedFieldId === field.id) setSelectedFieldId(null);
    };

    const onPageSize = ({ width, height, pageIndex }) => {
        pageMetaRef.current[pageIndex] = { widthPx: width, heightPx: height };
    };

    const savePayload = () => {
        onSave?.({
            title: templateTitle,
            criteria: {
                events: [eventType],
                program_ids: programIds,
            },
            designer_fields: fields,
        });
    };

    if (!filePreviewUrl) {
        return <div className="text-slate-300">Upload a PDF to start designing.</div>;
    }

    if (pdfError) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-300 text-sm">
                {pdfError}
                <div className="text-slate-400 mt-2">
                    If this happens in Edit mode, the stored file_url is not browser-fetchable. The fix is to store a stable
                    download URL and ensure Storage CORS allows GET.
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-12 gap-4">
            {/* LEFT: Palette + Settings */}
            <div className="col-span-12 lg:col-span-3">
                <Card className="bg-slate-950/40 border-slate-800 p-4 space-y-4 sticky top-4">
                    <div className="space-y-3">
                        <div className="text-sm text-slate-200 font-semibold">Template settings</div>

                        <div>
                            <Label className="text-slate-300">Template name</Label>
                            <Input
                                className="bg-slate-900 border-slate-800 text-white mt-1"
                                value={templateTitle}
                                onChange={(e) => setTemplateTitle(e.target.value)}
                                placeholder="e.g., Consent Form"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Form type</Label>
                            <Select value={eventType} onValueChange={(v) => setEventType(v)}>
                                <SelectTrigger className="bg-slate-900 border-slate-800 text-white mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                    {WORKFLOW_EVENT_TYPES.map((t) => (
                                        <SelectItem key={t.value} value={t.value} className="text-white">
                                            {t.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-slate-500 mt-2">
                                This controls which database fields show in mapping.
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300">Limit to programs (optional)</Label>
                            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto rounded-lg border border-slate-800 p-2 bg-slate-950/30">
                                {programs.length === 0 ? (
                                    <div className="text-xs text-slate-500">No programs loaded.</div>
                                ) : (
                                    programs.map((p) => (
                                        <label key={p.id} className="flex items-center gap-2 text-sm text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={programIds.includes(p.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setProgramIds((prev) => [...prev, p.id]);
                                                    else setProgramIds((prev) => prev.filter((x) => x !== p.id));
                                                }}
                                                className="rounded"
                                            />
                                            <span className="truncate">{p.program_name || p.id}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            <div className="text-xs text-slate-500 mt-2">
                                Leave blank if the template applies to all programs.
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="text-xs text-slate-500">
                                Fields: <span className="text-slate-200">{fields.length}</span>
                            </div>
                            <Badge className={unmappedCount === 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}>
                                {unmappedCount === 0 ? "Ready" : `${unmappedCount} unmapped`}
                            </Badge>
                        </div>
                    </div>

                    <div className="border-t border-slate-800 pt-4">
                        <FieldPalette onAdd={addField} />
                    </div>

                    <div className="border-t border-slate-800 pt-4 space-y-2">
                        <div className="text-sm text-slate-200 font-semibold">View controls</div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-800 w-1/2"
                                onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.1).toFixed(2))))}
                            >
                                <ZoomOut className="h-4 w-4 mr-2" />
                                Zoom out
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-800 w-1/2"
                                onClick={() => setScale((s) => Math.min(2.0, Number((s + 0.1).toFixed(2))))}
                            >
                                <ZoomIn className="h-4 w-4 mr-2" />
                                Zoom in
                            </Button>
                        </div>

                        <Button type="button" variant="outline" className="border-slate-800 w-full" onClick={fitToWidth} disabled={!pdf}>
                            <Target className="h-4 w-4 mr-2" />
                            Fit to width
                        </Button>

                        <div className="text-xs text-slate-500">
                            Drag fields to position. Resize corners to fit.
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <Button type="button" variant="outline" className="border-slate-800 w-1/2" onClick={() => onCancel?.()} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="bg-blue-600 hover:bg-blue-700 w-1/2"
                            onClick={savePayload}
                            disabled={saving || !templateTitle.trim()}
                        >
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </Card>
            </div>

            {/* CENTER: PDF pages - scrollable */}
            <div className="col-span-12 lg:col-span-6">
                <Card className="bg-slate-950/40 border-slate-800 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-slate-200 font-semibold flex items-center gap-2">
                            <Move className="h-4 w-4" />
                            PDF preview (drag fields onto the page)
                        </div>
                        <div className="text-xs text-slate-500">Scale: {Math.round(scale * 100)}%</div>
                    </div>

                    <div ref={pagesWrapRef} className="max-h-[72vh] overflow-y-auto pr-2 space-y-6">
                        {Array.from({ length: pageCount }).map((_, pageIndex) => {
                            const pageFields = fields.filter((f) => f.page === pageIndex);

                            return (
                                <div key={`page_${pageIndex}`} className="relative" onMouseDown={() => setSelectedFieldId(null)}>
                                    <div className="text-xs text-slate-500 mb-2">
                                        Page {pageIndex + 1} of {pageCount}
                                    </div>

                                    <div className="relative">
                                        <PdfPageCanvas
                                            pdf={pdf}
                                            pageIndex={pageIndex}
                                            scale={scale}
                                            onSize={onPageSize}
                                        />

                                        {/* Overlay */}
                                        <div className="absolute inset-0">
                                            {pageFields.map((f) => {
                                                const meta = pageMetaRef.current[pageIndex];
                                                const wPx = meta?.widthPx || 1;
                                                const hPx = meta?.heightPx || 1;

                                                const xPx = f.rect.x * wPx;
                                                const yPx = f.rect.y * hPx;
                                                const wwPx = f.rect.w * wPx;
                                                const hhPx = f.rect.h * hPx;

                                                const selected = f.id === selectedFieldId;
                                                const mapped = isFieldMapped(f);

                                                return (
                                                    <Rnd
                                                        key={f.id}
                                                        size={{ width: wwPx, height: hhPx }}
                                                        position={{ x: xPx, y: yPx }}
                                                        bounds="parent"
                                                        onDragStop={(e, d) => {
                                                            updateField({ ...f, rect: { ...f.rect, x: d.x / wPx, y: d.y / hPx } });
                                                        }}
                                                        onResizeStop={(e, dir, ref, delta, pos) => {
                                                            updateField({
                                                                ...f,
                                                                rect: {
                                                                    x: pos.x / wPx,
                                                                    y: pos.y / hPx,
                                                                    w: ref.offsetWidth / wPx,
                                                                    h: ref.offsetHeight / hPx,
                                                                },
                                                            });
                                                        }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedFieldId(f.id);
                                                        }}
                                                        onContextMenu={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setSelectedFieldId(f.id);
                                                            setCtxMenu({ open: true, x: e.clientX, y: e.clientY, fieldId: f.id });
                                                        }}
                                                    >
                                                        <div
                                                            className={[
                                                                "w-full h-full rounded-md border text-xs flex items-center justify-center px-2 select-none",
                                                                selected ? "border-blue-400 bg-blue-500/10" : "border-slate-700 bg-slate-950/40",
                                                            ].join(" ")}
                                                        >
                                                            <div className="min-w-0 truncate text-slate-200">
                                                                {f.display?.label || typeToLabel(f.type)}
                                                            </div>
                                                            <div className="ml-2">
                                                                <span className={mapped ? "text-emerald-300" : "text-red-300"}>
                                                                    {mapped ? "•" : "!"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </Rnd>
                                                );
                                            })}
                                        </div>

                                        <DesignerContextMenu
                                            open={ctxMenu.open}
                                            x={ctxMenu.x}
                                            y={ctxMenu.y}
                                            onClose={() => setCtxMenu({ open: false, x: 0, y: 0, fieldId: null })}
                                            items={[
                                                {
                                                    key: "map",
                                                    label: "Map field",
                                                    onClick: () => setSelectedFieldId(ctxMenu.fieldId),
                                                },
                                                {
                                                    key: "delete",
                                                    label: "Delete",
                                                    onClick: () => {
                                                        const src = fields.find((x) => x.id === ctxMenu.fieldId);
                                                        if (src) deleteField(src);
                                                    },
                                                },
                                            ]}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            {/* RIGHT: Mapping panel */}
            <div className="col-span-12 lg:col-span-3">
                <Card className="bg-slate-950/40 border-slate-800 p-4 sticky top-4">
                    <div className="text-sm text-slate-200 font-semibold mb-3">Mapping</div>
                    <FieldPropertiesPanel
                        eventType={eventType}
                        field={selectedField}
                        onChange={(f) => updateField(f)}
                        onDelete={(f) => deleteField(f)}
                    />
                </Card>
            </div>
        </div>
    );
}
