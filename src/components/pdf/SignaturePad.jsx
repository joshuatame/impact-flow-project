// src/components/pdf/SignaturePad.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

export default function SignaturePad({ value, onChange, disabled, width = 260, height = 90 }) {
    const canvasRef = useRef(null);
    const [drawing, setDrawing] = useState(false);

    const hasValue = useMemo(() => !!(value && String(value).startsWith("data:image/")), [value]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#000000";
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (hasValue) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
            };
            img.src = value;
        }
    }, [value, hasValue]);

    function start(e) {
        e.preventDefault?.();
        if (disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const p = getPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        setDrawing(true);
    }

    function move(e) {
        e.preventDefault?.();
        if (!drawing || disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const p = getPos(e, canvas);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }

    function end() {
        if (disabled) return;
        if (!drawing) return;
        setDrawing(false);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/png");
        onChange?.(dataUrl);
    }

    function clear() {
        if (disabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        onChange?.("");
    }

    return (
        <div className="space-y-2">
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className={`rounded-md border ${disabled ? "border-slate-700 opacity-70" : "border-emerald-500/40"} bg-white`}
                style={{ touchAction: "none" }}
                onMouseDown={start}
                onMouseMove={move}
                onMouseUp={end}
                onMouseLeave={end}
                onTouchStart={start}
                onTouchMove={move}
                onTouchEnd={end}
            />
            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" className="border-slate-700" onClick={clear} disabled={disabled}>
                    Clear
                </Button>
                <p className="text-xs text-slate-500">
                    Sign above. Saved as an image in the form instance.
                </p>
            </div>
        </div>
    );
}
