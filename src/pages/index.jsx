/**************************************************************************************************
 * FILE: src/pages/index.jsx  (REPLACE ENTIRE FILE)
 * Fix:
 * - LabourHire routes must NOT be under NoSidebarWrapper.
 * - Put /labourhire/* under LayoutRouteWrapper so it always has the sidebar.
 * - Remove the duplicate /labourhire/* route under RequireOnboarded.
 * - Add /SystemAdmin/* portal under LayoutRouteWrapper (SystemAdmin only), no entity selection required.
 **************************************************************************************************/
import React, { useEffect, useState } from "react";
import { Routes, Route, Outlet, useLocation, Navigate } from "react-router-dom";

import Layout from "./Layout.jsx";

import { getActiveEntity } from "@/lib/activeEntity";
import BusinessUnitPage from "@/businessUnits/BusinessUnitPage.jsx";
import AdminRouter from "@/businessUnits/admin/AdminRouter.jsx";
import LabourHireRouter from "@/businessUnits/LABOURHIRE/routes/LabourHireRouter.jsx";

import { auth } from "@/firebase";

import EnquiryForm from "@/public/EnquiryForm.jsx";
import RedirectRoute from "./RedirectRoute.jsx";

import Login from "./Login.jsx";
import OnboardingPending from "./OnboardingPending.jsx";
import Landing from "./Landing.jsx";
import Launchpad from "./Launchpad.jsx";
import Settings from "./Settings.jsx";
import BusinessEntitiesAdmin from "./BusinessEntitiesAdmin.jsx";

import RequireAuth from "@/components/auth/RequireAuth";
import RequireOnboarded from "@/components/auth/RequireOnboarded";
import RequireEntitySelected from "@/components/auth/RequireEntitySelected";

// ✅ SystemAdmin portal
import RequireSystemAdmin from "@/components/auth/RequireSystemAdmin";
import SystemAdminRouter from "./systemAdmin/SystemAdminRouter.jsx";

import CW_JobBlastApply from "@/businessUnits/CASEWORK/public/JobBlastApply.jsx";
import PR_JobBlastApply from "@/businessUnits/PROGRAMS/public/JobBlastApply.jsx";
import CW_PublicReply from "@/businessUnits/CASEWORK/pages/PublicReply.jsx";
import PR_PublicReply from "@/businessUnits/PROGRAMS/pages/PublicReply.jsx";

function getEntityTypeUpper() {
    const active = getActiveEntity();
    return String(active?.type || "CASEWORK").toUpperCase();
}

function NotAvailable({
    title = "Not available",
    subtitle = "This screen is not available for the selected business unit.",
}) {
    return (
        <div className="p-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="text-white font-semibold">{title}</div>
                <div className="text-slate-400 text-sm mt-1">{subtitle}</div>
            </div>
        </div>
    );
}

function BusinessUnitPublicRoute({ casework: CaseworkComp, programs: ProgramsComp, fallback, notAvailableTitle }) {
    const type = getEntityTypeUpper();

    const Comp =
        (type === "CASEWORK" && CaseworkComp) ||
        (type === "PROGRAMS" && ProgramsComp) ||
        fallback ||
        null;

    if (!Comp) return <NotAvailable title={notAvailableTitle || "Not available"} />;
    return <Comp />;
}

const PAGES = {
    Dashboard: true,
    Participants: true,
    Programs: true,
    Intakes: true,
    Campaigns: true,
    Leads: true,
    ParticipantDetail: true,
    ParticipantForm: true,
    ParticipantRequest: true,
    ProgramForm: true,
    ProgramDetail: true,
    CaseNoteForm: true,
    CaseNoteDetail: true,
    SurveyForm: true,
    SurveyBuilder: true,
    SurveyTemplateForm: true,
    FundingForm: true,
    TrainingForm: true,
    TrainingBulkComplete: true,
    EmploymentForm: true,
    EmployerAcademy: true,
    EmployerDetail: true,
    EmployerForm: true,
    Reports: true,
    ReportBuilder: true,
    ReportView: true,
    LSIRReport: true,
    CaseNotes: true,
    Tasks: true,
    Forum: true,
    Notifications: true,
    Resources: true,
    JobBlast: true,
    MonthlyReports: true,
    ProgramEmail: true,
    ResumeBuilder: true,
    PdfForms: true,
    PdfFormFill: true,
    PdfTemplateAdmin: true,
    PdfPacketReview: true,
    PdfFormDetail: true,
    ManagerApprovalReview: true,
    WorkflowApprovals: true,
    DocumentDesigner: true,
    BusinessEntitiesAdmin: true,
    Admin: true,
    Settings: true,
};

function getCurrentPageName(pathname) {
    let path = pathname || "";
    if (path.endsWith("/")) path = path.slice(0, -1);
    const last = path.split("/").pop() || "Dashboard";
    const match = Object.keys(PAGES).find((name) => name.toLowerCase() === last.toLowerCase());
    return match || "Dashboard";
}

function LayoutRouteWrapper() {
    const location = useLocation();
    const currentPageName = getCurrentPageName(location.pathname);

    return (
        <Layout currentPageName={currentPageName}>
            <Outlet />
        </Layout>
    );
}

function NoSidebarWrapper() {
    return <Outlet />;
}

function mapPortalToPath(portal) {
    const p = String(portal || "").toLowerCase();
    if (p === "manager") return "/labourhire/manager/dashboard";
    if (p === "company") return "/labourhire/company/dashboard";
    if (p === "candidate") return "/labourhire/candidate/profile";
    return "/labourhire";
}

function DashboardDispatch() {
    const active = getActiveEntity();
    const type = String(active?.type || "").toUpperCase();

    const [dest, setDest] = useState(null);

    useEffect(() => {
        let alive = true;

        async function resolve() {
            if (type !== "LABOURHIRE") {
                setDest(null);
                return;
            }

            try {
                const u = auth.currentUser;
                if (!u) {
                    if (alive) setDest("/labourhire");
                    return;
                }

                const token = await u.getIdTokenResult(true);
                const portal = token?.claims?.wfConnectPortal || null;

                if (alive) setDest(mapPortalToPath(portal));
            } catch {
                if (alive) setDest("/labourhire");
            }
        }

        resolve();
        return () => {
            alive = false;
        };
    }, [type]);

    if (type !== "LABOURHIRE") return <BusinessUnitPage page="Dashboard" />;

    if (!dest) return null;
    return <Navigate to={dest} replace />;
}

export default function Pages() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/enquiry" element={<EnquiryForm />} />
            <Route path="/r/:code" element={<RedirectRoute />} />

            <Route
                path="/JobBlastApply"
                element={<BusinessUnitPublicRoute casework={CW_JobBlastApply} programs={PR_JobBlastApply} />}
            />
            <Route
                path="/job-apply"
                element={<BusinessUnitPublicRoute casework={CW_JobBlastApply} programs={PR_JobBlastApply} />}
            />
            <Route
                path="/reply"
                element={<BusinessUnitPublicRoute casework={CW_PublicReply} programs={PR_PublicReply} />}
            />

            <Route element={<RequireAuth />}>
                {/* ✅ Labourhire MUST have sidebar -> wrap with Layout */}
                <Route element={<LayoutRouteWrapper />}>
                    <Route path="/labourhire/*" element={<LabourHireRouter />} />
                </Route>

                {/* ✅ SystemAdmin MUST have sidebar -> wrap with Layout (no entity selection required) */}
                <Route element={<RequireSystemAdmin />}>
                    <Route element={<LayoutRouteWrapper />}>
                        <Route path="/SystemAdmin/*" element={<SystemAdminRouter />} />
                    </Route>
                </Route>

                {/* Still no-sidebar for onboarding pending (your choice) */}
                <Route element={<NoSidebarWrapper />}>
                    <Route path="/OnboardingPending" element={<OnboardingPending />} />
                </Route>

                <Route element={<RequireOnboarded />}>
                    <Route element={<NoSidebarWrapper />}>
                        <Route path="/" element={<Landing />} />
                        <Route path="/Landing" element={<Landing />} />
                        <Route path="/Launchpad" element={<Launchpad />} />
                    </Route>

                    <Route element={<RequireEntitySelected />}>
                        <Route element={<LayoutRouteWrapper />}>
                            <Route path="/Dashboard" element={<DashboardDispatch />} />

                            <Route path="/BusinessEntitiesAdmin" element={<BusinessEntitiesAdmin />} />

                            <Route path="/Participants" element={<BusinessUnitPage page="Participants" />} />
                            <Route path="/Programs" element={<BusinessUnitPage page="Programs" />} />

                            <Route
                                path="/Intakes"
                                element={<BusinessUnitPage page="Intakes" notAvailableTitle="Course Intakes (RTO only)" />}
                            />
                            <Route
                                path="/Campaigns"
                                element={<BusinessUnitPage page="Campaigns" notAvailableTitle="Campaigns (RTO only)" />}
                            />
                            <Route
                                path="/Leads"
                                element={<BusinessUnitPage page="Leads" notAvailableTitle="Leads (RTO only)" />}
                            />

                            <Route path="/ParticipantDetail" element={<BusinessUnitPage page="ParticipantDetail" />} />
                            <Route path="/ParticipantForm" element={<BusinessUnitPage page="ParticipantForm" />} />
                            <Route path="/ParticipantRequest" element={<BusinessUnitPage page="ParticipantRequest" />} />

                            <Route path="/ProgramForm" element={<BusinessUnitPage page="ProgramForm" />} />
                            <Route path="/ProgramDetail" element={<BusinessUnitPage page="ProgramDetail" />} />

                            <Route
                                path="/CaseNotes"
                                element={<BusinessUnitPage page="CaseNotes" notAvailableTitle="Case Notes (Casework only)" />}
                            />
                            <Route
                                path="/CaseNoteForm"
                                element={<BusinessUnitPage page="CaseNoteForm" notAvailableTitle="Case Notes (Casework only)" />}
                            />
                            <Route
                                path="/CaseNoteDetail"
                                element={<BusinessUnitPage page="CaseNoteDetail" notAvailableTitle="Case Notes (Casework only)" />}
                            />

                            <Route path="/SurveyForm" element={<BusinessUnitPage page="SurveyForm" />} />
                            <Route path="/SurveyBuilder" element={<BusinessUnitPage page="SurveyBuilder" />} />
                            <Route path="/SurveyTemplateForm" element={<BusinessUnitPage page="SurveyTemplateForm" />} />

                            <Route path="/FundingForm" element={<BusinessUnitPage page="FundingForm" />} />
                            <Route path="/TrainingForm" element={<BusinessUnitPage page="TrainingForm" />} />
                            <Route path="/TrainingBulkComplete" element={<BusinessUnitPage page="TrainingBulkComplete" />} />
                            <Route path="/EmploymentForm" element={<BusinessUnitPage page="EmploymentForm" />} />

                            <Route path="/Reports" element={<BusinessUnitPage page="Reports" />} />
                            <Route path="/ReportBuilder" element={<BusinessUnitPage page="ReportBuilder" />} />
                            <Route path="/ReportView" element={<BusinessUnitPage page="ReportView" />} />

                            <Route
                                path="/LSIRReport"
                                element={<BusinessUnitPage page="LSIRReport" notAvailableTitle="LSI-R (Casework only)" />}
                            />

                            <Route path="/EmployerAcademy" element={<BusinessUnitPage page="EmployerAcademy" />} />
                            <Route path="/EmployerDetail" element={<BusinessUnitPage page="EmployerDetail" />} />
                            <Route path="/EmployerForm" element={<BusinessUnitPage page="EmployerForm" />} />

                            <Route path="/Tasks" element={<BusinessUnitPage page="Tasks" />} />
                            <Route path="/Forum" element={<BusinessUnitPage page="Forum" />} />
                            <Route path="/Notifications" element={<BusinessUnitPage page="Notifications" />} />
                            <Route path="/Resources" element={<BusinessUnitPage page="Resources" />} />

                            <Route path="/JobBlast" element={<BusinessUnitPage page="JobBlast" />} />
                            <Route path="/MonthlyReports" element={<BusinessUnitPage page="MonthlyReports" />} />
                            <Route path="/ProgramEmail" element={<BusinessUnitPage page="ProgramEmail" />} />

                            <Route path="/ResumeBuilder" element={<BusinessUnitPage page="ResumeBuilder" />} />

                            <Route path="/PdfForms" element={<BusinessUnitPage page="PdfForms" />} />
                            <Route path="/PdfFormFill" element={<BusinessUnitPage page="PdfFormFill" />} />
                            <Route path="/PdfTemplateAdmin" element={<BusinessUnitPage page="PdfTemplateAdmin" />} />
                            <Route path="/PdfPacketReview" element={<BusinessUnitPage page="PdfPacketReview" />} />
                            <Route path="/PdfFormDetail" element={<BusinessUnitPage page="PdfFormDetail" />} />

                            <Route path="/ManagerApprovalReview" element={<BusinessUnitPage page="ManagerApprovalReview" />} />

                            <Route path="/DocumentDesigner" element={<BusinessUnitPage page="DocumentDesigner" />} />
                            <Route path="/WorkflowApprovals" element={<BusinessUnitPage page="WorkflowApprovals" />} />

                            <Route path="/Admin/*" element={<AdminRouter />} />
                            <Route path="/Settings" element={<Settings />} />
                        </Route>
                    </Route>
                </Route>
            </Route>
        </Routes>
    );
}
