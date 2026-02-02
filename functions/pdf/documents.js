/**
 * functions/pdf/documents.js
 *
 * Pure helpers for creating Document records from completed PDF instances.
 */
"use strict";

function safeFileName(name) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_");
}

function buildDocumentRecord({ instance, participantId }) {
  const inst = instance || {};
  const cat = inst.document_category || inst.category || "Other";
  const fileNameSafe = `${safeFileName(inst.template_name || "PDF_Form")}.pdf`;

  return {
    file_name: fileNameSafe,
    file_type: "application/pdf",
    file_url: inst.completed_pdf_url || null,
    storage_path: inst.completed_pdf_storage_path || null,
    linked_participant_id: participantId,
    category: cat,
    description: `Completed PDF form: ${inst.template_name || "PDF Form"}`,
    source_pdf_form_instance_id: inst.id || inst.instanceId || null,
  };
}

module.exports = {
  buildDocumentRecord,
  safeFileName,
};
