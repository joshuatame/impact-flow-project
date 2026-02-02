// src/components/email/EmailComposerDialog.jsx
import React, { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function nl2brHtml(text) {
    const safe = String(text || "");
    const escaped = safe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return escaped.replace(/\n/g, "<br/>");
}

export default function EmailComposerDialog({
    open,
    onOpenChange,
    mode = "participant", // "participant" | "program"
    participantId,
    programId,
    participantIds = [],
    defaultSubject = "",
    toLabel = "", // optional display label (email) for participant mode
    onSent,
}) {
    const [subject, setSubject] = useState(defaultSubject || "");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setError("");
        setSubject(defaultSubject || "");
        setMessage("");
    }, [open, defaultSubject]);

    const recipientCount = useMemo(() => {
        if (mode === "participant") return 1;
        return Array.isArray(participantIds) ? participantIds.length : 0;
    }, [mode, participantIds]);

    const canSend =
        String(subject || "").trim().length > 0 &&
        String(message || "").trim().length > 0 &&
        (mode !== "participant" || !!String(participantId || "").trim()) &&
        (mode !== "program" || (!!String(programId || "").trim() && recipientCount > 0));

    const handleSend = async () => {
        setError("");

        const subj = String(subject || "").trim();
        const msg = String(message || "").trim();
        if (!subj) return setError("Subject is required.");
        if (!msg) return setError("Message is required.");

        setSending(true);
        try {
            const html = `<div style="font-family: Arial, sans-serif; line-height: 1.5; white-space: pre-wrap;">
${nl2brHtml(msg)}
</div>`;

            if (mode === "participant") {
                const pid = String(participantId || "").trim();
                if (!pid) throw new Error("Missing participantId");

                const fn = httpsCallable(functions, "sendParticipantEmail");
                await fn({
                    participantId: pid,
                    subject: subj,
                    html,
                    text: msg,
                });
            } else {
                const prgId = String(programId || "").trim();
                if (!prgId) throw new Error("Missing programId");

                const ids = Array.isArray(participantIds) ? participantIds.map(String) : [];
                if (!ids.length) throw new Error("Select at least one recipient");

                const fn = httpsCallable(functions, "sendProgramEmail");
                await fn({
                    programId: prgId,
                    participantIds: ids,
                    subject: subj,
                    html,
                    text: msg,
                });
            }

            onOpenChange(false);
            if (onSent) onSent();
        } catch (e) {
            setError(e?.message || "Failed to send email");
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="text-white">
                        {mode === "participant" ? "Email Participant" : "Email Program Participants"}
                    </DialogTitle>

                    <DialogDescription className="text-slate-400">
                        {mode === "participant" ? (
                            <div>
                                This will send to the participant{toLabel ? ` (${toLabel})` : ""}.
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-2">
                                Recipients:
                                <Badge className="bg-slate-800 text-slate-200 border border-slate-700/60">
                                    {recipientCount}
                                </Badge>
                            </div>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 mt-2">
                    <div>
                        <label className="text-sm text-slate-300">Subject</label>
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="mt-1 bg-slate-800 border-slate-700 text-white"
                            placeholder="Subject..."
                        />
                    </div>

                    <div>
                        <label className="text-sm text-slate-300">Message</label>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="mt-1 min-h-[180px] bg-slate-800 border-slate-700 text-white"
                            placeholder="Write your message..."
                        />
                    </div>

                    {error ? (
                        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="border-slate-700"
                            disabled={sending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSend}
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={!canSend || sending}
                        >
                            {sending ? "Sending..." : "Send Email"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
