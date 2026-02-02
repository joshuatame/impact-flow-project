// ======================================================
// FILE: src/businessUnits/_shared/admin/UnitSettingsPanelBase.jsx
// ======================================================

import React, { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { base44 } from "@/api/base44Client";
import { getActiveEntity } from "@/lib/activeEntity";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

function getUnitRole(me, entityId) {
    if (!me?.id || !entityId) return null;
    if (me.app_role === "SystemAdmin") return "SystemAdmin";
    const access = me?.entity_access?.[entityId];
    if (access?.active !== true) return null;
    return access?.role || null;
}

function canEditSettings(me, entityId) {
    const r = getUnitRole(me, entityId);
    return r === "SystemAdmin" || r === "GeneralManager" || r === "ContractManager";
}

function safeString(v) {
    return typeof v === "string" ? v : "";
}

/**
 * Unit-scoped settings stored at:
 *  - Firestore: businessEntities/{entityId}
 *
 * Minimal fields we manage here (all optional):
 *  - name
 *  - logo_url
 *  - email_defaults: { from, reply_to }
 *  - email_signature_html
 *  - casework_config: { dex_enabled, default_participant_phase }
 */
export default function UnitSettingsPanelBase({ title = "Settings", unitKey = "casework" }) {
    const active = getActiveEntity();
    const entityId = active?.id || "";
    const entityType = active?.type || "";
    const entityName = active?.name || "";

    const { data: me, isLoading: loadingMe } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const unitRole = useMemo(() => getUnitRole(me, entityId), [me, entityId]);

    const {
        data: entityDoc,
        isLoading: loadingEntity,
        refetch,
    } = useQuery({
        queryKey: ["businessEntity", entityId],
        enabled: !!entityId,
        queryFn: async () => {
            const snap = await getDoc(doc(db, "businessEntities", entityId));
            return snap.exists() ? { id: snap.id, ...snap.data() } : { id: entityId };
        },
    });

    const editable = useMemo(() => canEditSettings(me, entityId), [me, entityId]);

    const [form, setForm] = useState({
        name: "",
        logo_url: "",
        email_from: "",
        email_reply_to: "",
        email_signature_html: "",
        dex_enabled: false,
        default_participant_phase: "",
    });

    const [status, setStatus] = useState({ type: "", text: "" });

    React.useEffect(() => {
        if (!entityDoc) return;

        const emailDefaults = entityDoc.email_defaults || {};
        const caseworkConfig = entityDoc.casework_config || {};

        setForm({
            name: safeString(entityDoc.name || entityName),
            logo_url: safeString(entityDoc.logo_url),
            email_from: safeString(emailDefaults.from),
            email_reply_to: safeString(emailDefaults.reply_to),
            email_signature_html: safeString(entityDoc.email_signature_html),
            dex_enabled: !!caseworkConfig.dex_enabled,
            default_participant_phase: safeString(caseworkConfig.default_participant_phase),
        });
    }, [entityDoc, entityName]);

    const save = useMutation({
        mutationFn: async () => {
            if (!entityId) throw new Error("No active business unit selected.");
            if (!editable) throw new Error("You do not have permission to edit settings.");

            setStatus({ type: "", text: "" });

            const patch = {
                name: form.name.trim(),
                logo_url: form.logo_url.trim(),
                email_defaults: {
                    from: form.email_from.trim(),
                    reply_to: form.email_reply_to.trim(),
                },
                email_signature_html: form.email_signature_html,
                updated_at: serverTimestamp(),
            };

            if (unitKey === "casework") {
                patch.casework_config = {
                    ...(entityDoc?.casework_config || {}),
                    dex_enabled: !!form.dex_enabled,
                    default_participant_phase: form.default_participant_phase.trim(),
                };
            }

            await setDoc(doc(db, "businessEntities", entityId), patch, { merge: true });
        },
        onSuccess: async () => {
            setStatus({ type: "success", text: "Settings saved." });
            await refetch();
        },
        onError: (e) => setStatus({ type: "error", text: e?.message || "Failed to save settings." }),
    });

    if (loadingMe || loadingEntity) return <LoadingSpinner />;

    if (!entityId) {
        return (
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-slate-300">No active business unit selected.</CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {!!status.text && (
                <div
                    className={`rounded-xl border p-3 text-sm ${status.type === "error"
                            ? "border-red-500/30 bg-red-500/10 text-red-200"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        }`}
                >
                    {status.text}
                </div>
            )}

            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span>{title}</span>
                                <Badge className="bg-slate-500/10 text-slate-300">{unitRole || "—"}</Badge>
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                                Entity: <span className="text-slate-200">{entityName || entityId}</span>{" "}
                                <span className="text-slate-500">·</span> Type:{" "}
                                <span className="text-slate-200">{entityType || "—"}</span>
                            </div>
                        </div>

                        {!editable && <Badge className="bg-slate-500/10 text-slate-300">Read-only</Badge>}
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-slate-300">Business Unit Name</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                disabled={!editable}
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Logo URL</Label>
                            <Input
                                value={form.logo_url}
                                onChange={(e) => setForm((p) => ({ ...p, logo_url: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="https://..."
                                disabled={!editable}
                            />
                            <p className="text-xs text-slate-500 mt-1">Used in headers, PDFs, and emails (unit-scoped).</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-slate-300">Default From</Label>
                            <Input
                                value={form.email_from}
                                onChange={(e) => setForm((p) => ({ ...p, email_from: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="admin@yourdomain.com"
                                disabled={!editable}
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Default Reply-To</Label>
                            <Input
                                value={form.email_reply_to}
                                onChange={(e) => setForm((p) => ({ ...p, email_reply_to: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="support@yourdomain.com"
                                disabled={!editable}
                            />
                        </div>
                    </div>

                    <div>
                        <Label className="text-slate-300">Email Signature (HTML)</Label>
                        <Textarea
                            value={form.email_signature_html}
                            onChange={(e) => setForm((p) => ({ ...p, email_signature_html: e.target.value }))}
                            className="bg-slate-800 border-slate-700 text-white"
                            rows={6}
                            disabled={!editable}
                            placeholder="<p>Regards,<br/>Team</p>"
                        />
                    </div>

                    {unitKey === "casework" && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                            <div className="text-white font-semibold">Casework Configuration</div>

                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-slate-300 text-sm">DEX Enabled</div>
                                    <div className="text-slate-500 text-xs">Controls whether DEX features are shown for this unit.</div>
                                </div>

                                <input
                                    type="checkbox"
                                    checked={!!form.dex_enabled}
                                    onChange={(e) => setForm((p) => ({ ...p, dex_enabled: e.target.checked }))}
                                    disabled={!editable}
                                    className="h-5 w-5"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Default Participant Phase</Label>
                                <Input
                                    value={form.default_participant_phase}
                                    onChange={(e) => setForm((p) => ({ ...p, default_participant_phase: e.target.value }))}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    disabled={!editable}
                                    placeholder="e.g., Pre Employment Support"
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="border-slate-700"
                            onClick={() => refetch()}
                            disabled={save.isPending}
                        >
                            Reload
                        </Button>

                        <Button
                            type="button"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => save.mutate()}
                            disabled={!editable || save.isPending}
                        >
                            {save.isPending ? "Saving..." : "Save Settings"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}