/**
 * functions/pdf/render.js
 *
 * Pure PDF renderer using pdf-lib.
 *
 * Supports:
 * - New schema rect: { x, y, w, h } where origin is TOP-LEFT (pdf.js viewport units).
 * - Legacy schema: { x, y } already in PDF coordinate space (BOTTOM-LEFT).
 */
"use strict";

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { cleanText, isTruthy } = require("./mapping");

function isDataUrl(s) {
  return typeof s === "string" && s.startsWith("data:image/");
}

function decodeDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:(.+?);base64,(.+)$/);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

function coerceRect(f) {
  if (f?.rect && typeof f.rect === "object") return f.rect;
  const x = Number(f?.x ?? 0);
  const y = Number(f?.y ?? 0);
  const w = Number(f?.w ?? f?.width ?? 220);
  const h = Number(f?.h ?? f?.height ?? 28);
  return { x, y, w, h };
}

function toPdfLibCoords({ rect, pageHeight, legacy }) {
  const x = Number(rect?.x ?? 0);
  const yTop = Number(rect?.y ?? 0);
  const w = Number(rect?.w ?? 0);
  const h = Number(rect?.h ?? 0);

  if (legacy) return { x, y: yTop, w, h };
  const y = pageHeight - yTop - h;
  return { x, y, w, h };
}

function wrapText(font, text, size, maxWidth) {
  const words = cleanText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";

  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderPdfWithSchema({ templatePdfBytes, schema, filledData, signatureInput }) {
  const pdfDoc = await PDFDocument.load(templatePdfBytes);
  const pages = pdfDoc.getPages();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const safeSchema = Array.isArray(schema) ? schema : [];
  const pageNums = safeSchema.map((f) => Number(f?.page ?? f?.page_index ?? 0)).filter((n) => Number.isFinite(n));
  const hasZero = pageNums.some((n) => n === 0);
  const minPage = pageNums.length ? Math.min(...pageNums) : 0;
  const schemaPagesAreOneBased = !hasZero && minPage >= 1;

  const values = filledData && typeof filledData === "object" ? filledData : {};

  let signatureBytes = null;
  if (Buffer.isBuffer(signatureInput)) signatureBytes = signatureInput;
  else if (isDataUrl(signatureInput)) signatureBytes = decodeDataUrl(signatureInput);
  else if (signatureInput && typeof signatureInput === "object" && Buffer.isBuffer(signatureInput.bytes)) {
    signatureBytes = signatureInput.bytes;
  }

  let signaturePng = null;
  if (signatureBytes) {
    try {
      signaturePng = await pdfDoc.embedPng(signatureBytes);
    } catch (_) {
      // ignore invalid signature input
    }
  }

  for (const f of safeSchema) {
    const type = String(f?.type || "text").toLowerCase();
    const fieldId = cleanText(f?.id || f?.key);
    if (!fieldId) continue;

    const rawPage = Number(f?.page ?? f?.page_index ?? 0);
    const pageIndex = schemaPagesAreOneBased ? Math.max(0, rawPage - 1) : Math.max(0, rawPage);
    if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const pageHeight = page.getHeight();
    const legacy = !f?.rect;

    const rect = coerceRect(f);
    const { x, y, w, h } = toPdfLibCoords({ rect, pageHeight, legacy });

    if (type === "signature") {
      if (!signaturePng) continue;
      page.drawImage(signaturePng, { x, y, width: w || 180, height: h || 60 });
      continue;
    }

    const raw = values[fieldId];
    const text = cleanText(raw);
    if (!text) continue;

    if (type === "checkbox") {
      if (!isTruthy(raw)) continue;
      const size = Math.min(Math.max(Number(f?.fontSize ?? f?.size ?? 14), 10), 18);
      const mark = "X";
      const tx = x + Math.max(2, (w - font.widthOfTextAtSize(mark, size)) / 2);
      const ty = y + Math.max(2, (h - size) / 2);
      page.drawText(mark, { x: tx, y: ty, size, font: bold, color: rgb(0, 0, 0) });
      continue;
    }

    const size = Number(f?.fontSize ?? f?.size ?? 11);
    const padX = 2;
    const padY = 2;
    const maxWidth = Math.max(0, (w || 220) - padX * 2);

    if (type === "textarea") {
      const lines = wrapText(font, text, size, maxWidth);
      const lineHeight = size * 1.2;
      const maxLines = Math.max(1, Math.floor(((h || 60) - padY * 2) / lineHeight));
      const clipped = lines.slice(0, maxLines);

      let ty = y + (h || 60) - padY - size;
      for (const line of clipped) {
        page.drawText(line, { x: x + padX, y: ty, size, font, color: rgb(0, 0, 0) });
        ty -= lineHeight;
      }
      continue;
    }

    const ty = y + Math.max(padY, ((h || 28) - size) / 2);
    page.drawText(text, { x: x + padX, y: ty, size, font, color: rgb(0, 0, 0) });
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = {
  renderPdfWithSchema,
};
