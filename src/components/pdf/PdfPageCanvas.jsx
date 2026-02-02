// src/components/pdf/PdfPageCanvas.jsx
import React, { useEffect, useRef } from "react";

/**
 * PdfPageCanvas
 * Renders a single PDF page into a canvas using pdf.js page.render()
 *
 * Props:
 * - pdf: pdf.js document (from pdfjsLib.getDocument().promise)
 * - pageIndex: 1-based page number (pdf.js uses 1..N)
 * - scale: number (zoom)
 * - onSize: function({ w, h }) called after canvas is sized (pixels)
 */
export default function PdfPageCanvas({ pdf, pageIndex, scale = 1.0, onSize }) {
    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!pdf || !canvasRef.current || !pageIndex) return;

            // cancel any in-flight render on the same canvas
            try {
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }
            } catch (_) {
                // ignore
            }

            try {
                const page = await pdf.getPage(Number(pageIndex));
                if (cancelled) return;

                const viewport = page.getViewport({ scale });
                const canvas = canvasRef.current;
                const ctx = canvas.getContext("2d");

                const w = Math.floor(viewport.width);
                const h = Math.floor(viewport.height);

                canvas.width = w;
                canvas.height = h;

                if (typeof onSize === "function") onSize({ w, h });

                const task = page.render({ canvasContext: ctx, viewport });
                renderTaskRef.current = task;

                await task.promise;
                renderTaskRef.current = null;
            } catch (e) {
                // pdf.js throws on cancel, safe to ignore
                if (String(e?.name || "").toLowerCase().includes("rendercancelled")) return;
                console.error("PdfPageCanvas render error:", e);
            }
        }

        run();

        return () => {
            cancelled = true;
            try {
                if (renderTaskRef.current) {
                    renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }
            } catch (_) {
                // ignore
            }
        };
    }, [pdf, pageIndex, scale, onSize]);

    return <canvas ref={canvasRef} className="block rounded-lg" />;
}
