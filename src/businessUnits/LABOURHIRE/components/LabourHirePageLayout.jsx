/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/components/LabourHirePageLayout.jsx  (NEW FILE)
 **************************************************************************************************/
import React from "react";
import { Outlet } from "react-router-dom";

/**
 * LabourHirePageLayout
 * Keeps LabourHire pages visually consistent with the rest of the app:
 * - standard padding
 * - max width
 * - prevents LH pages from sticking to the sidebar
 */
export default function LabourHirePageLayout() {
    return (
        <div className="w-full">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
                <Outlet />
            </div>
        </div>
    );
}