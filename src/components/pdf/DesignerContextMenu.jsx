// src/components/pdf/DesignerContextMenu.jsx
import React, { useEffect } from "react";

export default function DesignerContextMenu({
    open,
    x,
    y,
    onClose,
    items = [],
}) {
    useEffect(() => {
        if (!open) return;

        const onDoc = () => onClose?.();
        const onEsc = (e) => {
            if (e.key === "Escape") onClose?.();
        };

        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed z-[200] bg-slate-950 border border-slate-800 rounded-lg shadow-xl overflow-hidden"
            style={{ left: x, top: y, minWidth: 180 }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {items.map((it) => (
                <button
                    key={it.key}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                        it.onClick?.();
                        onClose?.();
                    }}
                    disabled={it.disabled}
                >
                    {it.label}
                </button>
            ))}
        </div>
    );
}
