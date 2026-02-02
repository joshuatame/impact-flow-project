// src/lib/workflows/pdfWorkflowRequests.js
import { base44 } from "@/api/base44Client";

// Returns { required_instance_ids: [], optional_templates: [] }
export async function generateParticipantPdfPacket({ workflowRequestId }) {
    return base44.functions.generateParticipantPdfPacket({ workflowRequestId });
}

// Caseworker adds optional template
export async function addOptionalPdfInstance({ workflowRequestId, templateId }) {
    return base44.functions.addOptionalPdfInstance({ workflowRequestId, templateId });
}
