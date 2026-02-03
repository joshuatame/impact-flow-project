// src/pages/systemAdmin/SystemAdminRouter.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./Dashboard.jsx";
import Users from "./Users.jsx";
import Access from "./Access.jsx";
import Exports from "./Exports.jsx";
import Imports from "./Imports.jsx";
import BusinessEntitiesAdmin from "@/pages/BusinessEntitiesAdmin.jsx";

export default function SystemAdminRouter() {
    return (
        <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="access" element={<Access />} />
            <Route path="entities" element={<BusinessEntitiesAdmin />} />
            <Route path="exports" element={<Exports />} />
            <Route path="imports" element={<Imports />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
    );
}