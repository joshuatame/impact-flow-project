import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GuideAdminPage() {
    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white">Admin Guide</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert max-w-none">
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Roles and access</h3>
                        <ul className="list-disc list-inside text-slate-300 space-y-1">
                            <li><strong>SystemAdmin</strong>: platform-wide access.</li>
                            <li><strong>GeneralManager</strong>: unit approvals + full unit admin.</li>
                            <li><strong>ContractManager</strong>: unit admin tools (no GM approvals unless you grant it).</li>
                            <li><strong>Manager</strong>: can request invites; approvals are GM.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Invite approvals</h3>
                        <p className="text-slate-300">
                            Managers submit invite requests; General Managers approve and issue the invites.
                        </p>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Entity separation</h3>
                        <p className="text-slate-300">
                            Admin lists and creation tools should only operate on records where <strong>entity_id</strong> matches the active business unit.
                            Legacy records without entity_id may still appear until migration is complete.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
