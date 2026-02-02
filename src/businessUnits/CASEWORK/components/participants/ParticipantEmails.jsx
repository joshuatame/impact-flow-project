// src/components/participant-detail/ParticipantEmails.jsx
import React, { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db, functions } from "@/firebase";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmailComposerDialog from "@/components/email/EmailComposerDialog.jsx";

function fmtTs(ts) {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
}

function escapeHtml(s) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function nl2brHtml(text) {
    return escapeHtml(text).replace(/\n/g, "<br/>");
}

export default function ParticipantEmails({ participantId, participant }) {
    const participantName = useMemo(() => {
        const fn = String(participant?.first_name || "").trim();
        const ln = String(participant?.last_name || "").trim();
        return `${fn} ${ln}`.trim() || "Participant";
    }, [participant]);

    const [loading, setLoading] = useState(true);
    const [threads, setThreads] = useState([]);
    const [activeThreadId, setActiveThreadId] = useState("");
    const [messages, setMessages] = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);

    const [replyText, setReplyText] = useState("");
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState("");

    const [newEmailOpen, setNewEmailOpen] = useState(false);

    const activeThread = useMemo(
        () => threads.find((t) => t.id === activeThreadId) || null,
        [threads, activeThreadId]
    );

    const loadThreads = async () => {
        if (!participantId) return;

        setLoading(true);
        setErr("");
        try {
            const qRef = query(
                collection(db, "EmailThread"),
                where("context_type", "==", "PARTICIPANT"),
                where("context_id", "==", String(participantId))
            );

            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

            // Sort client-side safely (no index needed)
            rows.sort((a, b) => {
                const at = a.updated_at?.toMillis?.() || a.last_message_at?.toMillis?.() || 0;
                const bt = b.updated_at?.toMillis?.() || b.last_message_at?.toMillis?.() || 0;
                return bt - at;
            });

            setThreads(rows);
            if (!activeThreadId && rows.length) setActiveThreadId(rows[0].id);
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    const loadMessages = async (threadId) => {
        if (!threadId) {
            setMessages([]);
            return;
        }

        setLoadingMsgs(true);
        setErr("");
        try {
            const qRef = query(collection(db, "EmailThread", threadId, "messages"), orderBy("created_at", "asc"));
            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
            setMessages(rows);
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoadingMsgs(false);
        }
    };

    useEffect(() => {
        loadThreads();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [participantId]);

    useEffect(() => {
        if (!activeThreadId) return;
        loadMessages(activeThreadId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeThreadId]);

    const sendReply = async () => {
        setErr("");

        const text = String(replyText || "").trim();
        if (!activeThread) return setErr("Select a thread first.");
        if (!text) return setErr("Write a reply first.");

        setSending(true);
        try {
            const fn = httpsCallable(functions, "sendParticipantEmail");

            // keep subject so backend reuses same thread
            const subj = String(activeThread.subject || "Impact Central").trim();

            const html = `<div style="font-family:Arial,sans-serif;line-height:1.45;white-space:pre-wrap">${nl2brHtml(
                text
            )}</div>`;

            await fn({
                participantId: String(participantId),
                subject: subj,
                html,
                text,
            });

            setReplyText("");
            await loadMessages(activeThread.id);
            await loadThreads();
        } catch (e) {
            setErr(e?.message || "Failed to send.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6">
            {/* New email dialog */}
            <EmailComposerDialog
                open={newEmailOpen}
                onOpenChange={setNewEmailOpen}
                mode="participant"
                participantId={String(participantId || "")}
                toLabel={String(participant?.contact_email || "")}
                defaultSubject={`Update for ${participantName}`}
            />

            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div className="text-white font-semibold text-lg">Email history</div>
                    <div className="text-slate-400 text-sm">
                        Threads linked to <span className="text-slate-200">{participantName}</span>
                    </div>
                </div>

                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setNewEmailOpen(true)}>
                    New email
                </Button>
            </div>

            {err ? (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2 mb-4">
                    {err}
                </div>
            ) : null}

            {loading ? (
                <LoadingSpinner />
            ) : threads.length === 0 ? (
                <div className="text-slate-400">No email threads yet.</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Thread list */}
                    <div className="lg:col-span-1 space-y-2">
                        {threads.map((t) => {
                            const active = t.id === activeThreadId;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveThreadId(t.id)}
                                    className={[
                                        "w-full text-left rounded-xl border p-3 transition-colors",
                                        active
                                            ? "bg-slate-800/70 border-slate-600"
                                            : "bg-slate-950/20 border-slate-800 hover:border-slate-700",
                                    ].join(" ")}
                                >
                                    <div className="text-white font-medium truncate">{t.subject || "Email"}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Updated: {fmtTs(t.updated_at || t.last_message_at)}
                                    </div>
                                    <div className="mt-2">
                                        <Badge className="bg-slate-800/70 text-slate-200 border border-slate-700/60">
                                            {t.status || "OPEN"}
                                        </Badge>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Messages + reply */}
                    <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/20 p-3">
                        {!activeThread ? (
                            <div className="text-slate-400">Select a thread.</div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                                    <div className="min-w-0">
                                        <div className="text-white font-semibold truncate">{activeThread.subject}</div>
                                        <div className="text-xs text-slate-500 truncate">
                                            Thread: {activeThread.id}
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="border-slate-700"
                                        onClick={() => loadMessages(activeThread.id)}
                                    >
                                        Refresh
                                    </Button>
                                </div>

                                <div className="py-3 space-y-3">
                                    {loadingMsgs ? (
                                        <LoadingSpinner />
                                    ) : messages.length === 0 ? (
                                        <div className="text-slate-400">No messages in this thread yet.</div>
                                    ) : (
                                        messages.map((m) => (
                                            <div
                                                key={m.id}
                                                className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-sm text-slate-200">
                                                        <span className="font-semibold">
                                                            {m.direction === "INBOUND" ? "From" : "To"}:
                                                        </span>{" "}
                                                        <span className="text-slate-300">
                                                            {m.direction === "INBOUND"
                                                                ? m.from_email || m.from_name || "Unknown"
                                                                : m.to_email || ""}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-slate-500">{fmtTs(m.created_at)}</div>
                                                </div>

                                                <div className="mt-2">
                                                    {m.html ? (
                                                        <div
                                                            className="prose prose-invert max-w-none"
                                                            dangerouslySetInnerHTML={{ __html: m.html }}
                                                        />
                                                    ) : (
                                                        <pre className="whitespace-pre-wrap text-slate-200 text-sm">
                                                            {m.text || ""}
                                                        </pre>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Reply box */}
                                <div className="pt-3 border-t border-slate-800 space-y-2">
                                    <div className="text-sm text-slate-300">Reply in this thread</div>
                                    <Textarea
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        className="bg-slate-800 border-slate-700 text-white min-h-[120px]"
                                        placeholder="Type your reply..."
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            onClick={sendReply}
                                            className="bg-blue-600 hover:bg-blue-700"
                                            disabled={sending}
                                        >
                                            {sending ? "Sending..." : "Send reply"}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
