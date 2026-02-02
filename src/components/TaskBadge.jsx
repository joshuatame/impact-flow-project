import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function TaskBadge() {
    const { data: user } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: tasks = [] } = useQuery({
        queryKey: ["myTasks", user?.id],
        enabled: !!user?.id,
        refetchInterval: 30000,
        refetchOnWindowFocus: true,
        queryFn: async () => {
            // Use list + filter client-side to avoid relying on filter() argument signatures.
            const all = await base44.entities.Task.list("-created_date", 1000);
            const mine = (all || []).filter((t) => t.assigned_to_id === user.id);
            return mine;
        },
    });

    const pendingCount = useMemo(() => {
        return (tasks || []).filter((t) => {
            const s = String(t.status || "").toLowerCase();
            return s === "pending" || s === "in progress";
        }).length;
    }, [tasks]);

    if (pendingCount === 0) return null;

    return (
        <span className="ml-auto bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
            {pendingCount > 9 ? "9+" : pendingCount}
        </span>
    );
}
