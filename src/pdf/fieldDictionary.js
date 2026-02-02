// src/pdf/fieldDictionary.js
// This is the "array of forms" + "DB fields" that admins can pick from in the designer.
// Expand as needed. Keep keys stable because templates will map to these.

export const WORKFLOW_EVENT_TYPES = [
    { value: "NEW_PARTICIPANT_REQUEST", label: "New Participant Request" },
    { value: "PROGRAM_ENROLLED", label: "Program Enrolled" },
];

// Field dictionary per event type.
// Each "source" has "fields" with a stable key and a human label.
// "path" is informational for your backend mapping (optional).
export const FIELD_DICTIONARY = {
    NEW_PARTICIPANT_REQUEST: [
        {
            source: "participant",
            label: "Participant",
            fields: [
                { key: "first_name", label: "First Name", path: "Participant.first_name" },
                { key: "last_name", label: "Last Name", path: "Participant.last_name" },
                { key: "full_name", label: "Full Name", path: "Participant.full_name" },
                { key: "date_of_birth", label: "Date of Birth", path: "Participant.date_of_birth" },
                { key: "email", label: "Email", path: "Participant.email" },
                { key: "phone", label: "Phone", path: "Participant.phone" },
                { key: "address", label: "Address", path: "Participant.address" },
                { key: "suburb", label: "Suburb", path: "Participant.suburb" },
                { key: "state", label: "State", path: "Participant.state" },
                { key: "postcode", label: "Postcode", path: "Participant.postcode" },
            ],
        },
        {
            source: "workflow_request",
            label: "Workflow Request",
            fields: [
                { key: "request_id", label: "Request ID", path: "WorkflowRequest.id" },
                { key: "submitted_by_name", label: "Submitted By (Name)", path: "WorkflowRequest.submitted_by_name" },
                { key: "submitted_by_email", label: "Submitted By (Email)", path: "WorkflowRequest.submitted_by_email" },
                { key: "submitted_date", label: "Submitted Date", path: "WorkflowRequest.created_date" },
            ],
        },
        {
            source: "program",
            label: "Program",
            fields: [
                { key: "program_name", label: "Program Name", path: "Program.program_name" },
                { key: "intake_name", label: "Intake Name", path: "ProgramIntake.intake_name" },
            ],
        },
    ],

    PROGRAM_ENROLLED: [
        {
            source: "participant",
            label: "Participant",
            fields: [
                { key: "full_name", label: "Full Name", path: "Participant.full_name" },
                { key: "email", label: "Email", path: "Participant.email" },
            ],
        },
        {
            source: "program",
            label: "Program",
            fields: [
                { key: "program_name", label: "Program Name", path: "Program.program_name" },
            ],
        },
    ],
};

export function getSourcesForEvent(eventType) {
    return FIELD_DICTIONARY[eventType] || [];
}

export function getFieldsForSource(eventType, source) {
    const sources = getSourcesForEvent(eventType);
    const s = sources.find((x) => x.source === source);
    return s?.fields || [];
}
