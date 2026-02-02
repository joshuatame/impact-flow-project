// src/businessUnits/admin/shared/useEntityRole.js
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";
import { getActorUnitRole } from "@/businessUnits/_shared/admin/roles";

export function useEntityRole() {
    const active = getActiveEntity();
    const entityId = active?.id || "";

    const { data: me, isLoading } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const role = useMemo(() => getActorUnitRole(me, entityId), [me, entityId]);

    return {
        entity: active,
        entityId,
        me,
        role,
        isLoading,
        isSystemAdmin: me?.app_role === "SystemAdmin",
    };
}
