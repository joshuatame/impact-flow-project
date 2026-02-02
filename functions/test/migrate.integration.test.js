"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const { migratePdfFormsCore } = require("../pdf/migrate");

function ensureEmulatorEnv() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Run via firebase emulators:exec so FIRESTORE_EMULATOR_HOST is set.");
  }
}

test("migratePdfFormsCore creates Document records for completed instances (emulator)", async () => {
  ensureEmulatorEnv();

  const app = initializeApp({ projectId: "demo-impact-flow" }, "testapp");
  const db = getFirestore(app);

  const workflowRequestId = "wr_test_1";
  const participantId = "p_test_1";

  await db.collection("WorkflowRequest").doc(workflowRequestId).set({
    status: "Approved",
    participant_data: { first_name: "Ada", last_name: "Lovelace" },
    created_at: FieldValue.serverTimestamp(),
  });

  await db.collection("PdfFormInstance").doc("inst_test_1").set({
    workflow_request_id: workflowRequestId,
    template_name: "Consent Form",
    document_category: "Consent",
    status: "Completed",
    completed_pdf_url: "https://example.com/tokenized.pdf",
    completed_pdf_storage_path: "pdf_forms/wr_test_1/inst_test_1.pdf",
  });

  const res = await migratePdfFormsCore({ db, FieldValue, workflowRequestId, participantId });
  assert.equal(res.ok, true);
  assert.equal(res.migrated, 1);
  assert.equal(res.documentsCreated, 1);

  const docs = await db.collection("Document").where("linked_participant_id", "==", participantId).get();
  assert.equal(docs.size, 1);
  const d = docs.docs[0].data();
  assert.equal(d.category, "Consent");
  assert.equal(d.source_pdf_form_instance_id, "inst_test_1");
});
