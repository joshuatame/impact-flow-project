"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveMapKey, computeFilledData, formatDateAU } = require("../pdf/mapping");

test("formatDateAU formats YYYY-MM-DD to DD/MM/YYYY", () => {
  assert.equal(formatDateAU("2025-01-09"), "09/01/2025");
});

test("resolveMapKey resolves Participant and computed keys", () => {
  const workflowRequest = {
    participant_data: { first_name: "Ada", last_name: "Lovelace", date_of_birth: "1815-12-10" },
  };
  const caller = { full_name: "Case Worker", email: "cw@example.com" };

  assert.equal(
    resolveMapKey("Participant.first_name", { workflowRequest, participant: workflowRequest.participant_data, caller }),
    "Ada"
  );
  assert.equal(
    resolveMapKey("computed.full_name", { workflowRequest, participant: workflowRequest.participant_data, caller }),
    "Ada Lovelace"
  );
  assert.equal(
    resolveMapKey("computed.dob_au", { workflowRequest, participant: workflowRequest.participant_data, caller }),
    "10/12/1815"
  );
  assert.equal(
    resolveMapKey("User.email", { workflowRequest, participant: workflowRequest.participant_data, caller }),
    "cw@example.com"
  );
});

test("computeFilledData prefers manual values when editable_after_prefill", () => {
  const schema = [
    { id: "fn", type: "text", map_key: "Participant.first_name", editable_after_prefill: true },
    { id: "ln", type: "text", map_key: "Participant.last_name", editable_after_prefill: false },
    { id: "note", type: "textarea", map_key: "__manual__" },
  ];

  const workflowRequest = { participant_data: { first_name: "Ada", last_name: "Lovelace" } };
  const caller = { full_name: "Case Worker" };

  const filled = computeFilledData({
    schema,
    manualValues: { fn: "Overridden", note: "Manual note" },
    instance: { values: {} },
    workflowRequest,
    caller,
  });

  assert.equal(filled.fn, "Overridden");
  assert.equal(filled.ln, "Lovelace");
  assert.equal(filled.note, "Manual note");
});
