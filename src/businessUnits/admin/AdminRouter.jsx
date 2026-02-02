// src/businessUnits/admin/AdminRouter.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";

import { canSeeAdmin } from "@/businessUnits/_shared/admin/roles";

// CASEWORK shell + pages
import CaseworkAdminPage from "@/businessUnits/CASEWORK/admin/CaseworkAdminPage.jsx";
import CaseworkUsersAdminPage from "@/businessUnits/CASEWORK/admin/UsersAdminPage.jsx";
import CaseworkRequestsAdminPage from "@/businessUnits/CASEWORK/admin/RequestsAdminPage.jsx";
import CaseworkReportsExportsAdminPage from "@/businessUnits/CASEWORK/admin/ReportsExportsAdminPage.jsx";
import CaseworkSurveysAdminPage from "@/businessUnits/CASEWORK/admin/SurveysAdminPage.jsx";
import CaseworkPdfAdminPage from "@/businessUnits/CASEWORK/admin/PdfAdminPage.jsx";
import CaseworkSettingsAdminPage from "@/businessUnits/CASEWORK/admin/SettingsAdminPage.jsx";
import CaseworkGuideAdminPage from "@/businessUnits/CASEWORK/admin/GuideAdminPage.jsx";

// PROGRAMS shell + pages
import ProgramsAdminPage from "@/businessUnits/PROGRAMS/admin/ProgramsAdminPage.jsx";
import ProgramsUsersAdminPage from "@/businessUnits/PROGRAMS/admin/UsersAdminPage.jsx";
import ProgramsRequestsAdminPage from "@/businessUnits/PROGRAMS/admin/RequestsAdminPage.jsx";
import ProgramsReportsExportsAdminPage from "@/businessUnits/PROGRAMS/admin/ReportsExportsAdminPage.jsx";
import ProgramsSurveysAdminPage from "@/businessUnits/PROGRAMS/admin/SurveysAdminPage.jsx";
import ProgramsPdfAdminPage from "@/businessUnits/PROGRAMS/admin/PdfAdminPage.jsx";
import ProgramsSettingsAdminPage from "@/businessUnits/PROGRAMS/admin/SettingsAdminPage.jsx";
import ProgramsGuideAdminPage from "@/businessUnits/PROGRAMS/admin/GuideAdminPage.jsx";

// RTO admin shell + panels (exist in your tree)
import RtoAdminPage from "@/businessUnits/RTO/admin/RtoAdminPage.jsx";
import RtoUsersPanel from "@/businessUnits/RTO/admin/UsersPanel.jsx";
import RtoRequestsPanel from "@/businessUnits/RTO/admin/RequestsPanel.jsx";
import RtoEmailsPanel from "@/businessUnits/RTO/admin/EmailsPanel.jsx";
import RtoSettingsPanel from "@/businessUnits/RTO/admin/SettingsPanel.jsx";

// Labourhire admin shell + panels (exist in your tree)
import LabourHireAdminPage from "@/businessUnits/LABOURHIRE/admin/LabourHireAdminPage.jsx";
import LabourhireUsersPanel from "@/businessUnits/LABOURHIRE/admin/UsersPanel.jsx";
import LabourhireRequestsPanel from "@/businessUnits/LABOURHIRE/admin/RequestsPanel.jsx";
import LabourhireEmailsPanel from "@/businessUnits/LABOURHIRE/admin/EmailsPanel.jsx";
import LabourhireSettingsPanel from "@/businessUnits/LABOURHIRE/admin/SettingsPanel.jsx";


export default function AdminRouter() {
    const active = getActiveEntity();
    const entityId = active?.id || "";
    const entityType = String(active?.type || "").toUpperCase();

    const { data: me, isLoading } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    if (isLoading) return <div className="p-6 text-slate-300">Loading...</div>;
    if (!entityId) return <div className="p-6 text-slate-300">No active business unit selected.</div>;
    if (!canSeeAdmin(me, entityId)) {
        return <div className="p-6 text-slate-300">You do not have permission to view Admin for this business unit.</div>;
    }

    if (entityType === "CASEWORK") {
        return (
            <Routes>
                <Route element={<CaseworkAdminPage />}>
                    <Route index element={<Navigate to="users" replace />} />
                    <Route path="users" element={<CaseworkUsersAdminPage />} />
                    <Route path="requests" element={<CaseworkRequestsAdminPage />} />
                    <Route path="reports-exports" element={<CaseworkReportsExportsAdminPage />} />
                    <Route path="surveys" element={<CaseworkSurveysAdminPage />} />
                    <Route path="pdfs" element={<CaseworkPdfAdminPage />} />
                    <Route path="settings" element={<CaseworkSettingsAdminPage />} />
                    <Route path="guide" element={<CaseworkGuideAdminPage />} />
                    <Route path="*" element={<Navigate to="users" replace />} />
                </Route>
            </Routes>
        );
    }

    if (entityType === "PROGRAMS") {
        return (
            <Routes>
                <Route element={<ProgramsAdminPage />}>
                    <Route index element={<Navigate to="users" replace />} />
                    <Route path="users" element={<ProgramsUsersAdminPage />} />
                    <Route path="requests" element={<ProgramsRequestsAdminPage />} />
                    <Route path="reports-exports" element={<ProgramsReportsExportsAdminPage />} />
                    <Route path="surveys" element={<ProgramsSurveysAdminPage />} />
                    <Route path="pdfs" element={<ProgramsPdfAdminPage />} />
                    <Route path="settings" element={<ProgramsSettingsAdminPage />} />
                    <Route path="guide" element={<ProgramsGuideAdminPage />} />
                    <Route path="*" element={<Navigate to="users" replace />} />
                </Route>
            </Routes>
        );
    }

    if (entityType === "RTO") {
        return (
            <Routes>
                <Route element={<RtoAdminPage />}>
                    <Route index element={<Navigate to="users" replace />} />
                    <Route path="users" element={<RtoUsersPanel />} />
                    <Route path="requests" element={<RtoRequestsPanel />} />
                    <Route path="emails" element={<RtoEmailsPanel />} />
                    <Route path="settings" element={<RtoSettingsPanel />} />
                    <Route path="*" element={<Navigate to="users" replace />} />
                </Route>
            </Routes>
        );
    }

    if (entityType === "LABOURHIRE") {
        return (
            <Routes>
                <Route element={<LabourHireAdminPage />}>
                    <Route index element={<Navigate to="users" replace />} />
                    <Route path="users" element={<LabourhireUsersPanel />} />
                    <Route path="requests" element={<LabourhireRequestsPanel />} />
                    <Route path="emails" element={<LabourhireEmailsPanel />} />
                    <Route path="settings" element={<LabourhireSettingsPanel />} />
                    <Route path="*" element={<Navigate to="users" replace />} />
                </Route>
            </Routes>
        );
    }

    return <div className="p-6 text-slate-300">Unknown business unit type: {entityType || "-"}</div>;
}
