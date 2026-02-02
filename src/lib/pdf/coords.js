// src/lib/pdf/coords.js
// We store field.rect in PDF "viewport" units derived from pdf.js at scale=1.
// Origin is TOP-LEFT (same as viewport). This keeps math consistent.

export function pdfUnitsToPxRect({ x, y, w, h, scale }) {
    return {
        xPx: x * scale,
        yPx: y * scale,
        wPx: w * scale,
        hPx: h * scale,
    };
}

export function pxToPdfUnitsRect({ xPx, yPx, wPx, hPx, scale }) {
    return {
        x: xPx / scale,
        y: yPx / scale,
        w: wPx / scale,
        h: hPx / scale,
    };
}
