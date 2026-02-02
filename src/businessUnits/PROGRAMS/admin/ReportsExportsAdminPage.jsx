import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";
import { format } from "date-fns";
import { Download, Database } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ReportsExportsAdminPage() {
    const queryClient = useQueryClient();
    const active = getActiveEntity();
    const entityId = active?.id || "";

    const { data: programs = [] } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 500),
    });

    const { data: dexExportLogsRaw = [] } = useQuery({
        queryKey: ["dexExportLogs"],
        queryFn: () => base44.entities.DEXExportLog.list("-created_date", 500),
    });

    // ✅ compat: include legacy docs with no entity_id (only while migrating)
    const programsForUnit = useMemo(() => {
        return (programs || []).filter((p) => !p.entity_id || p.entity_id === entityId);
    }, [programs, entityId]);

    const dexExportLogs = useMemo(() => {
        return (dexExportLogsRaw || []).filter((l) => !l.entity_id || l.entity_id === entityId);
    }, [dexExportLogsRaw, entityId]);

    const [cfg, setCfg] = useState({ program_ids: [], date_start: "", date_end: "" });

    const dexExport = useMutation({
        mutationFn: async () => {
            // call via generic invoke so you don’t depend on a wrapper existing
            return await base44.functions.invoke("generateDEXExport", {
                ...cfg,
                entityId,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["dexExportLogs"] });
        },
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Generate DEX Export
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div>
                        <Label className="text-slate-300">Programs (optional)</Label>
                        <div className="space-y-2 max-h-40 overflow-y-auto mt-2">
                            {programsForUnit
                                .filter((p) => p.dex_reporting_required)
                                .map((p) => (
                                    <label key={p.id} className="flex items-center gap-2 text-white">
                                        <input
                                            type="checkbox"
                                            className="rounded"
                                            checked={cfg.program_ids.includes(p.id)}
                                            onChange={(e) => {
                                                setCfg((prev) => ({
                                                    ...prev,
                                                    program_ids: e.target.checked
                                                        ? [...prev.program_ids, p.id]
                                                        : prev.program_ids.filter((id) => id !== p.id),
                                                }));
                                            }}
                                        />
                                        {p.program_name}
                                    </label>
                                ))}
                            {programsForUnit.filter((p) => p.dex_reporting_required).length === 0 && (
                                <p className="text-sm text-slate-500">No DEX-reporting programs found for this unit.</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-slate-300">From Date</Label>
                            <Input
                                type="date"
                                value={cfg.date_start}
                                onChange={(e) => setCfg((p) => ({ ...p, date_start: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>
                        <div>
                            <Label className="text-slate-300">To Date</Label>
                            <Input
                                type="date"
                                value={cfg.date_end}
                                onChange={(e) => setCfg((p) => ({ ...p, date_end: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>
                    </div>

                    <Button
                        type="button"
                        className="w-full bg-violet-600 hover:bg-violet-700"
                        disabled={dexExport.isPending}
                        onClick={() => dexExport.mutate()}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        {dexExport.isPending ? "Generating..." : "Generate DEX Export"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">Export History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {dexExportLogs.slice(0, 15).map((log) => (
                            <div
                                key={log.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                            >
                                <div>
                                    <p className="text-white text-sm font-medium">
                                        {log.record_count || 0} records exported
                                    </p>
                                    <p className="text-slate-500 text-xs">
                                        by {log.exported_by_name || "—"} ·{" "}
                                        {log.created_date ? format(new Date(log.created_date), "MMM d, yyyy HH:mm") : "—"}
                                    </p>
                                </div>
                                <Badge
                                    className={
                                        log.status === "Completed"
                                            ? "bg-emerald-500/10 text-emerald-400"
                                            : "bg-slate-500/10 text-slate-300"
                                    }
                                >
                                    {log.status || "Pending"}
                                </Badge>
                            </div>
                        ))}
                        {dexExportLogs.length === 0 && (
                            <p className="text-slate-500 text-center py-4">No exports yet.</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
