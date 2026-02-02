// =================================================================================================
// File: src/businessUnits/pageRegistry.js
// =================================================================================================
import React from "react";

const lazy = (fn) => React.lazy(fn);

// --------------------
// CASEWORK
// --------------------
const CASEWORK = {
    Dashboard: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/Dashboard.jsx")),
    Participants: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/Participants.jsx")),
    Programs: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/Programs.jsx")),
    CaseNotes: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/CaseNotes.jsx")),
    EmployerAcademy: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/EmployerAcademy.jsx")),
    JobBlast: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/JobBlast.jsx")),
    MonthlyReports: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/MonthlyReports.jsx")),
    Reports: lazy(() => import("@/businessUnits/CASEWORK/pages/dashboard/Reports.jsx")),

    ParticipantDetail: lazy(() => import("@/businessUnits/CASEWORK/pages/detailed/ParticipantDetail.jsx")),
    ProgramDetail: lazy(() => import("@/businessUnits/CASEWORK/pages/detailed/ProgramDetail.jsx")),
    CaseNoteDetail: lazy(() => import("@/businessUnits/CASEWORK/pages/detailed/CaseNoteDetail.jsx")),
    EmployerDetail: lazy(() => import("@/businessUnits/CASEWORK/pages/detailed/EmployerDetail.jsx")),
    LSIRReport: lazy(() => import("@/businessUnits/CASEWORK/pages/detailed/LSIRReport.jsx")),
    ReportView: lazy(() => import("@/businessUnits/CASEWORK/pages/detailed/ReportView.jsx")),
    PdfFormDetail: lazy(() => import("@/businessUnits/CASEWORK/pages/detailed/PdfFormDetail.jsx")),

    ParticipantForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/ParticipantForm.jsx")),
    ParticipantRequest: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/ParticipantRequest.jsx")),
    ProgramForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/ProgramForm.jsx")),
    CaseNoteForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/CaseNoteForm.jsx")),
    SurveyForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/SurveyForm.jsx")),
    FundingForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/FundingForm.jsx")),
    TrainingForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/TrainingForm.jsx")),
    TrainingBulkComplete: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/TrainingBulkComplete.jsx")),
    EmploymentForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/EmploymentForm.jsx")),
    EmployerForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/EmployerForm.jsx")),
    SurveyBuilder: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/SurveyBuilder.jsx")),
    SurveyTemplateForm: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/SurveyTemplateForm.jsx")),
    ResumeBuilder: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/ResumeBuilder.jsx")),
    PdfForms: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/PdfForms.jsx")),
    PdfFormFill: lazy(() => import("@/businessUnits/CASEWORK/pages/forms/PdfFormFill.jsx")),

    Forum: lazy(() => import("@/businessUnits/CASEWORK/pages/Forum.jsx")),
    Tasks: lazy(() => import("@/businessUnits/CASEWORK/pages/Tasks.jsx")),
    Notifications: lazy(() => import("@/businessUnits/CASEWORK/pages/Notifications.jsx")),
    Resources: lazy(() => import("@/businessUnits/CASEWORK/pages/Resources.jsx")),
    ReportBuilder: lazy(() => import("@/businessUnits/CASEWORK/pages/ReportBuilder.jsx")),
    WorkflowApprovals: lazy(() => import("@/businessUnits/CASEWORK/pages/WorkflowApprovals.jsx")),
    DocumentDesigner: lazy(() => import("@/businessUnits/CASEWORK/pages/DocumentDesigner.jsx")),
    PdfTemplateAdmin: lazy(() => import("@/businessUnits/CASEWORK/pages/PdfTemplateAdmin.jsx")),
    PdfPacketReview: lazy(() => import("@/businessUnits/CASEWORK/pages/PdfPacketReview.jsx")),
    ManagerApprovalReview: lazy(() => import("@/businessUnits/CASEWORK/pages/ManagerApprovalReview.jsx")),
    ProgramEmail: lazy(() => import("@/businessUnits/CASEWORK/pages/ProgramEmail.jsx")),
};

// --------------------
// PROGRAMS
// --------------------
const PROGRAMS = {
    Dashboard: lazy(() => import("@/businessUnits/PROGRAMS/pages/dashboard/Dashboard.jsx")),
    Participants: lazy(() => import("@/businessUnits/PROGRAMS/pages/dashboard/Participants.jsx")),
    Programs: lazy(() => import("@/businessUnits/PROGRAMS/pages/dashboard/Programs.jsx")),
    EmployerAcademy: lazy(() => import("@/businessUnits/PROGRAMS/pages/dashboard/EmployerAcademy.jsx")),
    JobBlast: lazy(() => import("@/businessUnits/PROGRAMS/pages/dashboard/JobBlast.jsx")),
    MonthlyReports: lazy(() => import("@/businessUnits/PROGRAMS/pages/dashboard/MonthlyReports.jsx")),
    Reports: lazy(() => import("@/businessUnits/PROGRAMS/pages/dashboard/Reports.jsx")),

    ParticipantDetail: lazy(() => import("@/businessUnits/PROGRAMS/pages/detailed/ParticipantDetail.jsx")),
    ProgramDetail: lazy(() => import("@/businessUnits/PROGRAMS/pages/detailed/ProgramDetail.jsx")),
    EmployerDetail: lazy(() => import("@/businessUnits/PROGRAMS/pages/detailed/EmployerDetail.jsx")),
    ReportView: lazy(() => import("@/businessUnits/PROGRAMS/pages/detailed/ReportView.jsx")),
    PdfFormDetail: lazy(() => import("@/businessUnits/PROGRAMS/pages/detailed/PdfFormDetail.jsx")),

    ParticipantForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/ParticipantForm.jsx")),
    ParticipantRequest: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/ParticipantRequest.jsx")),
    ProgramForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/ProgramForm.jsx")),
    SurveyForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/SurveyForm.jsx")),
    FundingForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/FundingForm.jsx")),
    TrainingForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/TrainingForm.jsx")),
    TrainingBulkComplete: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/TrainingBulkComplete.jsx")),
    EmploymentForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/EmploymentForm.jsx")),
    EmployerForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/EmployerForm.jsx")),
    SurveyBuilder: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/SurveyBuilder.jsx")),
    SurveyTemplateForm: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/SurveyTemplateForm.jsx")),
    ResumeBuilder: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/ResumeBuilder.jsx")),
    PdfForms: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/PdfForms.jsx")),
    PdfFormFill: lazy(() => import("@/businessUnits/PROGRAMS/pages/forms/PdfFormFill.jsx")),

    Forum: lazy(() => import("@/businessUnits/PROGRAMS/pages/Forum.jsx")),
    Tasks: lazy(() => import("@/businessUnits/PROGRAMS/pages/Tasks.jsx")),
    Notifications: lazy(() => import("@/businessUnits/PROGRAMS/pages/Notifications.jsx")),
    Resources: lazy(() => import("@/businessUnits/PROGRAMS/pages/Resources.jsx")),
    ReportBuilder: lazy(() => import("@/businessUnits/PROGRAMS/pages/ReportBuilder.jsx")),
    WorkflowApprovals: lazy(() => import("@/businessUnits/PROGRAMS/pages/WorkflowApprovals.jsx")),
    DocumentDesigner: lazy(() => import("@/businessUnits/PROGRAMS/pages/DocumentDesigner.jsx")),
    PdfTemplateAdmin: lazy(() => import("@/businessUnits/PROGRAMS/pages/PdfTemplateAdmin.jsx")),
    PdfPacketReview: lazy(() => import("@/businessUnits/PROGRAMS/pages/PdfPacketReview.jsx")),
    ManagerApprovalReview: lazy(() => import("@/businessUnits/PROGRAMS/pages/ManagerApprovalReview.jsx")),
    ProgramEmail: lazy(() => import("@/businessUnits/PROGRAMS/pages/ProgramEmail.jsx")),
};

// --------------------
// RTO (lead-gen pages present in your tree)
// Keys must match index.jsx routes: Intakes, Campaigns, Leads
// --------------------
const RTO = {
    Dashboard: lazy(() => import("@/businessUnits/RTO/pages/dashboard/Dashboard.jsx")),
    Intakes: lazy(() => import("@/businessUnits/RTO/pages/intakes/IntakesPage.jsx")),
    Campaigns: lazy(() => import("@/businessUnits/RTO/pages/campaigns/CampaignBuilder.jsx")),
    Leads: lazy(() => import("@/businessUnits/RTO/pages/leads/LeadsDashboard.jsx")),
};

// --------------------
// LABOURHIRE (entity dashboard inside main Layout)
// WF Connect portals are mounted at /labourhire/* in src/pages/index.jsx
// --------------------
const LABOURHIRE = {
    Dashboard: lazy(() => import("@/businessUnits/LABOURHIRE/pages/dashboard/Dashboard.jsx")),
};

export const PAGE_REGISTRY = {
    CASEWORK,
    PROGRAMS,
    RTO,
    LABOURHIRE,
};

export function resolveUnitPage(entityType, pageName) {
    const type = String(entityType || "").toUpperCase();
    return PAGE_REGISTRY?.[type]?.[pageName] || null;
}