import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ClipboardList, Plus, Edit } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SurveysAdminPage() {
    const active = getActiveEntity();
    const entityId = active?.id || "";

    const { data: me } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: templatesRaw = [] } = useQuery({
        queryKey: ["surveyTemplates"],
        queryFn: () => base44.entities.SurveyTemplate.list("-created_date", 500),
    });

    // compat: include legacy templates without entity_id while migrating
    const templates = useMemo(() => {
        return (templatesRaw || []).filter((t) => !t.entity_id || t.entity_id === entityId);
    }, [templatesRaw, entityId]);

    // unit-role based (simple)
    const myRole =
        me?.app_role === "SystemAdmin"
            ? "SystemAdmin"
            : me?.entity_access?.[entityId]?.role || "User";

    const canCreate = ["SystemAdmin", "GeneralManager", "ContractManager", "Manager"].includes(myRole);

    return (
        <div className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">System Tools</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Link to={createPageUrl("SurveyBuilder")}>
                        <Button type="button" className="bg-blue-600 hover:bg-blue-700">
                            Open Survey Builder
                        </Button>
                    </Link>
                    <p className="text-xs text-slate-400">
                        Use Survey Builder to create and manage survey templates (including LSI-R).
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <ClipboardList className="h-5 w-5" />
                            Survey Templates
                        </span>

                        {canCreate && (
                            <Link to={createPageUrl("SurveyBuilder")}>
                                <Button className="bg-blue-600 hover:bg-blue-700" type="button">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Survey
                                </Button>
                            </Link>
                        )}
                    </CardTitle>
                </CardHeader>

                <CardContent>
                    {templates.length > 0 ? (
                        <div className="space-y-3">
                            {templates.map((s) => (
                                <div
                                    key={s.id}
                                    className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50"
                                >
                                    <div>
                                        <h4 className="font-medium text-white">{s.name}</h4>
                                        <p className="text-sm text-slate-400">
                                            {(s.domains?.length || 0)} domains · {s.description || "No description"}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Badge
                                            className={
                                                s.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-300"
                                            }
                                        >
                                            {s.is_active ? "Active" : "Inactive"}
                                        </Badge>

                                        {canCreate && (
                                            <Link to={createPageUrl(`SurveyBuilder?id=${s.id}`)}>
                                                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <ClipboardList className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-400">No survey templates for this unit yet.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
