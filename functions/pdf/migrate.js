/**
 * functions/pdf/migrate.js
 *
 * Core migration logic used by callable migratePdfForms and emulator integration tests.
 */
"use strict";

const { buildDocumentRecord } = require("./documents");

async function migratePdfFormsCore({ db, FieldValue, workflowRequestId, participantId }) {
  const snap = await db.collection("PdfFormInstance").where("workflow_request_id", "==", workflowRequestId).get();
  if (snap.empty) return { ok: true, migrated: 0, documentsCreated: 0 };

  let migrated = 0;
  let documentsCreated = 0;

  for (const docSnap of snap.docs) {
    const inst = { id: docSnap.id, ...docSnap.data() };

    await db
      .collection("PdfFormInstance")
      .doc(inst.id)
      .set(
        {
          participant_id: participantId,
          status: inst.status === "Completed" ? "Migrated" : inst.status,
          migrated_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    migrated += 1;

    if (inst.completed_pdf_url && inst.completed_pdf_storage_path) {
      const existing = await db
        .collection("Document")
        .where("source_pdf_form_instance_id", "==", inst.id)
        .where("linked_participant_id", "==", participantId)
        .limit(1)
        .get();

      if (existing.empty) {
        await db.collection("Document").add({
          ...buildDocumentRecord({ instance: inst, participantId }),
          created_at: FieldValue.serverTimestamp(),
          updated_at: FieldValue.serverTimestamp(),
        });
        documentsCreated += 1;
      }
    }
  }

  return { ok: true, migrated, documentsCreated };
}

module.exports = { migratePdfFormsCore };
