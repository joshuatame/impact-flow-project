// =================================================================================================
// File: src/businessUnits/BusinessUnitPage.jsx
// =================================================================================================
import React, { Suspense, useMemo } from "react";
import { getActiveEntity } from "@/lib/activeEntity";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { resolveUnitPage } from "@/businessUnits/pageRegistry";

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

export default function BusinessUnitPage({
    page,
    notAvailableTitle,
    notAvailableSubtitle,
}) {
    const active = getActiveEntity();
    const entityType = String(active?.type || "").toUpperCase();

    const PageComp = useMemo(() => resolveUnitPage(entityType, page), [entityType, page]);

    if (!active?.id) {
        return (
            <NotAvailable
                title="No active business unit selected"
                subtitle="Select an entity first to continue."
            />
        );
    }

    if (!PageComp) {
        return (
            <NotAvailable
                title={notAvailableTitle || "Not available"}
                subtitle={
                    notAvailableSubtitle ||
                    `Page "${page}" is not available for ${entityType || "this unit"}.`
                }
            />
        );
    }

    return (
        <Suspense fallback={<LoadingSpinner />}>
            <PageComp />
        </Suspense>
    );
}