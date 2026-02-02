/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/routes/LabourHireRouter.jsx  (REPLACE ENTIRE FILE)
 * - Wrap all LH pages in LabourHirePageLayout => fixes padding/gap issues
 **************************************************************************************************/
import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import LabourHireShell from "@/businessUnits/LABOURHIRE/components/LabourHireShell.jsx";
import LabourHirePageLayout from "@/businessUnits/LABOURHIRE/components/LabourHirePageLayout.jsx";

// Manager
import ManagerDashboard from "@/businessUnits/LABOURHIRE/pages/manager/ManagerDashboard.jsx";
import ManagerCompanies from "@/businessUnits/LABOURHIRE/pages/manager/ManagerCompanies.jsx";
import ManagerCompanyDetail from "@/businessUnits/LABOURHIRE/pages/manager/ManagerCompanyDetail.jsx";
import ManagerCandidates from "@/businessUnits/LABOURHIRE/pages/manager/ManagerCandidates.jsx";
import ManagerCandidateDetail from "@/businessUnits/LABOURHIRE/pages/manager/ManagerCandidateDetail.jsx";
import ManagerTimesheets from "@/businessUnits/LABOURHIRE/pages/manager/ManagerTimesheets.jsx";
import ManagerQuotes from "@/businessUnits/LABOURHIRE/pages/manager/ManagerQuotes.jsx";
// ✅ ADD THIS (exists in your tree)
import ManagerGenerateQuote from "@/businessUnits/LABOURHIRE/pages/manager/ManagerGenerateQuote.jsx";

// Company
import CompanyDashboard from "@/businessUnits/LABOURHIRE/pages/company/CompanyDashboard.jsx";
import CompanyCandidates from "@/businessUnits/LABOURHIRE/pages/company/CompanyCandidates.jsx";
import CompanyTimecards from "@/businessUnits/LABOURHIRE/pages/company/CompanyTimecards.jsx";
import CompanyQuotes from "@/businessUnits/LABOURHIRE/pages/company/CompanyQuotes.jsx";

// Candidate
import CandidateProfile from "@/businessUnits/LABOURHIRE/pages/candidate/CandidateProfile.jsx";
import CandidateDocuments from "@/businessUnits/LABOURHIRE/pages/candidate/CandidateDocuments.jsx";
import CandidatePlacements from "@/businessUnits/LABOURHIRE/pages/candidate/CandidatePlacements.jsx";
import CandidateTimesheets from "@/businessUnits/LABOURHIRE/pages/candidate/CandidateTimesheets.jsx";

export default function LabourHireRouter() {
    return (
        <Routes>
            <Route element={<LabourHireShell />}>
                <Route element={<LabourHirePageLayout />}>
                    <Route index element={<Navigate to="/labourhire/manager/dashboard" replace />} />

                    {/* Manager */}
                    <Route path="manager/dashboard" element={<ManagerDashboard />} />
                    <Route path="manager/companies" element={<ManagerCompanies />} />
                    <Route path="manager/companies/:companyId" element={<ManagerCompanyDetail />} />
                    <Route path="manager/candidates" element={<ManagerCandidates />} />
                    <Route path="manager/candidates/:candidateId" element={<ManagerCandidateDetail />} />
                    <Route path="manager/timesheets" element={<ManagerTimesheets />} />
                    <Route path="manager/quotes" element={<ManagerQuotes />} />

                    {/* Company */}
                    <Route path="company/dashboard" element={<CompanyDashboard />} />
                    <Route path="company/candidates" element={<CompanyCandidates />} />
                    <Route path="company/timecards" element={<CompanyTimecards />} />
                    <Route path="company/quotes" element={<CompanyQuotes />} />

                    {/* Candidate */}
                    <Route path="candidate/profile" element={<CandidateProfile />} />
                    <Route path="candidate/documents" element={<CandidateDocuments />} />
                    <Route path="candidate/placements" element={<CandidatePlacements />} />
                    <Route path="candidate/timesheets" element={<CandidateTimesheets />} />

                    <Route path="*" element={<Navigate to="/labourhire/manager/dashboard" replace />} />
                </Route>
            </Route>
        </Routes>
    );
}