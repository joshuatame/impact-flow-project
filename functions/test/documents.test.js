"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDocumentRecord } = require("../pdf/documents");

test("buildDocumentRecord produces a stable Document payload", () => {
  const instance = {
    id: "inst1",
    template_name: "Consent Form",
    document_category: "Consent",
    completed_pdf_url: "https://example.com/file.pdf",
    completed_pdf_storage_path: "pdf_forms/wr/inst1.pdf",
  };

  const doc = buildDocumentRecord({ instance, participantId: "p1" });

  assert.equal(doc.linked_participant_id, "p1");
  assert.equal(doc.category, "Consent");
  assert.equal(doc.file_type, "application/pdf");
  assert.equal(doc.source_pdf_form_instance_id, "inst1");
  assert.ok(String(doc.file_name).includes("Consent_Form"));
});
