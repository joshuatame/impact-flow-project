import React, { useMemo } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { useAuth } from "@/context/AuthContext";
import { getActiveEntity } from "@/lib/activeEntity";
import { getBusinessUnitConfig } from "@/businessUnits/config/businessUnitConfig";
import AdminTabsPage from "@/pages/admin/AdminTabsPage.jsx";

export default function Admin() {
    const { user, loading } = useAuth();

    const activeEntity = useMemo(() => getActiveEntity(), []);
    const entityId = activeEntity?.id || null;
    const entityType = activeEntity?.type || "";
    const config = useMemo(() => getBusinessUnitConfig(entityType), [entityType]);

    if (loading) return <LoadingSpinner />;
    if (!user) return null;

    if (!entityId) {
        return (
            <div className="p-6 text-slate-300">
                No business unit selected. Please go to Launchpad and select one.
            </div>
        );
    }

    return <AdminTabsPage entityId={entityId} entityType={entityType} config={config} />;
}
