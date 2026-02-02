
// src/pages/DocumentDesigner.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { jsPDF } from "jspdf";
import { Stage, Layer, Rect, Text as KText, Image as KImage, Transformer, Group, Line } from "react-konva";

import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
    Plus,
    Save,
    FileDown,
    Trash2,
    Share2,
    Image as ImageIcon,
    Copy,
    Lock,
    Unlock,
    ChevronUp,
    ChevronDown,
    Scissors,
    Layers,
    FilePlus2,
    PanelRightClose,
    PanelRightOpen,
    BringToFront,
    SendToBack,
    Bold,
    Italic,
    Underline,
    Palette,
    FolderCheck,
    AlignCenter,
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";

import { db } from "@/firebase";
import {
    addDoc,
    collection,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    where,
    getDocs,
} from "firebase/firestore";

/**
 * Dependencies:
 * - npm i react-konva konva jspdf
 */

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function uuid() {
    return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function toNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
    const x = Number.isFinite(n) ? n : min;
    return Math.max(min, Math.min(max, x));
}

function snapVal(n, grid = 4) {
    return Math.round(n / grid) * grid;
}

function parsePercentOrNull(v) {
    if (v === "" || v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return clamp(Math.round(n), 1, 100);
}

function percentToOpacity(pctOrNull) {
    if (pctOrNull == null) return 1;
    return clamp(pctOrNull / 100, 0.01, 1);
}

function percentToBlurPx(pctOrNull) {
    if (pctOrNull == null) return 0;
    return (pctOrNull / 100) * 30;
}

function percentToBrightness(pctOrNull) {
    if (pctOrNull == null) return 0;
    const pct = clamp(pctOrNull, 1, 100);
    return clamp((pct - 50) / 50, -1, 1);
}

function openPrintPdfWindow(title, htmlBody, cssPage) {
    const w = window.open("", "_blank");
    if (!w) {
        alert("Popup blocked. Please allow popups.");
        return;
    }

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    ${cssPage || ""}
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; margin: 0; padding: 0; color: #111827; background:#fff; }
    .btn { position: fixed; right: 16px; top: 16px; background: #111827; color: #fff; border: none; padding: 10px 14px; border-radius: 10px; cursor: pointer; z-index: 100; }
    @media print { .btn { display: none; } }
    .wrap { padding: 24px; }
    @media print { .wrap { padding: 0; } }
    h1 { margin: 0 0 10px 0; padding: 24px 24px 0 24px; }
    .muted { color:#6b7280; font-size: 12px; margin-bottom: 14px; padding: 0 24px; }
    @media print { h1, .muted { padding: 0; } }
    .page { width: 100%; display: block; }
    .page img { width: 100%; height: auto; display: block; }
    .pageBreak { page-break-after: always; break-after: page; }
  </style>
</head>
<body>
  <button class="btn" onclick="window.print()">Save as PDF</button>
  <div class="wrap">${htmlBody}</div>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
}

const PAGE_PRESETS = {
    a4p: { name: "A4 Portrait", w: 794, h: 1123, css: "@page{size:A4 portrait;margin:0;}" },
    a4l: { name: "A4 Landscape", w: 1123, h: 794, css: "@page{size:A4 landscape;margin:0;}" },
};

function getPageSize(page) {
    const preset = PAGE_PRESETS[page?.preset] || PAGE_PRESETS.a4p;
    return { w: preset.w, h: preset.h };
}

function getPageCss(page) {
    const preset = PAGE_PRESETS[page?.preset] || PAGE_PRESETS.a4p;
    return preset.css;
}

function useHtmlImage(url) {
    const [img, setImg] = useState(null);
    useEffect(() => {
        if (!url) {
            setImg(null);
            return;
        }
        let mounted = true;
        const image = new window.Image();
        image.crossOrigin = "anonymous";
        image.onload = () => mounted && setImg(image);
        image.onerror = () => mounted && setImg(null);
        image.src = url;
        return () => {
            mounted = false;
        };
    }, [url]);
    return img;
}

function normToPxCrop(cropNorm, imgW, imgH) {
    if (!cropNorm || !imgW || !imgH) return null;
    const x = clamp(cropNorm.x, 0, 1) * imgW;
    const y = clamp(cropNorm.y, 0, 1) * imgH;
    const width = clamp(cropNorm.w, 0, 1) * imgW;
    const height = clamp(cropNorm.h, 0, 1) * imgH;
    if (!width || !height) return null;
    return { x, y, width, height };
}

function computeCoverCropNorm(imgW, imgH, boxW, boxH) {
    if (!imgW || !imgH || !boxW || !boxH) return { x: 0, y: 0, w: 1, h: 1 };
    const imgAR = imgW / imgH;
    const boxAR = boxW / boxH;

    if (imgAR > boxAR) {
        const cropH = imgH;
        const cropW = cropH * boxAR;
        const x = (imgW - cropW) / 2;
        return { x: x / imgW, y: 0, w: cropW / imgW, h: 1 };
    }

    const cropW = imgW;
    const cropH = cropW / boxAR;
    const y = (imgH - cropH) / 2;
    return { x: 0, y: y / imgH, w: 1, h: cropH / imgH };
}

function computeContainCropNorm() {
    return { x: 0, y: 0, w: 1, h: 1 };
}

function clampCropNorm(c) {
    const x = clamp(c.x, 0, 1);
    const y = clamp(c.y, 0, 1);
    const w = clamp(c.w, 0, 1 - x);
    const h = clamp(c.h, 0, 1 - y);
    return { x, y, w, h };
}

function raf() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function getElementBounds(el) {
    return {
        left: el.x,
        top: el.y,
        right: el.x + el.w,
        bottom: el.y + el.h,
        cx: el.x + el.w / 2,
        cy: el.y + el.h / 2,
    };
}

function selectionBounds(elements) {
    if (!elements.length) return null;
    const b0 = getElementBounds(elements[0]);
    let left = b0.left;
    let top = b0.top;
    let right = b0.right;
    let bottom = b0.bottom;

    for (const el of elements.slice(1)) {
        const b = getElementBounds(el);
        left = Math.min(left, b.left);
        top = Math.min(top, b.top);
        right = Math.max(right, b.right);
        bottom = Math.max(bottom, b.bottom);
    }

    return { left, top, right, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
}

function dist(a, b) {
    return Math.abs(a - b);
}

function pickBestSnap(value, candidates, tolerance) {
    let best = null;
    for (const c of candidates) {
        const d = dist(value, c);
        if (d <= tolerance && (best == null || d < best.d)) best = { target: c, d };
    }
    return best;
}

function normalizeStory(raw) {
    const title = raw?.title || raw?.story_title || "Good News Story";
    const story_content = raw?.story_content || raw?.story || raw?.content || "";
    const story_date = raw?.story_date || raw?.created_date || raw?.date || null;
    const category = raw?.category || "Good News";
    const photo_urls =
        raw?.photo_urls ||
        (Array.isArray(raw?.photos) ? raw.photos.map((p) => p?.url).filter(Boolean) : []) ||
        [];
    return { ...raw, title, story_content, story_date, category, photo_urls };
}

const DEFAULT_PAGE = {
    preset: "a4p",
    margin: 40,
    background: {
        color: "#ffffff",
        imageUrl: "",
        fitMode: "cover", // cover | contain | stretch | tile | manual
        cropNorm: null,
        opacityPct: null,
        blurPct: null,
        brightnessPct: null,
    },
};

function makeNewPage(title = "Page") {
    return {
        id: uuid(),
        title,
        page: structuredClone(DEFAULT_PAGE),
        elements: [],
    };
}

function makeDefaultDoc() {
    return {
        docTitle: "New Document",
        pages: [makeNewPage("Page 1")],
    };
}

function makeTextElement({ x, y, w, h, text }) {
    return {
        id: uuid(),
        type: "text",
        x,
        y,
        w,
        h,
        rotation: 0,
        locked: false,
        text: safeText(text || "Double-click to edit"),
        fontSize: 20,
        fontFamily: "Arial",
        fill: "#111827",
        align: "left",
        verticalAlign: "top",
        bold: false,
        italic: false,
        underline: false,
        letterSpacing: 0,
        lineHeight: 1.25,
    };
}

function makeImageElement({ x, y, w, h, url, fitMode = "cover", asBackgroundBlock = false }) {
    return {
        id: uuid(),
        type: asBackgroundBlock ? "bg_image" : "image",
        x,
        y,
        w,
        h,
        rotation: 0,
        locked: false,
        url: safeText(url || ""),
        fitMode,
        cropNorm: null,
        opacityPct: null,
        blurPct: null,
        brightnessPct: null,
    };
}

function makeDividerElement({ x, y, w }) {
    return {
        id: uuid(),
        type: "divider",
        x,
        y,
        w,
        h: 2,
        rotation: 0,
        locked: false,
        stroke: "#e5e7eb",
    };
}

function makeStoryCardElement(story) {
    const title = safeText(story?.title);
    const category = safeText(story?.category);
    const date = story?.story_date ? new Date(story.story_date).toLocaleDateString() : "";
    const content = safeText(story?.story_content);

    const body = [
        title ? `• ${title}` : "",
        category || date ? `  ${[category, date].filter(Boolean).join(" • ")}` : "",
        "",
        content,
    ]
        .filter((l) => l !== "")
        .join("\n");

    const el = makeTextElement({ x: 80, y: 160, w: 520, h: 320, text: body });
    return { ...el, fontSize: 16, lineHeight: 1.35 };
}

function reorder(array, from, to) {
    const next = [...array];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

function CropEditorDialog({ open, onOpenChange, imageUrl, initialCropNorm, onApply }) {
    const img = useHtmlImage(imageUrl);

    const stageRef = useRef(null);
    const trRef = useRef(null);
    const cropRef = useRef(null);

    const [cropBox, setCropBox] = useState({ x: 40, y: 40, w: 200, h: 200 });

    const viewW = 820;
    const viewH = 560;
    const pad = 24;

    const layout = useMemo(() => {
        if (!img) return null;

        const maxW = viewW - pad * 2;
        const maxH = viewH - pad * 2;

        const s = Math.min(maxW / img.width, maxH / img.height);
        const drawW = img.width * s;
        const drawH = img.height * s;
        const x = (viewW - drawW) / 2;
        const y = (viewH - drawH) / 2;

        return { s, x, y, drawW, drawH };
    }, [img]);

    useEffect(() => {
        if (!open) return;
        if (!img || !layout) return;

        const existing = initialCropNorm
            ? {
                x: layout.x + initialCropNorm.x * layout.drawW,
                y: layout.y + initialCropNorm.y * layout.drawH,
                w: initialCropNorm.w * layout.drawW,
                h: initialCropNorm.h * layout.drawH,
            }
            : {
                x: layout.x + layout.drawW * 0.1,
                y: layout.y + layout.drawH * 0.1,
                w: layout.drawW * 0.8,
                h: layout.drawH * 0.8,
            };

        setCropBox({
            x: snapVal(existing.x, 2),
            y: snapVal(existing.y, 2),
            w: snapVal(existing.w, 2),
            h: snapVal(existing.h, 2),
        });
    }, [open, img, layout, initialCropNorm]);

    useEffect(() => {
        if (!open) return;
        const tr = trRef.current;
        const node = cropRef.current;
        if (tr && node) {
            tr.nodes([node]);
            tr.getLayer()?.batchDraw();
        }
    }, [open, cropBox]);

    const boundCropToImage = useCallback(
        (next) => {
            if (!layout) return next;
            const minSize = 24;

            const xMin = layout.x;
            const yMin = layout.y;
            const xMax = layout.x + layout.drawW;
            const yMax = layout.y + layout.drawH;

            const w = Math.max(minSize, next.w);
            const h = Math.max(minSize, next.h);
            const x = clamp(next.x, xMin, xMax - w);
            const y = clamp(next.y, yMin, yMax - h);

            return { x: snapVal(x, 2), y: snapVal(y, 2), w: snapVal(w, 2), h: snapVal(h, 2) };
        },
        [layout]
    );

    const apply = useCallback(() => {
        if (!img || !layout) return;

        const x = clamp((cropBox.x - layout.x) / layout.drawW, 0, 1);
        const y = clamp((cropBox.y - layout.y) / layout.drawH, 0, 1);
        const w = clamp(cropBox.w / layout.drawW, 0, 1);
        const h = clamp(cropBox.h / layout.drawH, 0, 1);

        onApply(clampCropNorm({ x, y, w, h }));
        onOpenChange(false);
    }, [cropBox, img, layout, onApply, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-800 max-w-5xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Crop Image (drag/resize box)</DialogTitle>
                </DialogHeader>

                <div className="mt-3">
                    {!img || !layout ? (
                        <div className="text-sm text-slate-500">Loading image…</div>
                    ) : (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 overflow-auto">
                            <Stage ref={stageRef} width={viewW} height={viewH}>
                                <Layer>
                                    <Rect x={0} y={0} width={viewW} height={viewH} fill="#0b1220" />
                                    <KImage image={img} x={layout.x} y={layout.y} width={layout.drawW} height={layout.drawH} listening={false} />
                                    <Rect x={layout.x} y={layout.y} width={layout.drawW} height={layout.drawH} fill="rgba(0,0,0,0.35)" listening={false} />

                                    <Group clipX={cropBox.x} clipY={cropBox.y} clipWidth={cropBox.w} clipHeight={cropBox.h} listening={false}>
                                        <KImage image={img} x={layout.x} y={layout.y} width={layout.drawW} height={layout.drawH} listening={false} />
                                    </Group>

                                    <Rect
                                        ref={cropRef}
                                        x={cropBox.x}
                                        y={cropBox.y}
                                        width={cropBox.w}
                                        height={cropBox.h}
                                        stroke="#60a5fa"
                                        strokeWidth={2}
                                        draggable
                                        onDragMove={(e) => {
                                            const node = e.target;
                                            setCropBox(boundCropToImage({ x: node.x(), y: node.y(), w: cropBox.w, h: cropBox.h }));
                                        }}
                                        onDragEnd={(e) => {
                                            const node = e.target;
                                            setCropBox(boundCropToImage({ x: node.x(), y: node.y(), w: cropBox.w, h: cropBox.h }));
                                        }}
                                        onTransformEnd={() => {
                                            const node = cropRef.current;
                                            if (!node) return;
                                            const scaleX = node.scaleX();
                                            const scaleY = node.scaleY();
                                            node.scaleX(1);
                                            node.scaleY(1);
                                            setCropBox(
                                                boundCropToImage({
                                                    x: node.x(),
                                                    y: node.y(),
                                                    w: node.width() * scaleX,
                                                    h: node.height() * scaleY,
                                                })
                                            );
                                        }}
                                    />

                                    <Transformer
                                        ref={trRef}
                                        rotateEnabled={false}
                                        enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                                        boundBoxFunc={(oldBox, newBox) => {
                                            if (!layout) return oldBox;
                                            if (newBox.width < 24 || newBox.height < 24) return oldBox;
                                            const bounded = boundCropToImage({ x: newBox.x, y: newBox.y, w: newBox.width, h: newBox.height });
                                            return { ...newBox, x: bounded.x, y: bounded.y, width: bounded.w, height: bounded.h };
                                        }}
                                    />
                                </Layer>
                            </Stage>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 mt-3">
                        <Button variant="outline" className="border-slate-700" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={apply} disabled={!img || !layout}>
                            Apply Crop
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function KonvaImageWithEffects({
    image,
    x,
    y,
    width,
    height,
    cropPx,
    cornerRadius = 0,
    opacityPct,
    blurPct,
    brightnessPct,
    tile = false,
}) {
    const imgRef = useRef(null);

    const opacity = percentToOpacity(opacityPct);
    const blur = percentToBlurPx(blurPct);
    const brightness = percentToBrightness(brightnessPct);

    useEffect(() => {
        const node = imgRef.current;
        if (!node) return;
        node.cache();
        node.getLayer()?.batchDraw();
    }, [image, blur, brightness, opacity, cropPx, width, height, tile]);

    const filters = useMemo(() => {
        const fs = [];
        if (blur > 0) fs.push(Konva.Filters.Blur);
        if (brightness !== 0) fs.push(Konva.Filters.Brighten);
        return fs;
    }, [blur, brightness]);

    if (!image) return null;

    if (tile) {
        return (
            <Rect
                x={x}
                y={y}
                width={width}
                height={height}
                cornerRadius={cornerRadius}
                fillPatternImage={image}
                fillPatternScaleX={1}
                fillPatternScaleY={1}
                opacity={opacity}
                listening={false}
            />
        );
    }

    return (
        <KImage
            ref={imgRef}
            image={image}
            x={x}
            y={y}
            width={width}
            height={height}
            crop={cropPx || undefined}
            cornerRadius={cornerRadius}
            opacity={opacity}
            blurRadius={blur}
            brightness={brightness}
            filters={filters.length ? filters : undefined}
            listening={false}
        />
    );
}

/**
 * tries common Base44 field name variants (participant_id vs participantId etc.)
 */
async function fetchGoodNewsStoriesRobust({ storyMode, selectedParticipantId, selectedProgramId }) {
    const attempts = [];
    if (storyMode === "participant") {
        const id = selectedParticipantId;
        attempts.push({ participant_id: id });
        attempts.push({ participantId: id });
        attempts.push({ participant: id });
        attempts.push({ participantID: id });
    } else {
        const id = selectedProgramId;
        attempts.push({ program_id: id });
        attempts.push({ programId: id });
        attempts.push({ program: id });
        attempts.push({ programID: id });
    }

    for (const filter of attempts) {
        try {
            const rows = await base44.entities.GoodNewsStory.filter(filter, undefined, storyMode === "participant" ? 1000 : 2000);
            if (Array.isArray(rows) && rows.length) return rows;
        } catch {
            // keep trying
        }
    }

    try {
        const rows = await base44.entities.GoodNewsStory.list("-created_date", 2000);
        if (!Array.isArray(rows)) return [];
        if (storyMode === "participant") {
            return rows.filter((r) => safeText(r?.participant_id || r?.participantId || r?.participant) === safeText(selectedParticipantId));
        }
        return rows.filter((r) => safeText(r?.program_id || r?.programId || r?.program) === safeText(selectedProgramId));
    } catch {
        return [];
    }
}

export default function DocumentDesigner() {
    const pendingShareRef = useRef(null);

    const { data: me, isLoading: loadingMe } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 500),
    });

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 5000),
    });

    const [storyMode, setStoryMode] = useState("participant");
    const [selectedParticipantId, setSelectedParticipantId] = useState("");
    const [selectedProgramId, setSelectedProgramId] = useState("");

    const storiesEnabled = storyMode === "participant" ? !!selectedParticipantId : !!selectedProgramId;

    const {
        data: storiesRaw = [],
        isLoading: loadingStories,
        isError: storiesIsError,
        error: storiesError,
    } = useQuery({
        queryKey: ["goodNewsStories", storyMode, selectedParticipantId, selectedProgramId],
        enabled: storiesEnabled,
        queryFn: () => fetchGoodNewsStoriesRobust({ storyMode, selectedParticipantId, selectedProgramId }),
    });

    const stories = useMemo(() => (Array.isArray(storiesRaw) ? storiesRaw.map(normalizeStory) : []), [storiesRaw]);

    // IMPORTANT: no early return here (keeps hook order stable)
    const isLoading = loadingMe || loadingPrograms || loadingParticipants;

    const [sidebarOpen, setSidebarOpen] = useState(true);

    const [doc, setDoc] = useState(makeDefaultDoc());
    const [currentPageId, setCurrentPageId] = useState(doc.pages[0]?.id || "");
    const currentPage = useMemo(
        () => doc.pages.find((p) => p.id === currentPageId) || doc.pages[0],
        [doc.pages, currentPageId]
    );

    useEffect(() => {
        if (!currentPageId && doc.pages[0]?.id) setCurrentPageId(doc.pages[0].id);
    }, [currentPageId, doc.pages]);

    const { w: pageW, h: pageH } = useMemo(() => getPageSize(currentPage?.page || DEFAULT_PAGE), [currentPage?.page]);

    const [selectedIds, setSelectedIds] = useState([]);
    const currentElements = currentPage?.elements || [];
    const selectedEls = useMemo(() => {
        const s = new Set(selectedIds);
        return currentElements.filter((e) => s.has(e.id));
    }, [currentElements, selectedIds]);
    const primarySelected = selectedEls[0] || null;

    // history
    const historyRef = useRef({ past: [], future: [] });
    const lastCommitRef = useRef(0);

    const commitHistory = useCallback((prevDoc) => {
        const now = Date.now();
        if (now - lastCommitRef.current < 150) return;
        lastCommitRef.current = now;

        historyRef.current.past.push(structuredClone(prevDoc));
        if (historyRef.current.past.length > 80) historyRef.current.past.shift();
        historyRef.current.future = [];
    }, []);

    const setDocWithHistory = useCallback(
        (updater) => {
            setDoc((prev) => {
                commitHistory(prev);
                return typeof updater === "function" ? updater(prev) : updater;
            });
        },
        [commitHistory]
    );

    const undo = useCallback(() => {
        const h = historyRef.current;
        if (!h.past.length) return;
        setDoc((cur) => {
            h.future.push(structuredClone(cur));
            const prev = h.past.pop();
            const pageId = prev.pages.find((p) => p.id === currentPageId)?.id || prev.pages[0]?.id || "";
            setCurrentPageId(pageId);
            setSelectedIds([]);
            return prev;
        });
    }, [currentPageId]);

    const redo = useCallback(() => {
        const h = historyRef.current;
        if (!h.future.length) return;
        setDoc((cur) => {
            h.past.push(structuredClone(cur));
            const next = h.future.pop();
            const pageId = next.pages.find((p) => p.id === currentPageId)?.id || next.pages[0]?.id || "";
            setCurrentPageId(pageId);
            setSelectedIds([]);
            return next;
        });
    }, [currentPageId]);

    // Designs
    const [designName, setDesignName] = useState("My Document");
    const [designs, setDesigns] = useState([]);
    const [loadingDesigns, setLoadingDesigns] = useState(false);
    const [designsError, setDesignsError] = useState("");

    useEffect(() => {
        if (!me?.id) return;
        setLoadingDesigns(true);
        setDesignsError("");

        const qRef = query(collection(db, "documentDesigns"), where("userId", "==", me.id), orderBy("updatedAt", "desc"));
        const unsub = onSnapshot(
            qRef,
            (snap) => {
                setDesigns(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoadingDesigns(false);
            },
            (err) => {
                console.error(err);
                setDesignsError(safeText(err?.message || err));
                setLoadingDesigns(false);
            }
        );
        return () => unsub();
    }, [me?.id]);

    // Completed docs
    const [completedDocs, setCompletedDocs] = useState([]);
    const [loadingCompleted, setLoadingCompleted] = useState(false);
    const [completedError, setCompletedError] = useState("");

    useEffect(() => {
        if (!me?.id) return;
        setLoadingCompleted(true);
        setCompletedError("");

        const qRef = query(collection(db, "completedDocuments"), where("userId", "==", me.id), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(
            qRef,
            (snap) => {
                setCompletedDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
                setLoadingCompleted(false);
            },
            (err) => {
                console.error(err);
                setCompletedError(safeText(err?.message || err));
                setLoadingCompleted(false);
            }
        );
        return () => unsub();
    }, [me?.id]);

    // Share dialog
    const [shareOpen, setShareOpen] = useState(false);
    const [channels, setChannels] = useState([]);
    const [channelId, setChannelId] = useState("");
    const [sharing, setSharing] = useState(false);

    useEffect(() => {
        if (!shareOpen) return;
        let mounted = true;
        (async () => {
            try {
                const qRef = query(collection(db, "forumChannels"), where("isActive", "==", true));
                const snap = await getDocs(qRef);
                const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                rows.sort((a, b) => (a?.createdAt?.seconds || 0) - (b?.createdAt?.seconds || 0));
                const normalized = rows
                    .map((c) => ({ id: c.id, name: safeText(c.name || c.channel_name || c.title || c.id).trim() }))
                    .filter((c) => c.id && c.name);
                if (mounted) {
                    setChannels(normalized);
                    setChannelId(normalized?.[0]?.id || "");
                }
            } catch (e) {
                console.error(e);
                if (mounted) setChannels([]);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [shareOpen]);

    // Add dialog
    const [addOpen, setAddOpen] = useState(false);
    const [addType, setAddType] = useState("text");
    const [tempText, setTempText] = useState("");
    const [tempImageUrl, setTempImageUrl] = useState("");
    const [selectedStoryId, setSelectedStoryId] = useState("");

    // Text editor dialog
    const [editTextOpen, setEditTextOpen] = useState(false);
    const [editTextValue, setEditTextValue] = useState("");

    // Crop dialog
    const [cropOpen, setCropOpen] = useState(false);
    const [cropTarget, setCropTarget] = useState({ kind: "element", id: "" }); // element | pageBg

    // Konva refs
    const stageRef = useRef(null);
    const trRef = useRef(null);
    const nodeRefs = useRef(new Map());

    const setNodeRef = useCallback((id, node) => {
        if (!id) return;
        if (node) nodeRefs.current.set(id, node);
        else nodeRefs.current.delete(id);
    }, []);

    useEffect(() => {
        const tr = trRef.current;
        if (!tr) return;
        const nodes = selectedIds.map((id) => nodeRefs.current.get(id)).filter(Boolean);
        tr.nodes(nodes);
        tr.getLayer()?.batchDraw();
    }, [selectedIds, currentElements]);

    // Pan + zoom
    const canvasWrapRef = useRef(null);
    const [zoom, setZoom] = useState(0.9);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ pointer: { x: 0, y: 0 }, stage: { x: 0, y: 0 } });

    // ✅ Canva-like: top-centered by default
    const fitToView = useCallback(() => {
        const el = canvasWrapRef.current;
        if (!el) return;
        const pad = 24;
        const availW = Math.max(200, el.clientWidth - pad);
        const availH = Math.max(200, el.clientHeight - pad);
        const fit = Math.min(availW / pageW, availH / pageH);
        const z = clamp(fit, 0.2, 1.5);
        setZoom(z);

        const centeredX = Math.max(0, (el.clientWidth - pageW * z) / 2);
        const topY = 12; // small top gap, feels like Canva
        setStagePos({ x: centeredX, y: topY });
    }, [pageW, pageH]);

    useEffect(() => {
        fitToView();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageW, pageH, currentPageId]);

    useEffect(() => {
        const onResize = () => fitToView();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [fitToView]);

    const onWheel = useCallback(
        (e) => {
            e.evt.preventDefault();
            const stage = stageRef.current;
            if (!stage) return;

            const oldScale = zoom;
            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const mousePointTo = {
                x: (pointer.x - stagePos.x) / oldScale,
                y: (pointer.y - stagePos.y) / oldScale,
            };

            const scaleBy = 1.08;
            const direction = e.evt.deltaY > 0 ? -1 : 1;
            const newScale = clamp(direction > 0 ? oldScale * scaleBy : oldScale / scaleBy, 0.2, 2);

            const newPos = {
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            };

            setZoom(newScale);
            setStagePos(newPos);
        },
        [stagePos.x, stagePos.y, zoom]
    );

    // Image cache
    const imageCache = useRef(new Map());
    const cacheUrl = useCallback((url, img) => {
        if (url && img) imageCache.current.set(url, img);
    }, []);

    const ImgPrime = ({ url }) => {
        const img = useHtmlImage(url);
        useEffect(() => {
            cacheUrl(url, img);
        }, [url, img]);
        return null;
    };

    const updatePageBackground = useCallback(
        (patch) => {
            setDocWithHistory((prev) => ({
                ...prev,
                pages: prev.pages.map((p) => {
                    if (p.id !== currentPageId) return p;
                    const bg = p.page?.background || structuredClone(DEFAULT_PAGE.background);
                    return { ...p, page: { ...(p.page || DEFAULT_PAGE), background: { ...bg, ...patch } } };
                }),
            }));
        },
        [currentPageId, setDocWithHistory]
    );

    const updateEls = useCallback(
        (ids, patchOrFn) => {
            setDocWithHistory((prev) => ({
                ...prev,
                pages: prev.pages.map((p) => {
                    if (p.id !== currentPageId) return p;
                    const elements = (p.elements || []).map((e) => {
                        if (!ids.includes(e.id)) return e;
                        const patch = typeof patchOrFn === "function" ? patchOrFn(e) : patchOrFn;
                        return { ...e, ...patch };
                    });
                    return { ...p, elements };
                }),
            }));
        },
        [currentPageId, setDocWithHistory]
    );

    // Page helpers
    const setDocTitle = (v) => setDocWithHistory((p) => ({ ...p, docTitle: v }));

    const setPagePreset = (preset) => {
        setDocWithHistory((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => (p.id === currentPageId ? { ...p, page: { ...(p.page || DEFAULT_PAGE), preset } } : p)),
        }));
        setSelectedIds([]);
    };

    const renamePage = useCallback(
        (pageId, title) => {
            setDocWithHistory((prev) => ({
                ...prev,
                pages: prev.pages.map((p) => (p.id === pageId ? { ...p, title: safeText(title || "Page") } : p)),
            }));
        },
        [setDocWithHistory]
    );

    const addPage = useCallback(() => {
        setDocWithHistory((prev) => {
            const nextIndex = prev.pages.length + 1;
            const page = makeNewPage(`Page ${nextIndex}`);
            return { ...prev, pages: [...prev.pages, page] };
        });
        setSelectedIds([]);
    }, [setDocWithHistory]);

    const duplicatePage = useCallback(
        (pageId) => {
            setDocWithHistory((prev) => {
                const idx = prev.pages.findIndex((p) => p.id === pageId);
                if (idx < 0) return prev;
                const src = prev.pages[idx];
                const copy = {
                    ...src,
                    id: uuid(),
                    title: `${safeText(src.title || "Page")} (copy)`,
                    elements: (src.elements || []).map((e) => ({ ...e, id: uuid() })),
                };
                const pages = [...prev.pages];
                pages.splice(idx + 1, 0, copy);
                return { ...prev, pages };
            });
        },
        [setDocWithHistory]
    );

    const deletePage = useCallback(
        (pageId) => {
            setDocWithHistory((prev) => {
                if (prev.pages.length <= 1) return prev;
                const idx = prev.pages.findIndex((p) => p.id === pageId);
                const pages = prev.pages.filter((p) => p.id !== pageId);
                const nextCurrent = pages[Math.max(0, idx - 1)]?.id || pages[0]?.id || "";
                setCurrentPageId(nextCurrent);
                setSelectedIds([]);
                return { ...prev, pages };
            });
        },
        [setDocWithHistory]
    );

    const movePage = useCallback(
        (pageId, dir) => {
            setDocWithHistory((prev) => {
                const idx = prev.pages.findIndex((p) => p.id === pageId);
                if (idx < 0) return prev;
                const to = dir === "up" ? idx - 1 : idx + 1;
                if (to < 0 || to >= prev.pages.length) return prev;
                return { ...prev, pages: reorder(prev.pages, idx, to) };
            });
        },
        [setDocWithHistory]
    );

    // Add elements
    const addElement = useCallback(() => {
        const margin = toNum(currentPage?.page?.margin, 40);
        const baseX = margin;
        const baseY = margin + 40;

        let el = null;

        if (addType === "text") {
            el = makeTextElement({
                x: baseX,
                y: baseY,
                w: Math.max(320, pageW - margin * 2),
                h: 160,
                text: tempText.trim() || "Double-click to edit",
            });
        } else if (addType === "divider") {
            el = makeDividerElement({ x: baseX, y: baseY + 80, w: Math.max(320, pageW - margin * 2) });
        } else if (addType === "image_url") {
            if (!tempImageUrl.trim()) return alert("Image URL is required.");
            el = makeImageElement({ x: baseX, y: baseY, w: Math.max(360, pageW - margin * 2), h: 220, url: tempImageUrl.trim() });
        } else if (addType === "bg_image_url") {
            if (!tempImageUrl.trim()) return alert("Image URL is required.");
            el = makeImageElement({ x: 0, y: 0, w: pageW, h: Math.min(360, pageH), url: tempImageUrl.trim(), asBackgroundBlock: true });
        } else if (addType === "good_news") {
            if (!storiesEnabled) return alert("Select a participant or program first (Good News Source).");
            const story = stories.find((s) => s.id === selectedStoryId);
            if (!story) return alert("Select a story first.");
            el = makeStoryCardElement(story);
        }

        if (!el) return;

        setDocWithHistory((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => (p.id === currentPageId ? { ...p, elements: [...(p.elements || []), el] } : p)),
        }));

        setSelectedIds([el.id]);
        setTempText("");
        setTempImageUrl("");
        setSelectedStoryId("");
        setAddOpen(false);
    }, [addType, currentPage?.page?.margin, currentPageId, pageH, pageW, selectedStoryId, setDocWithHistory, stories, storiesEnabled, tempImageUrl, tempText]);

    const removeSelected = useCallback(() => {
        if (!selectedIds.length) return;
        setDocWithHistory((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => (p.id === currentPageId ? { ...p, elements: (p.elements || []).filter((e) => !selectedIds.includes(e.id)) } : p)),
        }));
        setSelectedIds([]);
    }, [currentPageId, selectedIds, setDocWithHistory]);

    const duplicateSelected = useCallback(() => {
        if (!selectedIds.length) return;
        setDocWithHistory((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => {
                if (p.id !== currentPageId) return p;
                const selected = (p.elements || []).filter((e) => selectedIds.includes(e.id));
                const copies = selected.map((e) => ({ ...e, id: uuid(), x: e.x + 12, y: e.y + 12 }));
                return { ...p, elements: [...(p.elements || []), ...copies] };
            }),
        }));
    }, [currentPageId, selectedIds, setDocWithHistory]);

    const toggleLockSelected = useCallback(() => {
        if (!selectedIds.length) return;
        updateEls(selectedIds, (e) => ({ locked: !e.locked }));
    }, [selectedIds, updateEls]);

    // Layering
    const moveLayer = useCallback((mode) => {
        if (!selectedIds.length) return;
        setDocWithHistory((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => {
                if (p.id !== currentPageId) return p;
                const els = [...(p.elements || [])];
                const selectedSet = new Set(selectedIds);

                if (mode === "front" || mode === "back") {
                    const selected = els.filter((e) => selectedSet.has(e.id));
                    const nonSelected = els.filter((e) => !selectedSet.has(e.id));
                    return { ...p, elements: mode === "front" ? [...nonSelected, ...selected] : [...selected, ...nonSelected] };
                }

                if (mode === "forward") {
                    const out = [...els];
                    for (let i = out.length - 2; i >= 0; i--) {
                        if (selectedSet.has(out[i].id) && !selectedSet.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
                    }
                    return { ...p, elements: out };
                }

                if (mode === "backward") {
                    const out = [...els];
                    for (let i = 1; i < out.length; i++) {
                        if (selectedSet.has(out[i].id) && !selectedSet.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
                    }
                    return { ...p, elements: out };
                }

                return p;
            }),
        }));
    }, [currentPageId, selectedIds, setDocWithHistory]);

    // Center on page
    const centerOnPage = useCallback((axis) => {
        if (!selectedEls.length) return;
        const sb = selectionBounds(selectedEls);
        if (!sb) return;

        const targetCx = pageW / 2;
        const targetCy = pageH / 2;

        const dx = axis === "x" || axis === "both" ? targetCx - sb.cx : 0;
        const dy = axis === "y" || axis === "both" ? targetCy - sb.cy : 0;

        updateEls(selectedIds, (el) => ({ x: el.x + dx, y: el.y + dy }));

        for (const id of selectedIds) {
            const node = nodeRefs.current.get(id);
            if (!node) continue;
            node.x(node.x() + dx);
            node.y(node.y() + dy);
        }
    }, [pageH, pageW, selectedEls, selectedIds, updateEls]);

    // Text formatting
    const toggleBold = useCallback(() => {
        if (!primarySelected || primarySelected.type !== "text") return;
        updateEls([primarySelected.id], { bold: !primarySelected.bold });
    }, [primarySelected, updateEls]);

    const toggleItalic = useCallback(() => {
        if (!primarySelected || primarySelected.type !== "text") return;
        updateEls([primarySelected.id], { italic: !primarySelected.italic });
    }, [primarySelected, updateEls]);

    const toggleUnderline = useCallback(() => {
        if (!primarySelected || primarySelected.type !== "text") return;
        updateEls([primarySelected.id], { underline: !primarySelected.underline });
    }, [primarySelected, updateEls]);

    const setTextFill = useCallback((fill) => {
        if (!primarySelected || primarySelected.type !== "text") return;
        updateEls([primarySelected.id], { fill: safeText(fill || "#111827") });
    }, [primarySelected, updateEls]);

    const setTextLineHeight = useCallback((v) => {
        if (!primarySelected || primarySelected.type !== "text") return;
        if (v === "") return updateEls([primarySelected.id], { lineHeight: 1.25 });
        const n = clamp(Number(v), 0.8, 3);
        updateEls([primarySelected.id], { lineHeight: n });
    }, [primarySelected, updateEls]);

    const setTextLetterSpacing = useCallback((v) => {
        if (!primarySelected || primarySelected.type !== "text") return;
        if (v === "") return updateEls([primarySelected.id], { letterSpacing: 0 });
        const n = clamp(Number(v), -5, 40);
        updateEls([primarySelected.id], { letterSpacing: n });
    }, [primarySelected, updateEls]);

    // Editable percent fields (blank allowed)
    const setSelectedImagePercent = useCallback((key, valueStr) => {
        if (!primarySelected) return;
        if (primarySelected.type !== "image" && primarySelected.type !== "bg_image") return;
        updateEls([primarySelected.id], { [key]: parsePercentOrNull(valueStr) });
    }, [primarySelected, updateEls]);

    const setPageBgPercent = useCallback((key, valueStr) => {
        updatePageBackground({ [key]: parsePercentOrNull(valueStr) });
    }, [updatePageBackground]);

    // Upload
    const fileInputRef = useRef(null);
    const bgFileInputRef = useRef(null);

    const uploadFile = useCallback(async (file) => {
        const up = await base44.integrations.Core.UploadFile({ file, pathPrefix: "documents" });
        const url = up?.url || up?.file_url;
        if (!url) throw new Error("Upload did not return a URL.");
        return url;
    }, []);

    const uploadAndAddImageElement = useCallback(async (file, asBgBlock = false) => {
        try {
            const url = await uploadFile(file);
            const margin = toNum(currentPage?.page?.margin, 40);

            const el = makeImageElement({
                x: asBgBlock ? 0 : margin,
                y: asBgBlock ? 0 : margin,
                w: asBgBlock ? pageW : Math.max(360, pageW - margin * 2),
                h: asBgBlock ? Math.min(360, pageH) : 260,
                url,
                asBackgroundBlock: asBgBlock,
            });

            setDocWithHistory((prev) => ({
                ...prev,
                pages: prev.pages.map((p) => (p.id === currentPageId ? { ...p, elements: [...(p.elements || []), el] } : p)),
            }));

            setSelectedIds([el.id]);
        } catch (e) {
            console.error(e);
            alert(e?.message || "Upload failed.");
        }
    }, [currentPage?.page?.margin, currentPageId, pageH, pageW, setDocWithHistory, uploadFile]);

    const uploadAndSetPageBg = useCallback(async (file) => {
        try {
            const url = await uploadFile(file);
            updatePageBackground({ imageUrl: url, cropNorm: null });
        } catch (e) {
            console.error(e);
            alert(e?.message || "Upload failed.");
        }
    }, [updatePageBackground, uploadFile]);

    const openTextEditor = useCallback((el) => {
        if (!el || el.type !== "text") return;
        setEditTextValue(safeText(el.text));
        setEditTextOpen(true);
    }, []);

    const applyTextEditor = useCallback(() => {
        if (!primarySelected || primarySelected.type !== "text") return;
        updateEls([primarySelected.id], { text: editTextValue });
        setEditTextOpen(false);
    }, [editTextValue, primarySelected, updateEls]);

    // Crop helpers
    const getCropPxFor = useCallback((img, cropNorm, fitMode, boxW, boxH) => {
        if (!img) return null;
        if (cropNorm) return normToPxCrop(cropNorm, img.width, img.height);
        if (fitMode === "contain") return normToPxCrop(computeContainCropNorm(), img.width, img.height);
        if (fitMode === "cover") return normToPxCrop(computeCoverCropNorm(img.width, img.height, boxW, boxH), img.width, img.height);
        return null;
    }, []);

    const openCropForSelectedElement = useCallback(() => {
        if (!primarySelected) return;
        if (primarySelected.type !== "image" && primarySelected.type !== "bg_image") return;
        setCropTarget({ kind: "element", id: primarySelected.id });
        setCropOpen(true);
    }, [primarySelected]);

    const bg = currentPage?.page?.background || structuredClone(DEFAULT_PAGE.background);
    const pageBgUrl = safeText(bg.imageUrl || "");

    const openCropForPageBg = useCallback(() => {
        if (!pageBgUrl) return alert("Set a page background image first.");
        setCropTarget({ kind: "pageBg", id: "" });
        setCropOpen(true);
    }, [pageBgUrl]);

    const cropUrl = useMemo(() => {
        if (cropTarget.kind === "pageBg") return pageBgUrl;
        const el = currentElements.find((e) => e.id === cropTarget.id);
        return safeText(el?.url || "");
    }, [cropTarget, currentElements, pageBgUrl]);

    const cropInitial = useMemo(() => {
        if (cropTarget.kind === "pageBg") return bg.cropNorm || null;
        const el = currentElements.find((e) => e.id === cropTarget.id);
        return el?.cropNorm || null;
    }, [cropTarget, currentElements, bg.cropNorm]);

    const applyCrop = useCallback((cropNorm) => {
        if (cropTarget.kind === "pageBg") {
            updatePageBackground({ cropNorm, fitMode: "manual" });
            return;
        }
        updateEls([cropTarget.id], { cropNorm, fitMode: "manual" });
    }, [cropTarget, updateEls, updatePageBackground]);

    // Snapping + guides
    const [guides, setGuides] = useState([]);
    const snapTolerance = 8;
    const gridSize = 8;

    const buildSnapCandidates = useCallback(() => {
        const margin = toNum(currentPage?.page?.margin, 40);
        const v = new Set([0, pageW, pageW / 2, margin, pageW - margin]);
        const h = new Set([0, pageH, pageH / 2, margin, pageH - margin]);

        for (const el of currentElements) {
            if (selectedIds.includes(el.id)) continue;
            const b = getElementBounds(el);
            v.add(b.left); v.add(b.cx); v.add(b.right);
            h.add(b.top); h.add(b.cy); h.add(b.bottom);
        }

        return { v: Array.from(v), h: Array.from(h) };
    }, [currentElements, currentPage?.page?.margin, pageH, pageW, selectedIds]);

    const applySnappingForDrag = useCallback(() => {
        const candidates = buildSnapCandidates();
        const sb = selectionBounds(selectedEls);
        if (!sb) return { dx: 0, dy: 0, guides: [] };

        const snapXVals = [{ v: sb.left }, { v: sb.cx }, { v: sb.right }];
        const snapYVals = [{ v: sb.top }, { v: sb.cy }, { v: sb.bottom }];

        const vGrid = [];
        const hGrid = [];
        for (let x = 0; x <= pageW; x += gridSize) vGrid.push(x);
        for (let y = 0; y <= pageH; y += gridSize) hGrid.push(y);

        const vCandidates = candidates.v.concat(vGrid);
        const hCandidates = candidates.h.concat(hGrid);

        let bestX = null;
        for (const s of snapXVals) {
            const b = pickBestSnap(s.v, vCandidates, snapTolerance);
            if (b && (!bestX || b.d < bestX.d)) bestX = { ...b, cur: s.v };
        }

        let bestY = null;
        for (const s of snapYVals) {
            const b = pickBestSnap(s.v, hCandidates, snapTolerance);
            if (b && (!bestY || b.d < bestY.d)) bestY = { ...b, cur: s.v };
        }

        const dx = bestX ? bestX.target - bestX.cur : 0;
        const dy = bestY ? bestY.target - bestY.cur : 0;

        const nextGuides = [];
        if (bestX) nextGuides.push({ type: "v", pos: bestX.target });
        if (bestY) nextGuides.push({ type: "h", pos: bestY.target });

        return { dx, dy, guides: nextGuides };
    }, [buildSnapCandidates, pageH, pageW, selectedEls]);

    // Write back node transforms
    const updatePositionsFromNodes = useCallback(() => {
        const ids = selectedIds;
        if (!ids.length) return;

        const patches = [];
        for (const id of ids) {
            const node = nodeRefs.current.get(id);
            const el = currentElements.find((x) => x.id === id);
            if (!node || !el) continue;

            const scaleX = node.scaleX();
            const scaleY = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);

            patches.push({
                id,
                patch: {
                    x: snapVal(node.x(), 1),
                    y: snapVal(node.y(), 1),
                    w: clamp(snapVal(Math.max(20, el.w * scaleX), 1), 20, 5000),
                    h: clamp(snapVal(Math.max(10, el.h * scaleY), 1), 10, 5000),
                    rotation: snapVal(node.rotation(), 1),
                },
            });
        }

        if (!patches.length) return;

        setDocWithHistory((prev) => ({
            ...prev,
            pages: prev.pages.map((p) => {
                if (p.id !== currentPageId) return p;
                const elements = (p.elements || []).map((e) => {
                    const m = patches.find((x) => x.id === e.id);
                    return m ? { ...e, ...m.patch } : e;
                });
                return { ...p, elements };
            }),
        }));
    }, [currentElements, currentPageId, selectedIds, setDocWithHistory]);

    // Panning: drag empty space
    const onStageMouseDown = useCallback((e) => {
        const stage = e.target.getStage();
        const isEmpty = e.target === stage;
        if (isEmpty) {
            setIsPanning(true);
            const pointer = stage.getPointerPosition() || { x: 0, y: 0 };
            panStart.current = { pointer, stage: { ...stagePos } };
            setSelectedIds([]);
        }
    }, [stagePos]);

    const onStageMouseMove = useCallback(() => {
        if (!isPanning) return;
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const dx = pointer.x - panStart.current.pointer.x;
        const dy = pointer.y - panStart.current.pointer.y;
        setStagePos({ x: panStart.current.stage.x + dx, y: panStart.current.stage.y + dy });
    }, [isPanning]);

    const onStageMouseUp = useCallback(() => {
        if (!isPanning) return;
        setIsPanning(false);
    }, [isPanning]);

    const onSelect = useCallback((id, shiftKey) => {
        setSelectedIds((prev) => {
            if (!shiftKey) return [id];
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            return [...prev, id];
        });
    }, []);

    const onDragMove = useCallback(() => {
        if (!selectedIds.length) return;
        const nodes = selectedIds.map((id) => nodeRefs.current.get(id)).filter(Boolean);
        if (!nodes.length) return;

        const { dx, dy, guides: g } = applySnappingForDrag();
        if (dx !== 0 || dy !== 0) {
            for (const n of nodes) {
                n.x(n.x() + dx);
                n.y(n.y() + dy);
            }
        }
        setGuides(g);
    }, [applySnappingForDrag, selectedIds]);

    const onDragEnd = useCallback(() => {
        setGuides([]);
        updatePositionsFromNodes();
    }, [updatePositionsFromNodes]);

    const onTransformEnd = useCallback(() => {
        setGuides([]);
        updatePositionsFromNodes();
    }, [updatePositionsFromNodes]);

    const urlsToPrime = useMemo(() => {
        const set = new Set();
        if (pageBgUrl) set.add(pageBgUrl);
        for (const el of currentElements) {
            if ((el.type === "image" || el.type === "bg_image") && el.url) set.add(el.url);
        }
        return Array.from(set);
    }, [currentElements, pageBgUrl]);

    const bgImg = bg.imageUrl ? imageCache.current.get(bg.imageUrl) || null : null;
    const bgCropPx = getCropPxFor(bgImg, bg.cropNorm, bg.fitMode, pageW, pageH);
    const bgTile = bg.fitMode === "tile";

    const sortedElementsForRender = useMemo(() => {
        const els = [...currentElements];
        els.sort((a, b) => (a.type === "bg_image" ? 0 : 1) - (b.type === "bg_image" ? 0 : 1));
        return els;
    }, [currentElements]);

    const toolbarPos = useMemo(() => {
        if (!selectedEls.length) return null;
        const sb = selectionBounds(selectedEls);
        if (!sb) return null;
        const wrap = canvasWrapRef.current;
        if (!wrap) return null;

        const rect = wrap.getBoundingClientRect();
        const xCanvas = stagePos.x + sb.cx * zoom;
        const yCanvasTop = stagePos.y + sb.top * zoom;

        return {
            left: rect.left + xCanvas,
            top: rect.top + yCanvasTop - 52,
        };
    }, [selectedEls, stagePos.x, stagePos.y, zoom]);

    const renderElement = (el) => {
        const isSelected = selectedIds.includes(el.id);

        const commonNodeProps = {
            id: el.id,
            x: el.x,
            y: el.y,
            rotation: el.rotation || 0,
            draggable: !isPanning && !el.locked,
            onClick: (evt) => onSelect(el.id, evt.evt.shiftKey),
            onTap: (evt) => onSelect(el.id, evt.evt.shiftKey),
            onDragMove,
            onDragEnd,
            onTransformEnd,
            ref: (node) => setNodeRef(el.id, node),
            shadowEnabled: isSelected,
            shadowBlur: isSelected ? 8 : 0,
            shadowOpacity: isSelected ? 0.25 : 0,
            shadowOffsetX: isSelected ? 2 : 0,
            shadowOffsetY: isSelected ? 2 : 0,
        };

        if (el.type === "divider") {
            return (
                <Rect
                    key={el.id}
                    {...commonNodeProps}
                    width={el.w}
                    height={Math.max(2, toNum(el.h, 2))}
                    fill={safeText(el.stroke || "#e5e7eb")}
                    cornerRadius={2}
                />
            );
        }

        if (el.type === "text") {
            const fontStyle = `${el.bold ? "bold" : "normal"} ${el.italic ? "italic" : "normal"}`.replace("normal normal", "normal");
            return (
                <KText
                    key={el.id}
                    {...commonNodeProps}
                    width={el.w}
                    height={el.h}
                    text={safeText(el.text)}
                    fontSize={toNum(el.fontSize, 18)}
                    fontFamily={safeText(el.fontFamily || "Arial")}
                    fontStyle={fontStyle}
                    textDecoration={el.underline ? "underline" : ""}
                    fill={safeText(el.fill || "#111827")}
                    align={safeText(el.align || "left")}
                    verticalAlign={safeText(el.verticalAlign || "top")}
                    padding={10}
                    wrap="word"
                    lineHeight={clamp(toNum(el.lineHeight, 1.25), 0.8, 3)}
                    letterSpacing={clamp(toNum(el.letterSpacing, 0), -5, 40)}
                    onDblClick={() => openTextEditor(el)}
                    onDblTap={() => openTextEditor(el)}
                />
            );
        }

        if (el.type === "image" || el.type === "bg_image") {
            const img = imageCache.current.get(el.url) || null;
            const cropPx = getCropPxFor(img, el.cropNorm, el.fitMode, el.w, el.h);
            const tile = el.fitMode === "tile";

            return (
                <Group key={el.id} {...commonNodeProps}>
                    <Rect width={el.w} height={el.h} fill="#f3f4f6" cornerRadius={10} />
                    {el.fitMode === "stretch" ? (
                        <KonvaImageWithEffects
                            image={img}
                            x={0}
                            y={0}
                            width={el.w}
                            height={el.h}
                            cropPx={null}
                            cornerRadius={10}
                            opacityPct={el.opacityPct}
                            blurPct={el.blurPct}
                            brightnessPct={el.brightnessPct}
                            tile={false}
                        />
                    ) : (
                        <KonvaImageWithEffects
                            image={img}
                            x={0}
                            y={0}
                            width={el.w}
                            height={el.h}
                            cropPx={cropPx}
                            cornerRadius={10}
                            opacityPct={el.opacityPct}
                            blurPct={el.blurPct}
                            brightnessPct={el.brightnessPct}
                            tile={tile}
                        />
                    )}

                    <Rect
                        x={0}
                        y={0}
                        width={el.w}
                        height={el.h}
                        cornerRadius={10}
                        stroke={isSelected ? "#2563eb" : "#e5e7eb"}
                        strokeWidth={isSelected ? 2 : 1}
                        listening={false}
                    />
                </Group>
            );
        }

        return null;
    };

    // Export snapshots
    const snapshotCurrentPage = useCallback(async () => {
        const prevSel = selectedIds;
        setSelectedIds([]);
        await raf();
        const stage = stageRef.current;
        if (!stage) return { dataUrl: "", css: getPageCss(currentPage?.page || DEFAULT_PAGE), w: pageW, h: pageH };
        stage.batchDraw();
        const dataUrl = stage.toDataURL({ pixelRatio: 2 });
        setSelectedIds(prevSel);
        await raf();
        return { dataUrl, css: getPageCss(currentPage?.page || DEFAULT_PAGE), w: pageW, h: pageH };
    }, [currentPage?.page, pageH, pageW, selectedIds]);

    const snapshotAllPages = useCallback(async () => {
        const originalPageId = currentPageId;
        const originalSel = selectedIds;

        setSelectedIds([]);
        await raf();

        const urls = [];
        for (const p of doc.pages) {
            setCurrentPageId(p.id);
            await raf();
            await raf();
            const stage = stageRef.current;
            if (!stage) continue;
            stage.batchDraw();
            urls.push({
                pageId: p.id,
                title: p.title,
                url: stage.toDataURL({ pixelRatio: 2 }),
                css: getPageCss(p.page || DEFAULT_PAGE),
                w: getPageSize(p.page || DEFAULT_PAGE).w,
                h: getPageSize(p.page || DEFAULT_PAGE).h,
            });
        }

        setCurrentPageId(originalPageId);
        setSelectedIds(originalSel);
        await raf();

        return urls;
    }, [currentPageId, doc.pages, selectedIds]);

    const renderExportHtmlSingle = (docTitle, pageDataUrl) => {
        const safeTitle = escapeHtml(safeText(docTitle || "Document"));
        const date = escapeHtml(new Date().toLocaleDateString());
        return `
      <h1>${safeTitle}</h1>
      <div class="muted">Generated ${date} • 1 page</div>
      <div class="page"><img src="${escapeHtml(pageDataUrl)}" alt="page-1" /></div>
    `;
    };

    const renderExportHtmlAllPages = (docTitle, pagesData) => {
        const safeTitle = escapeHtml(safeText(docTitle || "Document"));
        const date = escapeHtml(new Date().toLocaleDateString());
        const pagesHtml = pagesData
            .map(
                (p, idx) => `
        <div class="page ${idx < pagesData.length - 1 ? "pageBreak" : ""}">
          <img src="${escapeHtml(p.url)}" alt="page-${idx + 1}" />
        </div>`
            )
            .join("\n");

        return `
      <h1>${safeTitle}</h1>
      <div class="muted">Generated ${date} • Pages ${pagesData.length}</div>
      ${pagesHtml}
    `;
    };

    const dataUrlToImage = async (dataUrl) =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = dataUrl;
        });

    const exportPdfCurrentPage = useCallback(async () => {
        const snap = await snapshotCurrentPage();
        if (!snap.dataUrl) return alert("Nothing to export.");
        const htmlBody = renderExportHtmlSingle(doc.docTitle, snap.dataUrl);
        openPrintPdfWindow(doc.docTitle || "Document", htmlBody, snap.css);
    }, [doc.docTitle, snapshotCurrentPage]);

    const exportPdfAllPagesSingleFile = useCallback(async () => {
        const pagesData = await snapshotAllPages();
        if (!pagesData.length) return alert("Nothing to export.");

        const presetCss = pagesData[0].css || PAGE_PRESETS.a4p.css;
        const orientation = presetCss.includes("landscape") ? "landscape" : "portrait";
        const pdf = new jsPDF({ unit: "pt", format: "a4", orientation, compress: true });

        for (let i = 0; i < pagesData.length; i++) {
            const p = pagesData[i];
            const img = await dataUrlToImage(p.url);
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            if (i > 0) pdf.addPage();
            pdf.addImage(img, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
        }

        pdf.save(`${safeText(doc.docTitle || "Document")}.pdf`);
    }, [doc.docTitle, snapshotAllPages]);

    const exportPdfAllPagesSeparateFiles = useCallback(async () => {
        const pagesData = await snapshotAllPages();
        if (!pagesData.length) return alert("Nothing to export.");

        for (let i = 0; i < pagesData.length; i++) {
            const p = pagesData[i];
            const presetCss = p.css || PAGE_PRESETS.a4p.css;
            const orientation = presetCss.includes("landscape") ? "landscape" : "portrait";

            const pdf = new jsPDF({ unit: "pt", format: "a4", orientation, compress: true });
            const img = await dataUrlToImage(p.url);

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            pdf.addImage(img, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");

            pdf.save(`${safeText(doc.docTitle || "Document")}-page-${i + 1}.pdf`);
        }
    }, [doc.docTitle, snapshotAllPages]);

    const saveCompletedDocument = useCallback(async () => {
        if (!me?.id) return alert("Not logged in.");

        const pagesData = await snapshotAllPages();
        if (!pagesData.length) return alert("Nothing to save.");

        const presetCss = pagesData[0].css || PAGE_PRESETS.a4p.css;
        const orientation = presetCss.includes("landscape") ? "landscape" : "portrait";

        const pdf = new jsPDF({ unit: "pt", format: "a4", orientation, compress: true });

        for (let i = 0; i < pagesData.length; i++) {
            const p = pagesData[i];
            const img = await dataUrlToImage(p.url);
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            if (i > 0) pdf.addPage();
            pdf.addImage(img, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
        }

        const blob = pdf.output("blob");
        const file = new File([blob], `${safeText(doc.docTitle || "Document")}.pdf`, { type: "application/pdf" });

        try {
            const up = await base44.integrations.Core.UploadFile({ file, pathPrefix: "completed-documents" });
            const pdfUrl = up?.url || up?.file_url;
            if (!pdfUrl) throw new Error("Upload did not return a URL.");

            await addDoc(collection(db, "completedDocuments"), {
                userId: me.id,
                title: safeText(doc.docTitle || "Document"),
                pdfUrl,
                designDoc: doc,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            alert("Saved to Completed Documents.");
        } catch (e) {
            console.error(e);
            alert(e?.message || "Save completed document failed.");
        }
    }, [doc, me?.id, snapshotAllPages]);

    const loadCompletedDocument = useCallback((row) => {
        const loaded = row?.designDoc || makeDefaultDoc();
        const normalized = {
            docTitle: safeText(loaded.docTitle || row?.title || "Document"),
            pages: Array.isArray(loaded.pages) && loaded.pages.length ? loaded.pages : [makeNewPage("Page 1")],
        };

        setDoc(normalized);
        setCurrentPageId(normalized.pages[0]?.id || "");
        setSelectedIds([]);
        historyRef.current = { past: [], future: [] };
    }, []);

    const saveDesign = useCallback(async () => {
        if (!me?.id) return alert("Not logged in.");
        if (!designName.trim()) return alert("Design name required.");

        await addDoc(collection(db, "documentDesigns"), {
            userId: me.id,
            name: designName.trim(),
            doc,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
        });

        alert("Design saved.");
    }, [designName, doc, me?.id]);

    const loadDesign = useCallback((d) => {
        const loaded = d?.doc || makeDefaultDoc();
        const normalized = {
            docTitle: safeText(loaded.docTitle || "Document"),
            pages: Array.isArray(loaded.pages) && loaded.pages.length ? loaded.pages : [makeNewPage("Page 1")],
        };

        setDoc(normalized);
        setCurrentPageId(normalized.pages[0]?.id || "");
        setSelectedIds([]);
        historyRef.current = { past: [], future: [] };
    }, []);

    const shareToForum = useCallback(async (attachment) => {
        if (!channelId) return alert("Select a forum channel.");
        if (!me?.id) return alert("Not logged in.");

        setSharing(true);
        try {
            await addDoc(collection(db, "forumMessages"), {
                channelId,
                channel_id: channelId,
                channel_name: channels.find((c) => c.id === channelId)?.name || channelId,

                message_type: attachment?.type || "document",
                title: attachment?.title || doc.docTitle || "Document",
                body: "Shared a document.",
                content: "",
                attachments: attachment?.attachments || [],

                authorId: me.id,
                authorName: me?.full_name || me?.display_name || me?.email || "Unknown",
                authorRole: me?.app_role || null,

                createdAt: serverTimestamp(),
                likedBy: [],
            });

            alert("Shared to forum.");
            setShareOpen(false);
        } catch (e) {
            console.error(e);
            alert(e?.message || "Share failed.");
        } finally {
            setSharing(false);
        }
    }, [channelId, channels, doc.docTitle, me]);

    const goodNewsControls = (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
            <div className="text-white font-semibold text-sm">Good News Source</div>

            <div>
                <Label className="text-slate-300">Mode</Label>
                <Select value={storyMode} onValueChange={setStoryMode}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="participant" className="text-white">Participant</SelectItem>
                        <SelectItem value="program" className="text-white">Program</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {storyMode === "participant" ? (
                <div>
                    <Label className="text-slate-300">Participant</Label>
                    <Select value={selectedParticipantId} onValueChange={setSelectedParticipantId}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select participant" /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                            {(participants || []).map((p) => (
                                <SelectItem key={p.id} value={p.id} className="text-white">
                                    {safeText(p.first_name)} {safeText(p.last_name)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : (
                <div>
                    <Label className="text-slate-300">Program</Label>
                    <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select program" /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                            {(programs || []).map((p) => (
                                <SelectItem key={p.id} value={p.id} className="text-white">
                                    {safeText(p.program_name)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div className="text-xs text-slate-500">
                {storiesEnabled ? (
                    loadingStories ? "Loading stories…" : storiesIsError ? `Error: ${safeText(storiesError?.message || storiesError)}` : `Stories loaded: ${stories.length}`
                ) : (
                    "Select a participant/program to load stories."
                )}
            </div>
        </div>
    );

    // ✅ FINAL guard (safe hook order)
    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader title="Document Designer" subtitle="EmptyState overlay + top-aligned canvas + stable hooks." />

            <div className="hidden">
                {urlsToPrime.map((u) => (
                    <ImgPrime key={u} url={u} />
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Canvas */}
                <div className={`${sidebarOpen ? "xl:col-span-8" : "xl:col-span-12"} space-y-4`}>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="md:col-span-2">
                                    <Label className="text-slate-300">Document Title</Label>
                                    <Input className="bg-slate-800 border-slate-700 text-white" value={doc.docTitle} onChange={(e) => setDocTitle(e.target.value)} />
                                </div>

                                <div>
                                    <Label className="text-slate-300">Page size</Label>
                                    <Select value={currentPage?.page?.preset || "a4p"} onValueChange={setPagePreset}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {Object.entries(PAGE_PRESETS).map(([k, v]) => (
                                                <SelectItem key={k} value={k} className="text-white">{v.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <Button variant="outline" className="border-slate-700" onClick={() => setSidebarOpen((s) => !s)}>
                                {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                            </Button>
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                            <Button className="bg-blue-600 hover:bg-blue-700" type="button" onClick={() => setAddOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" /> Add Element
                            </Button>

                            <Button variant="outline" className="border-slate-700" type="button" onClick={() => fileInputRef.current?.click()}>
                                <ImageIcon className="h-4 w-4 mr-2" /> Upload Image
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = "";
                                    if (f) uploadAndAddImageElement(f, false);
                                }}
                            />

                            <Button variant="outline" className="border-slate-700" type="button" onClick={undo}>Undo</Button>
                            <Button variant="outline" className="border-slate-700" type="button" onClick={redo}>Redo</Button>

                            <Button variant="outline" className="border-slate-700" type="button" onClick={exportPdfCurrentPage}>
                                <FileDown className="h-4 w-4 mr-2" /> Export PDF (Page)
                            </Button>
                            <Button variant="outline" className="border-slate-700" type="button" onClick={exportPdfAllPagesSingleFile}>
                                <FileDown className="h-4 w-4 mr-2" /> Export All (1 PDF)
                            </Button>
                            <Button variant="outline" className="border-slate-700" type="button" onClick={exportPdfAllPagesSeparateFiles}>
                                <FileDown className="h-4 w-4 mr-2" /> Export All (Separate)
                            </Button>

                            <Button className="bg-emerald-600 hover:bg-emerald-700" type="button" onClick={saveCompletedDocument}>
                                <FolderCheck className="h-4 w-4 mr-2" /> Save Completed PDF
                            </Button>

                            <div className="ml-auto text-xs text-slate-500">Pan: drag empty space • Zoom: mouse wheel</div>
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                            <Button variant="outline" className="border-slate-700" disabled={!selectedIds.length} onClick={() => centerOnPage("x")}>
                                <AlignCenter className="h-4 w-4 mr-2" /> Center H
                            </Button>
                            <Button variant="outline" className="border-slate-700" disabled={!selectedIds.length} onClick={() => centerOnPage("y")}>
                                <AlignCenter className="h-4 w-4 mr-2" /> Center V
                            </Button>
                            <Button variant="outline" className="border-slate-700" disabled={!selectedIds.length} onClick={() => centerOnPage("both")}>
                                <AlignCenter className="h-4 w-4 mr-2" /> Center Both
                            </Button>

                            <Button variant="outline" className="border-slate-700" disabled={!selectedIds.length} onClick={() => moveLayer("front")}>
                                <BringToFront className="h-4 w-4 mr-2" /> Bring Front
                            </Button>
                            <Button variant="outline" className="border-slate-700" disabled={!selectedIds.length} onClick={() => moveLayer("back")}>
                                <SendToBack className="h-4 w-4 mr-2" /> Send Back
                            </Button>

                            <Button variant="outline" className="border-slate-700" disabled={!selectedIds.length} onClick={duplicateSelected}>
                                <Copy className="h-4 w-4 mr-2" /> Duplicate
                            </Button>
                            <Button variant="outline" className="border-slate-700" disabled={!selectedIds.length} onClick={toggleLockSelected}>
                                {primarySelected?.locked ? <Unlock className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                                {primarySelected?.locked ? "Unlock" : "Lock"}
                            </Button>
                            <Button variant="outline" className="border-red-800 text-red-200 hover:text-white" disabled={!selectedIds.length} onClick={removeSelected}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </Button>

                            <Button variant="outline" className="border-slate-700 ml-auto" onClick={() => setSidebarOpen((s) => !s)}>
                                {sidebarOpen ? "Hide tools" : "Show tools"}
                            </Button>
                        </div>
                    </div>

                    {/* Canvas wrapper */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 relative">
                        <div
                            ref={canvasWrapRef}
                            className="w-full h-[72vh] overflow-hidden rounded-xl bg-slate-950/40 border border-slate-800 relative"
                        >
                            {/* Floating toolbar */}
                            {toolbarPos && (
                                <div className="fixed z-[60] -translate-x-1/2" style={{ left: toolbarPos.left, top: toolbarPos.top }}>
                                    <div className="rounded-2xl border border-slate-700 bg-slate-900/95 shadow-lg px-3 py-2 flex items-center gap-2">
                                        <Button size="sm" variant="outline" className="border-slate-700" disabled={!primarySelected || primarySelected.type !== "text"} onClick={toggleBold}>
                                            <Bold className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" className="border-slate-700" disabled={!primarySelected || primarySelected.type !== "text"} onClick={toggleItalic}>
                                            <Italic className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" className="border-slate-700" disabled={!primarySelected || primarySelected.type !== "text"} onClick={toggleUnderline}>
                                            <Underline className="h-4 w-4" />
                                        </Button>

                                        <div className="w-px h-6 bg-slate-700/80 mx-1" />

                                        <div className="flex items-center gap-2">
                                            <Palette className="h-4 w-4 text-slate-300" />
                                            <Input
                                                className="bg-slate-800 border-slate-700 text-white h-8 w-28"
                                                disabled={!primarySelected || primarySelected.type !== "text"}
                                                value={primarySelected?.type === "text" ? safeText(primarySelected.fill || "#111827") : ""}
                                                onChange={(e) => setTextFill(e.target.value)}
                                                placeholder="#111827"
                                            />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Label className="text-slate-300 text-xs">LH</Label>
                                            <Input
                                                className="bg-slate-800 border-slate-700 text-white h-8 w-16"
                                                disabled={!primarySelected || primarySelected.type !== "text"}
                                                value={primarySelected?.type === "text" ? String(primarySelected.lineHeight ?? 1.25) : ""}
                                                onChange={(e) => setTextLineHeight(e.target.value)}
                                            />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Label className="text-slate-300 text-xs">LS</Label>
                                            <Input
                                                className="bg-slate-800 border-slate-700 text-white h-8 w-16"
                                                disabled={!primarySelected || primarySelected.type !== "text"}
                                                value={primarySelected?.type === "text" ? String(primarySelected.letterSpacing ?? 0) : ""}
                                                onChange={(e) => setTextLetterSpacing(e.target.value)}
                                            />
                                        </div>

                                        <div className="w-px h-6 bg-slate-700/80 mx-1" />

                                        <Button size="sm" variant="outline" className="border-slate-700" onClick={() => moveLayer("front")}>
                                            <BringToFront className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" className="border-slate-700" onClick={() => moveLayer("back")}>
                                            <SendToBack className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" className="border-slate-700" onClick={() => centerOnPage("both")}>
                                            <AlignCenter className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* ✅ Stage is absolute at top-left (no padding pushing it down) */}
                            <div className="absolute inset-0">
                                <Stage
                                    ref={stageRef}
                                    width={pageW}
                                    height={pageH}
                                    scaleX={zoom}
                                    scaleY={zoom}
                                    x={stagePos.x}
                                    y={stagePos.y}
                                    onWheel={onWheel}
                                    onMouseDown={onStageMouseDown}
                                    onMouseMove={onStageMouseMove}
                                    onMouseUp={onStageMouseUp}
                                    onMouseLeave={onStageMouseUp}
                                    style={{ cursor: isPanning ? "grabbing" : "default" }}
                                >
                                    <Layer>
                                        {/* Page base */}
                                        <Rect x={0} y={0} width={pageW} height={pageH} fill={safeText(bg.color || "#ffffff")} cornerRadius={18} listening={false} />


                                        {/* Page background image */}
                                        {bg.imageUrl ? (
                                            bg.fitMode === "stretch" ? (
                                                <KonvaImageWithEffects
                                                    image={bgImg}
                                                    x={0}
                                                    y={0}
                                                    width={pageW}
                                                    height={pageH}
                                                    cropPx={null}
                                                    cornerRadius={18}
                                                    opacityPct={bg.opacityPct}
                                                    blurPct={bg.blurPct}
                                                    brightnessPct={bg.brightnessPct}
                                                    tile={false}
                                                />
                                            ) : (
                                                <KonvaImageWithEffects
                                                    image={bgImg}
                                                    x={0}
                                                    y={0}
                                                    width={pageW}
                                                    height={pageH}
                                                    cropPx={bgCropPx}
                                                    cornerRadius={18}
                                                    opacityPct={bg.opacityPct}
                                                    blurPct={bg.blurPct}
                                                    brightnessPct={bg.brightnessPct}
                                                    tile={bgTile}
                                                />
                                            )
                                        ) : null}

                                        {/* margin guide */}
                                        <Rect
                                            x={toNum(currentPage?.page?.margin, 40)}
                                            y={toNum(currentPage?.page?.margin, 40)}
                                            width={pageW - toNum(currentPage?.page?.margin, 40) * 2}
                                            height={pageH - toNum(currentPage?.page?.margin, 40) * 2}
                                            stroke="#e5e7eb"
                                            dash={[6, 6]}
                                            strokeWidth={1}
                                            opacity={0.55}
                                            listening={false}
                                        />

                                        {sortedElementsForRender.map(renderElement)}

                                        <Transformer
                                            ref={trRef}
                                            rotateEnabled
                                            enabledAnchors={[
                                                "top-left",
                                                "top-right",
                                                "bottom-left",
                                                "bottom-right",
                                                "middle-left",
                                                "middle-right",
                                                "top-center",
                                                "bottom-center",
                                            ]}
                                            boundBoxFunc={(oldBox, newBox) => {
                                                if (newBox.width < 20 || newBox.height < 10) return oldBox;
                                                return newBox;
                                            }}
                                        />

                                        {guides.map((g, i) =>
                                            g.type === "v" ? (
                                                <Line key={`gv-${i}`} points={[g.pos, 0, g.pos, pageH]} stroke="#a855f7" strokeWidth={1} dash={[6, 6]} listening={false} />
                                            ) : (
                                                <Line key={`gh-${i}`} points={[0, g.pos, pageW, g.pos]} stroke="#a855f7" strokeWidth={1} dash={[6, 6]} listening={false} />
                                            )
                                        )}
                                    </Layer>
                                </Stage>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                {sidebarOpen ? (
                    <div className="xl:col-span-4 space-y-6">
                        {/* Pages */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-white font-semibold flex items-center gap-2"><Layers className="h-4 w-4" /> Pages ({doc.pages.length})</div>
                                <Button className="bg-blue-600 hover:bg-blue-700" size="sm" onClick={addPage}>
                                    <FilePlus2 className="h-4 w-4 mr-2" /> Add
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {doc.pages.map((p, idx) => {
                                    const isActive = p.id === currentPageId;
                                    return (
                                        <div key={p.id} className={`rounded-xl border p-3 ${isActive ? "border-blue-600 bg-slate-900/60" : "border-slate-800 bg-slate-950/30"}`}>
                                            <button type="button" className="w-full text-left" onClick={() => { setCurrentPageId(p.id); setSelectedIds([]); }}>
                                                <div className="text-sm text-white font-medium truncate">{safeText(p.title || `Page ${idx + 1}`)}</div>
                                                <div className="text-xs text-slate-500">{PAGE_PRESETS[p.page?.preset || "a4p"]?.name || "Page"} • {(p.elements || []).length} elements</div>
                                            </button>

                                            <div className="mt-2 grid grid-cols-2 gap-2">
                                                <Button variant="outline" className="border-slate-700" size="sm" onClick={() => movePage(p.id, "up")} disabled={idx === 0}>
                                                    <ChevronUp className="h-4 w-4 mr-2" /> Up
                                                </Button>
                                                <Button variant="outline" className="border-slate-700" size="sm" onClick={() => movePage(p.id, "down")} disabled={idx === doc.pages.length - 1}>
                                                    <ChevronDown className="h-4 w-4 mr-2" /> Down
                                                </Button>

                                                <Button variant="outline" className="border-slate-700" size="sm" onClick={() => duplicatePage(p.id)}>
                                                    <Copy className="h-4 w-4 mr-2" /> Copy
                                                </Button>
                                                <Button variant="outline" className="border-red-800 text-red-200 hover:text-white" size="sm" onClick={() => deletePage(p.id)} disabled={doc.pages.length <= 1}>
                                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                                </Button>
                                            </div>

                                            <div className="mt-2">
                                                <Label className="text-slate-300 text-xs">Title</Label>
                                                <Input className="bg-slate-800 border-slate-700 text-white" value={safeText(p.title || "")} onChange={(e) => renamePage(p.id, e.target.value)} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Page background */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <div className="text-white font-semibold">Page Background</div>

                            <div className="space-y-2">
                                <Label className="text-slate-300">Background image (URL)</Label>
                                <Input className="bg-slate-800 border-slate-700 text-white" value={pageBgUrl} onChange={(e) => updatePageBackground({ imageUrl: e.target.value, cropNorm: null })} placeholder="https://..." />

                                <div className="flex gap-2 flex-wrap">
                                    <Button variant="outline" className="border-slate-700" onClick={() => bgFileInputRef.current?.click()}>
                                        <ImageIcon className="h-4 w-4 mr-2" /> Upload
                                    </Button>
                                    <input
                                        ref={bgFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            e.target.value = "";
                                            if (f) uploadAndSetPageBg(f);
                                        }}
                                    />

                                    <Button variant="outline" className="border-slate-700" onClick={openCropForPageBg} disabled={!pageBgUrl}>
                                        <Scissors className="h-4 w-4 mr-2" /> Crop
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <Label className="text-slate-300 text-xs">Opacity %</Label>
                                    <Input
                                        className="bg-slate-800 border-slate-700 text-white"
                                        value={bg.opacityPct == null ? "" : String(bg.opacityPct)}
                                        onChange={(e) => setPageBgPercent("opacityPct", e.target.value)}
                                        placeholder="blank=100"
                                    />
                                </div>
                                <div>
                                    <Label className="text-slate-300 text-xs">Blur %</Label>
                                    <Input
                                        className="bg-slate-800 border-slate-700 text-white"
                                        value={bg.blurPct == null ? "" : String(bg.blurPct)}
                                        onChange={(e) => setPageBgPercent("blurPct", e.target.value)}
                                        placeholder="blank=0"
                                    />
                                </div>
                                <div>
                                    <Label className="text-slate-300 text-xs">Brightness %</Label>
                                    <Input
                                        className="bg-slate-800 border-slate-700 text-white"
                                        value={bg.brightnessPct == null ? "" : String(bg.brightnessPct)}
                                        onChange={(e) => setPageBgPercent("brightnessPct", e.target.value)}
                                        placeholder="blank=50"
                                    />
                                </div>
                            </div>

                            <div className="text-xs text-slate-500">Brightness: 50 neutral. Blank opacity=100, blur=0, brightness=50.</div>
                        </div>

                        {/* Selection detail */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-white font-semibold">Selection</div>
                                {selectedIds.length ? <Badge className="bg-slate-700/50 text-slate-200">{selectedIds.length} selected</Badge> : <Badge className="bg-slate-800 text-slate-400">none</Badge>}
                            </div>

                            {!selectedIds.length ? (
                                <div className="text-sm text-slate-500">Click to select • Shift+click multi-select</div>
                            ) : (
                                <div className="space-y-4">
                                    {primarySelected?.type === "text" ? (
                                        <div className="space-y-2">
                                            <Button variant="outline" className="border-slate-700" onClick={() => openTextEditor(primarySelected)}>Edit Text</Button>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <Label className="text-slate-300 text-xs">Line Height</Label>
                                                    <Input className="bg-slate-800 border-slate-700 text-white" value={String(primarySelected.lineHeight ?? 1.25)} onChange={(e) => setTextLineHeight(e.target.value)} />
                                                </div>
                                                <div>
                                                    <Label className="text-slate-300 text-xs">Letter Spacing</Label>
                                                    <Input className="bg-slate-800 border-slate-700 text-white" value={String(primarySelected.letterSpacing ?? 0)} onChange={(e) => setTextLetterSpacing(e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {(primarySelected?.type === "image" || primarySelected?.type === "bg_image") ? (
                                        <div className="space-y-3">
                                            <Button variant="outline" className="border-slate-700" onClick={openCropForSelectedElement}>
                                                <Scissors className="h-4 w-4 mr-2" /> Crop
                                            </Button>

                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <Label className="text-slate-300 text-xs">Opacity %</Label>
                                                    <Input
                                                        className="bg-slate-800 border-slate-700 text-white"
                                                        value={primarySelected.opacityPct == null ? "" : String(primarySelected.opacityPct)}
                                                        onChange={(e) => setSelectedImagePercent("opacityPct", e.target.value)}
                                                        placeholder="blank=100"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-slate-300 text-xs">Blur %</Label>
                                                    <Input
                                                        className="bg-slate-800 border-slate-700 text-white"
                                                        value={primarySelected.blurPct == null ? "" : String(primarySelected.blurPct)}
                                                        onChange={(e) => setSelectedImagePercent("blurPct", e.target.value)}
                                                        placeholder="blank=0"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-slate-300 text-xs">Brightness %</Label>
                                                    <Input
                                                        className="bg-slate-800 border-slate-700 text-white"
                                                        value={primarySelected.brightnessPct == null ? "" : String(primarySelected.brightnessPct)}
                                                        onChange={(e) => setSelectedImagePercent("brightnessPct", e.target.value)}
                                                        placeholder="blank=50"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        {/* Save / Load */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <div className="text-white font-semibold">Save / Load Designs</div>

                            <div>
                                <Label className="text-slate-300">Design name</Label>
                                <Input className="bg-slate-800 border-slate-700 text-white" value={designName} onChange={(e) => setDesignName(e.target.value)} />
                            </div>

                            <Button className="bg-emerald-600 hover:bg-emerald-700" type="button" onClick={saveDesign}>
                                <Save className="h-4 w-4 mr-2" /> Save Design
                            </Button>

                            <div className="pt-2 border-t border-slate-800">
                                <div className="text-sm text-slate-300 font-medium mb-2">My saved designs</div>
                                {loadingDesigns ? (
                                    <div className="text-sm text-slate-500">Loading…</div>
                                ) : designsError ? (
                                    <div className="text-sm text-red-300">{designsError}</div>
                                ) : designs.length === 0 ? (
                                    <div className="text-sm text-slate-500">No saved designs yet.</div>
                                ) : (
                                    <div className="space-y-2 max-h-72 overflow-y-auto">
                                        {designs.slice(0, 50).map((d) => (
                                            <button
                                                key={d.id}
                                                type="button"
                                                onClick={() => loadDesign(d)}
                                                className="w-full text-left rounded-xl border border-slate-800 bg-slate-950/30 hover:bg-slate-900/40 p-3"
                                            >
                                                <div className="text-sm text-white font-medium truncate">{safeText(d.name)}</div>
                                                <div className="text-xs text-slate-500 truncate">{safeText(d?.doc?.docTitle || "Document")}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Completed documents */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                            <div className="text-white font-semibold">Completed Documents (PDF)</div>

                            {loadingCompleted ? (
                                <div className="text-sm text-slate-500">Loading…</div>
                            ) : completedError ? (
                                <div className="text-sm text-red-300">{completedError}</div>
                            ) : completedDocs.length === 0 ? (
                                <div className="text-sm text-slate-500">No completed documents yet.</div>
                            ) : (
                                <div className="space-y-2 max-h-72 overflow-y-auto">
                                    {completedDocs.slice(0, 50).map((c) => (
                                        <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                                            <div className="text-sm text-white font-medium truncate">{safeText(c.title || "Completed Document")}</div>
                                            <div className="mt-2 flex gap-2 flex-wrap">
                                                <Button variant="outline" className="border-slate-700" size="sm" onClick={() => loadCompletedDocument(c)}>
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="border-slate-700"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (!c.pdfUrl) return alert("No PDF URL.");
                                                        window.open(c.pdfUrl, "_blank");
                                                    }}
                                                >
                                                    View PDF
                                                </Button>
                                                <Button
                                                    className="bg-emerald-600 hover:bg-emerald-700"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (!c.pdfUrl) return alert("No PDF URL.");
                                                        pendingShareRef.current = {
                                                            type: "completed_pdf",
                                                            title: safeText(c.title || "Completed Document"),
                                                            attachments: [{ type: "file", url: c.pdfUrl, name: `${safeText(c.title || "Document")}.pdf` }],
                                                        };
                                                        setShareOpen(true);
                                                    }}
                                                >
                                                    <Share2 className="h-4 w-4 mr-2" /> Share PDF
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Good news */}
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                            {goodNewsControls}
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Add Element Dialog */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white">Add Element</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-2">
                        <div>
                            <Label className="text-slate-300">Element type</Label>
                            <Select value={addType} onValueChange={setAddType}>
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    <SelectItem value="text" className="text-white">Text</SelectItem>
                                    <SelectItem value="divider" className="text-white">Divider</SelectItem>
                                    <SelectItem value="image_url" className="text-white">Image (URL)</SelectItem>
                                    <SelectItem value="bg_image_url" className="text-white">Background Image Block (URL)</SelectItem>
                                    <SelectItem value="good_news" className="text-white">Good News Story Card</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {addType === "text" ? (
                            <div>
                                <Label className="text-slate-300">Initial text</Label>
                                <Textarea className="bg-slate-800 border-slate-700 text-white" rows={5} value={tempText} onChange={(e) => setTempText(e.target.value)} placeholder="Optional…" />
                            </div>
                        ) : null}

                        {addType === "image_url" || addType === "bg_image_url" ? (
                            <div className="space-y-2">
                                <Label className="text-slate-300">Image URL</Label>
                                <Input className="bg-slate-800 border-slate-700 text-white" value={tempImageUrl} onChange={(e) => setTempImageUrl(e.target.value)} placeholder="https://..." />
                            </div>
                        ) : null}

                        {addType === "good_news" ? (
                            <div className="space-y-3">
                                {goodNewsControls}
                                <div className="space-y-2">
                                    <Label className="text-slate-300">Select story</Label>
                                    <Select value={selectedStoryId} onValueChange={setSelectedStoryId} disabled={!storiesEnabled || loadingStories || storiesIsError}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue placeholder={!storiesEnabled ? "Select source first" : loadingStories ? "Loading..." : "Select a story"} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {(stories || []).slice(0, 300).map((s) => (
                                                <SelectItem key={s.id} value={s.id} className="text-white">
                                                    {safeText(s.title)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" className="border-slate-700" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
                            <Button className="bg-blue-600 hover:bg-blue-700" type="button" onClick={addElement}>
                                <Plus className="h-4 w-4 mr-2" /> Add
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Text Editor Dialog */}
            <Dialog open={editTextOpen} onOpenChange={setEditTextOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white">Edit Text</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 mt-2">
                        <Textarea className="bg-slate-800 border-slate-700 text-white" rows={10} value={editTextValue} onChange={(e) => setEditTextValue(e.target.value)} />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" className="border-slate-700" onClick={() => setEditTextOpen(false)}>Cancel</Button>
                            <Button className="bg-blue-600 hover:bg-blue-700" onClick={applyTextEditor}>Apply</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Crop Dialog */}
            <CropEditorDialog
                open={cropOpen}
                onOpenChange={setCropOpen}
                imageUrl={cropUrl}
                initialCropNorm={cropInitial}
                onApply={applyCrop}
            />

            {/* Share Dialog */}
            <Dialog open={shareOpen} onOpenChange={(v) => { setShareOpen(v); if (!v) pendingShareRef.current = null; }}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white">Share to Forum</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-2">
                        {channels.length === 0 ? (
                            <div className="text-sm text-slate-500">No active forum channels found.</div>
                        ) : (
                            <div>
                                <Label className="text-slate-300">Channel</Label>
                                <Select value={channelId} onValueChange={setChannelId}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white"><SelectValue placeholder="Select channel" /></SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {channels.map((c) => (
                                            <SelectItem key={c.id} value={c.id} className="text-white">{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <Button
                            className="w-full bg-emerald-600 hover:bg-emerald-700"
                            type="button"
                            onClick={() => {
                                const pending = pendingShareRef.current;
                                if (!pending) return alert("Click 'Share PDF' from a Completed Document first.");
                                return shareToForum(pending);
                            }}
                            disabled={sharing || !channelId}
                        >
                            {sharing ? "Sharing..." : "Share"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
