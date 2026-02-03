// src/pages/systemAdmin/_ui.jsx
import React from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, subtitle, right, children, className }) {
    return (
        <div className={cn("p-6", className)}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xl font-semibold text-white">{title}</div>
                    {subtitle ? <div className="mt-1 text-sm text-slate-400">{subtitle}</div> : null}
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
            </div>

            <div className="mt-6">{children}</div>
        </div>
    );
}

export function CardShell({ children, className }) {
    return (
        <div className={cn("rounded-2xl border border-slate-800 bg-slate-900/60 p-4", className)}>{children}</div>
    );
}

export function FieldLabel({ children }) {
    return <div className="text-xs font-medium text-slate-300">{children}</div>;
}