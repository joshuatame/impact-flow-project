import React, { useMemo } from "react";
import { CheckCircle2, Circle } from "lucide-react";

const defaultColors = {
    "Photo ID": "bg-blue-500/10 text-blue-400",
    "Birth Cert": "bg-blue-500/10 text-blue-400",
    "Residental Address": "bg-blue-500/10 text-blue-400",
    "Concession": "bg-blue-500/10 text-blue-400",
    "Resume": "bg-pink-500/10 text-pink-400",
    "ISEP": "bg-violet-500/10 text-violet-400",
    "Program": "bg-violet-500/10 text-violet-400",
    "Media": "bg-cyan-500/10 text-cyan-400",
    "Consent": "bg-emerald-500/10 text-emerald-400",
    "Employment Contract": "bg-amber-500/10 text-amber-400",
    "Medical": "bg-red-500/10 text-red-400",
    "Training Certifcate": "bg-violet-500/10 text-violet-400",
    "Reference": "bg-cyan-500/10 text-cyan-400",
    "Other": "bg-slate-500/10 text-slate-400",
};

function normalizeRaw(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-z0-9 ]/g, "");
}

function buildCanonicalMap(documentTypes) {
    const map = new Map();
    for (const t of documentTypes || []) map.set(normalizeRaw(t), t);
    return map;
}

function canonicalDocType(input, canonicalMap) {
    const key = normalizeRaw(input);

    const aliases = {
        "photo id": "Photo ID",
        "photoid": "Photo ID",
        "id": "Photo ID",

        "birth cert": "Birth Cert",
        "birth certificate": "Birth Cert",

        "residential address": "Residental Address",
        "residental address": "Residental Address",

        "training certificate": "Training Certifcate",
        "training cert": "Training Certifcate",
        "training certifcate": "Training Certifcate",

        "employment contract": "Employment Contract",
        "contract": "Employment Contract",

        "resume": "Resume",
        "isep": "ISEP",
        "program": "Program",
        "media": "Media",
        "consent": "Consent",
        "medical": "Medical",
        "reference": "Reference",
        "concession": "Concession",
        "other": "Other",
    };

    const aliasHit = aliases[key];
    if (aliasHit) return aliasHit;

    return canonicalMap.get(key) || null;
}

export default function DocumentCompletionGrid({
    title = "Document Completion",
    documentTypes = [],
    documents = [],
    onTypeClick,
    className = "",
}) {
    const completion = useMemo(() => {
        const canonicalMap = buildCanonicalMap(documentTypes);

        // count by canonical type
        const counts = new Map();
        for (const t of documentTypes) counts.set(t, 0);

        for (const d of documents || []) {
            const canonical = canonicalDocType(d?.category, canonicalMap);
            if (!canonical) continue;
            if (!counts.has(canonical)) continue;
            counts.set(canonical, (counts.get(canonical) || 0) + 1);
        }

        const items = documentTypes.map((t) => {
            const count = counts.get(t) || 0;
            return { type: t, count, complete: count > 0 };
        });

        const total = items.length || 0;
        const done = items.filter((i) => i.complete).length;
        const pct = total ? Math.round((done / total) * 100) : 0;

        return { items, total, done, pct };
    }, [documentTypes, documents]);

    return (
        <div className={`bg-slate-900/50 border border-slate-800 rounded-2xl p-4 ${className}`}>
            <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                    <h4 className="text-white font-semibold">{title}</h4>
                    <p className="text-sm text-slate-400">
                        {completion.done}/{completion.total} completed - {completion.pct}%
                    </p>
                </div>

                <div className="w-40">
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-2 bg-emerald-500" style={{ width: `${completion.pct}%` }} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {completion.items.map((item) => {
                    const Icon = item.complete ? CheckCircle2 : Circle;
                    const colorClass = defaultColors[item.type] || defaultColors.Other;

                    const tileClass = item.complete
                        ? "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15"
                        : "bg-slate-950/40 border-slate-800 hover:bg-slate-800/40";

                    return (
                        <button
                            key={item.type}
                            type="button"
                            onClick={() => onTypeClick && onTypeClick(item.type)}
                            className={`text-left border rounded-xl p-3 transition-colors ${tileClass}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate text-white">
                                        {item.type}
                                    </div>
                                    <div className={`text-xs mt-1 ${item.complete ? "text-emerald-200/80" : "text-slate-400"}`}>
                                        {item.complete ? `${item.count} file(s)` : "Missing"}
                                    </div>
                                </div>

                                <div className={`shrink-0 p-1.5 rounded-lg ${colorClass}`}>
                                    <Icon className="h-4 w-4" />
                                </div>
                            </div>
                        </button>
                    );
                })}

            </div>
        </div>
    );
}
