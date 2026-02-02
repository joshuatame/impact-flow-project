// src/pages/PublicReply.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function useToken() {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("token") || "";
}

function fmt(ts) {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : typeof ts === "string" ? new Date(ts) : new Date(ts);
    return d.toLocaleString();
}

function functionsBaseUrl() {
    // Prefer hosting rewrites. If you don't have them, set:
    // VITE_FUNCTIONS_BASE_URL=https://australia-southeast1-impact-flow-jpc.cloudfunctions.net
    return import.meta?.env?.VITE_FUNCTIONS_BASE_URL || "";
}

export default function PublicReply() {
    const token = useToken();
    const [loading, setLoading] = useState(true);
    const [thread, setThread] = useState(null);
    const [messages, setMessages] = useState([]);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [sentOk, setSentOk] = useState(false);
    const [err, setErr] = useState("");

    const base = useMemo(() => {
        const fb = functionsBaseUrl();
        return fb ? fb.replace(/\/+$/, "") : "";
    }, []);

    const url = (path) => (base ? `${base}${path}` : path);

    const reload = async () => {
        const res = await fetch(url(`/publicReplyGet?token=${encodeURIComponent(token)}`), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Failed to load thread");
        setThread(json.thread);
        setMessages(Array.isArray(json.messages) ? json.messages : []);
    };

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                setErr("");
                await reload();
            } catch (e) {
                if (mounted) setErr(String(e?.message || e));
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const send = async () => {
        setSending(true);
        setErr("");
        try {
            const res = await fetch(url(`/publicReplyPost?token=${encodeURIComponent(token)}`), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, text }),
            });
            const json = await res.json();
            if (!json.ok) throw new Error(json.error || "Send failed");
            setSentOk(true);
            setText("");
            await reload();
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                    <div className="text-2xl font-bold">Reply</div>
                    <div className="text-sm text-slate-400 mt-1">
                        {thread?.subject || (loading ? "Loading..." : "Email")}
                    </div>
                </div>

                {err && (
                    <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-4 text-red-200">
                        {err}
                    </div>
                )}

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
                    <div className="text-sm text-slate-400">Email chain</div>
                    {loading ? (
                        <div className="text-slate-400">Loading...</div>
                    ) : (
                        <div className="space-y-3">
                            {messages.map((m) => (
                                <details key={m.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                                    <summary className="cursor-pointer">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm text-white">
                                                <span className="font-semibold">{m.direction === "INBOUND" ? "From" : "To"}:</span>{" "}
                                                <span className="text-slate-300">
                                                    {m.direction === "INBOUND" ? (m.from_email || m.from_name || "Unknown") : (m.to_email || "")}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-500">{fmt(m.created_at)}</div>
                                        </div>
                                    </summary>
                                    <div className="mt-3">
                                        {m.html ? (
                                            <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: m.html }} />
                                        ) : (
                                            <pre className="whitespace-pre-wrap text-slate-200 text-sm">{m.text || ""}</pre>
                                        )}
                                    </div>
                                </details>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
                    <div className="text-sm text-slate-400">Your reply</div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-slate-800 border-slate-700 text-white"
                            placeholder="Your name (optional)"
                        />
                        <Input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-slate-800 border-slate-700 text-white"
                            placeholder="Your email (optional)"
                        />
                    </div>

                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white min-h-[160px]"
                        placeholder="Type your reply..."
                    />

                    <div className="flex items-center gap-3">
                        <Button
                            onClick={send}
                            disabled={sending || !text.trim()}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {sending ? "Sending..." : "Send reply"}
                        </Button>
                        {sentOk && <div className="text-emerald-400 text-sm">Sent ✅</div>}
                    </div>

                    <div className="text-xs text-slate-500">
                        This reply is delivered into Impact Central and notifies the staff member who sent the email.
                    </div>
                </div>
            </div>
        </div>
    );
}
