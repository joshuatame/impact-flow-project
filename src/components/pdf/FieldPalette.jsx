// src/components/pdf/FieldPalette.jsx
import React from "react";
import { Button } from "@/components/ui/button";
import { Type, AlignLeft, Calendar, CheckSquare, PenTool } from "lucide-react";

const TYPES = [
    { type: "text", label: "Text", icon: Type },
    { type: "textarea", label: "Text Box", icon: AlignLeft },
    { type: "date", label: "Date", icon: Calendar },
    { type: "checkbox", label: "Checkbox", icon: CheckSquare },
    { type: "signature", label: "Signature", icon: PenTool },
];

export default function FieldPalette({ onAdd }) {
    return (
        <div className="space-y-2">
            <div className="text-sm text-slate-200 font-semibold">Add fields</div>
            <div className="grid grid-cols-1 gap-2">
                {TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                        <Button
                            key={t.type}
                            type="button"
                            variant="outline"
                            className="border-slate-800 justify-start"
                            onClick={() => onAdd?.(t.type)}
                        >
                            <Icon className="h-4 w-4 mr-2" />
                            {t.label}
                        </Button>
                    );
                })}
            </div>

            <div className="text-xs text-slate-500 mt-2">
                Workflow: Add field - drag into place - click field - map it.
            </div>
        </div>
    );
}
