"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { PDFDocument } = require("pdf-lib");
const { renderPdfWithSchema } = require("../pdf/render");

test("renderPdfWithSchema returns a valid PDF buffer", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const baseBytes = Buffer.from(await doc.save());

  const schema = [
    {
      id: "full_name",
      type: "text",
      page: 0,
      rect: { x: 50, y: 50, w: 300, h: 28 },
      fontSize: 12,
    },
  ];

  const out = await renderPdfWithSchema({
    templatePdfBytes: baseBytes,
    schema,
    filledData: { full_name: "Ada Lovelace" },
    signatureInput: null,
  });

  assert.ok(Buffer.isBuffer(out));
  assert.ok(out.length > 500);
});
