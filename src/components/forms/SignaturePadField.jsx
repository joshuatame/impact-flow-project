import React, { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";

export default function SignaturePadField({ onSavePng, disabled }) {
    const canvasRef = useRef(null);
    const padRef = useRef(null);
    const [hasInk, setHasInk] = useState(false);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;

        const resize = () => {
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * ratio;
            canvas.height = rect.height * ratio;
            const ctx = canvas.getContext("2d");
            ctx.scale(ratio, ratio);
            padRef.current?.clear();
            setHasInk(false);
        };

        padRef.current = new SignaturePad(canvas, {
            minWidth: 1,
            maxWidth: 2.5,
            throttle: 16,
        });

        padRef.current.addEventListener("endStroke", () => {
            setHasInk(!padRef.current.isEmpty());
        });

        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    const clear = () => {
        padRef.current?.clear();
        setHasInk(false);
    };

    const save = async () => {
        if (!padRef.current || padRef.current.isEmpty()) return;
        const dataUrl = padRef.current.toDataURL("image/png");
        await onSavePng(dataUrl);
    };

    return (
        <div className="space-y-2">
            <div className="text-sm text-slate-300">Signature</div>

            <div className="border border-slate-700 rounded-lg bg-white">
                <canvas
                    ref={canvasRef}
                    className="w-full h-40 rounded-lg"
                    style={{ touchAction: "none" }}
                />
            </div>

            <div className="flex gap-2">
                <Button type="button" variant="outline" className="border-slate-700" onClick={clear} disabled={disabled}>
                    Clear
                </Button>
                <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={disabled || !hasInk}>
                    Save Signature
                </Button>
            </div>

            <p className="text-xs text-slate-500">
                Use your mouse or touch. Save writes a PNG signature that can be embedded into the PDF.
            </p>
        </div>
    );
}
