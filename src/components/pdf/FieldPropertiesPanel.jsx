// src/components/pdf/FieldPropertiesPanel.jsx
import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getSourcesForEvent, getFieldsForSource } from "@/pdf/fieldDictionary";

const MODE_OPTIONS = [
    { value: "db", label: "Auto-fill from database" },
    { value: "manual", label: "Manual entry (caseworker must type)" },
    { value: "signature", label: "Signature" },
];

const SIGNATURE_ROLE_OPTIONS = [
    { value: "participant", label: "Participant signature" },
    { value: "caseworker", label: "Caseworker signature" },
];

function typeToNice(type) {
    if (type === "textarea") return "Text Box";
    if (type === "checkbox") return "Checkbox";
    if (type === "date") return "Date";
    if (type === "signature") return "Signature";
    return "Text";
}

export default function FieldPropertiesPanel({ eventType, field, onChange, onDelete }) {
    const sources = useMemo(() => getSourcesForEvent(eventType), [eventType]);

    const mapping = field?.mapping || null;
    const mode = mapping?.mode || "db";

    const dbFields = useMemo(() => {
        const src = mapping?.source;
        if (!src) return [];
        return getFieldsForSource(eventType, src);
    }, [eventType, mapping?.source]);

    if (!field) {
        return (
            <div className="text-sm text-slate-400">
                Click a field on the PDF to map it.
            </div>
        );
    }

    const isMapped = (() => {
        if (!mapping) return false;
        if (mapping.mode === "manual") return !!mapping.manualKey;
        if (mapping.mode === "signature") return true;
        if (mapping.mode === "db") return !!mapping.source && !!mapping.field;
        return false;
    })();

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm text-slate-200 font-semibold">Selected field</div>
                    <div className="text-xs text-slate-500">Type: {typeToNice(field.type)}</div>
                </div>
                <Badge className={isMapped ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}>
                    {isMapped ? "Mapped" : "Unmapped"}
                </Badge>
            </div>

            <div>
                <Label className="text-slate-300">Label shown in designer</Label>
                <Input
                    className="bg-slate-900 border-slate-800 text-white mt-1"
                    value={field.display?.label || ""}
                    onChange={(e) =>
                        onChange?.({
                            ...field,
                            display: { ...(field.display || {}), label: e.target.value },
                        })
                    }
                    placeholder="e.g., Participant First Name"
                />
            </div>

            <div>
                <Label className="text-slate-300">How is this field filled?</Label>
                <Select
                    value={mode}
                    onValueChange={(v) => {
                        const next = { ...field };
                        if (v === "manual") {
                            next.mapping = {
                                mode: "manual",
                                required: true,
                                manualKey: next.mapping?.manualKey || `manual_${next.id}`,
                            };
                        } else if (v === "signature") {
                            next.mapping = {
                                mode: "signature",
                                required: true,
                                signatureRole: next.mapping?.signatureRole || "participant",
                            };
                        } else {
                            // IMPORTANT: blank source/field by default (your request)
                            next.mapping = {
                                mode: "db",
                                required: false,
                                source: "",
                                field: "",
                            };
                        }
                        onChange?.(next);
                    }}
                >
                    <SelectTrigger className="bg-slate-900 border-slate-800 text-white mt-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                        {MODE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-white">
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {mode === "db" ? (
                <>
                    <div>
                        <Label className="text-slate-300">Source</Label>
                        <Select
                            value={mapping?.source || ""}
                            onValueChange={(v) => {
                                onChange?.({
                                    ...field,
                                    mapping: { mode: "db", required: false, source: v, field: "" },
                                });
                            }}
                        >
                            <SelectTrigger className="bg-slate-900 border-slate-800 text-white mt-1">
                                <SelectValue placeholder="Select a source" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {sources.map((s) => (
                                    <SelectItem key={s.source} value={s.source} className="text-white">
                                        {s.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="text-xs text-slate-500 mt-2">
                            Choose where the value comes from, then pick the field.
                        </div>
                    </div>

                    <div>
                        <Label className="text-slate-300">Database field</Label>
                        <Select
                            value={mapping?.field || ""}
                            onValueChange={(v) => {
                                onChange?.({
                                    ...field,
                                    mapping: { ...(mapping || {}), mode: "db", field: v },
                                });
                            }}
                            disabled={!mapping?.source}
                        >
                            <SelectTrigger className="bg-slate-900 border-slate-800 text-white mt-1">
                                <SelectValue placeholder={mapping?.source ? "Select a field" : "Pick a source first"} />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {dbFields.map((f) => (
                                    <SelectItem key={f.key} value={f.key} className="text-white">
                                        {f.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </>
            ) : null}

            {mode === "manual" ? (
                <>
                    <div>
                        <Label className="text-slate-300">Manual field key (system)</Label>
                        <Input
                            className="bg-slate-900 border-slate-800 text-white mt-1"
                            value={mapping?.manualKey || `manual_${field.id}`}
                            onChange={(e) =>
                                onChange?.({
                                    ...field,
                                    mapping: { ...(mapping || {}), mode: "manual", manualKey: e.target.value },
                                })
                            }
                        />
                        <div className="text-xs text-slate-500 mt-2">
                            This is stored in the form instance. Admins usually do not change it.
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={mapping?.required !== false}
                            onChange={(e) =>
                                onChange?.({
                                    ...field,
                                    mapping: { ...(mapping || {}), mode: "manual", required: e.target.checked },
                                })
                            }
                            className="rounded"
                        />
                        <Label className="text-slate-200">Required</Label>
                    </div>
                </>
            ) : null}

            {mode === "signature" ? (
                <>
                    <div>
                        <Label className="text-slate-300">Signature role</Label>
                        <Select
                            value={mapping?.signatureRole || "participant"}
                            onValueChange={(v) =>
                                onChange?.({
                                    ...field,
                                    mapping: { ...(mapping || {}), mode: "signature", signatureRole: v },
                                })
                            }
                        >
                            <SelectTrigger className="bg-slate-900 border-slate-800 text-white mt-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {SIGNATURE_ROLE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value} className="text-white">
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={mapping?.required !== false}
                            onChange={(e) =>
                                onChange?.({
                                    ...field,
                                    mapping: { ...(mapping || {}), mode: "signature", required: e.target.checked },
                                })
                            }
                            className="rounded"
                        />
                        <Label className="text-slate-200">Required</Label>
                    </div>
                </>
            ) : null}

            <div className="pt-2 border-t border-slate-800">
                <Button
                    type="button"
                    variant="outline"
                    className="border-red-500/40 text-red-300 hover:bg-red-500/10 w-full"
                    onClick={() => onDelete?.(field)}
                >
                    Delete field
                </Button>
            </div>
        </div>
    );
}
