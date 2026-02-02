// src/components/admin/MailingListManager.jsx
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload, Mail, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

import {
    collection,
    doc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase";

/**
 * Firestore
 * Collection: mailingList
 * Doc ID: normalized email (lowercase)
 * Fields:
 * - name: string
 * - email: string
 * - is_active: boolean
 * - createdAt: timestamp
 * - updatedAt: timestamp
 */

/* ---------- CSV helpers ---------- */

function normalizeEmail(v) {
    return String(v || "")
        .trim()
        .toLowerCase();
}

function parseBoolish(v, defaultValue = true) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return defaultValue;
    if (["true", "1", "yes", "y", "active", "enabled"].includes(s)) return true;
    if (["false", "0", "no", "n", "inactive", "disabled", "not active"].includes(s)) return false;
    return defaultValue;
}

/**
 * Very small CSV parser that supports:
 * - commas
 * - quotes "..."
 * - escaped quotes ""
 */
function parseCsv(text) {
    const lines = String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .filter((l) => l.trim().length > 0);

    if (lines.length === 0) return [];

    const parseLine = (line) => {
        const out = [];
        let cur = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];

            if (ch === '"') {
                // Escaped quote
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === "," && !inQuotes) {
                out.push(cur);
                cur = "";
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out.map((x) => String(x ?? "").trim());
    };

    const first = parseLine(lines[0]);
    const hasHeader = first.some((h) =>
        ["name", "full_name", "email", "status", "is_active", "active"].includes(String(h || "").trim().toLowerCase())
    );

    if (!hasHeader) {
        // No header: assume [name,email,(status)]
        return lines.map((l) => {
            const row = parseLine(l);
            return {
                name: row[0] || "",
                email: row[1] || "",
                is_active: parseBoolish(row[2], true),
            };
        });
    }

    const headers = first.map((h) => String(h || "").trim().toLowerCase());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => (obj[h] = cols[idx]));
        const name = obj.name || obj.full_name || "";
        const email = obj.email || "";
        const is_active = obj.is_active != null ? parseBoolish(obj.is_active, true) : parseBoolish(obj.status || obj.active, true);
        rows.push({ name, email, is_active });
    }

    return rows;
}

function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/* ---------- Component ---------- */

export default function MailingListManager() {
    const queryClient = useQueryClient();

    const [search, setSearch] = useState("");
    const [newName, setNewName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);

    const { data: contacts = [], isLoading } = useQuery({
        queryKey: ["mailingList"],
        queryFn: async () => {
            const snap = await getDocs(collection(db, "mailingList"));
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            // stable sort: name, then email
            items.sort((a, b) => {
                const an = String(a.name || "").toLowerCase();
                const bn = String(b.name || "").toLowerCase();
                if (an !== bn) return an.localeCompare(bn);
                return String(a.email || "").toLowerCase().localeCompare(String(b.email || "").toLowerCase());
            });
            return items;
        },
        staleTime: 30_000,
    });

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return contacts;
        return contacts.filter((c) => {
            const name = String(c.name || "").toLowerCase();
            const email = String(c.email || "").toLowerCase();
            return name.includes(s) || email.includes(s);
        });
    }, [contacts, search]);

    const activeCount = useMemo(() => contacts.filter((c) => c.is_active !== false).length, [contacts]);

    const addOne = useMutation({
        mutationFn: async ({ name, email }) => {
            const e = normalizeEmail(email);
            if (!e) throw new Error("Email is required");
            const ref = doc(db, "mailingList", e);
            await setDoc(
                ref,
                {
                    name: String(name || "").trim(),
                    email: e,
                    is_active: true,
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                },
                { merge: true }
            );
        },
        onSuccess: () => {
            setNewName("");
            setNewEmail("");
            queryClient.invalidateQueries({ queryKey: ["mailingList"] });
        },
    });

    const toggleActive = useMutation({
        mutationFn: async ({ id, next }) => {
            await updateDoc(doc(db, "mailingList", id), {
                is_active: !!next,
                updatedAt: serverTimestamp(),
            });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mailingList"] }),
    });

    const deleteOne = useMutation({
        mutationFn: async ({ id }) => {
            await deleteDoc(doc(db, "mailingList", id));
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mailingList"] }),
    });

    const handleCsvUpload = async (file) => {
        if (!file) return;
        setUploadResult(null);
        setUploading(true);

        try {
            const text = await file.text();
            const parsed = parseCsv(text);

            // clean rows
            const cleaned = parsed
                .map((r) => ({
                    name: String(r.name || "").trim(),
                    email: normalizeEmail(r.email),
                    is_active: r.is_active !== false,
                }))
                .filter((r) => r.email);

            // de-dupe by email (last wins)
            const map = new Map();
            cleaned.forEach((r) => map.set(r.email, r));
            const unique = Array.from(map.values());

            // batch writes (500 per batch)
            const batches = chunkArray(unique, 450); // keep margin
            let upserted = 0;

            for (const group of batches) {
                const batch = writeBatch(db);
                for (const row of group) {
                    const ref = doc(db, "mailingList", row.email);
                    batch.set(
                        ref,
                        {
                            name: row.name,
                            email: row.email,
                            is_active: !!row.is_active,
                            updatedAt: serverTimestamp(),
                            createdAt: serverTimestamp(),
                        },
                        { merge: true }
                    );
                }
                await batch.commit();
                upserted += group.length;
            }

            setUploadResult({
                ok: true,
                upserted,
                totalParsed: parsed.length,
                totalValid: unique.length,
            });

            queryClient.invalidateQueries({ queryKey: ["mailingList"] });
        } catch (e) {
            setUploadResult({ ok: false, error: e?.message || "Upload failed" });
        } finally {
            setUploading(false);
        }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Mail className="h-5 w-5" />
                            Mailing List
                        </span>
                        <div className="flex items-center gap-2">
                            <Badge className="bg-slate-700/50 text-slate-200">
                                Total: {contacts.length}
                            </Badge>
                            <Badge className="bg-emerald-500/10 text-emerald-300">
                                Active: {activeCount}
                            </Badge>
                        </div>
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Upload */}
                    <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-white font-semibold">CSV Upload</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    Columns supported: <span className="text-slate-200">name, email, status</span> (status optional).
                                    <br />
                                    If no header row, we assume: <span className="text-slate-200">Name, Email, Status</span>.
                                </p>
                            </div>

                            <label className="inline-flex items-center">
                                <input
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = "";
                                        if (f) handleCsvUpload(f);
                                    }}
                                    disabled={uploading}
                                />
                                <Button type="button" className="bg-blue-600 hover:bg-blue-700" disabled={uploading}>
                                    <Upload className="h-4 w-4 mr-2" />
                                    {uploading ? "Uploading..." : "Upload CSV"}
                                </Button>
                            </label>
                        </div>

                        {uploadResult ? (
                            <div
                                className={`mt-3 text-sm rounded-md p-3 border ${uploadResult.ok
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-200"
                                        : "bg-red-500/10 border-red-500/20 text-red-200"
                                    }`}
                            >
                                {uploadResult.ok ? (
                                    <>
                                        Uploaded. Upserted <b>{uploadResult.upserted}</b> contacts (valid unique),
                                        parsed {uploadResult.totalParsed}.
                                    </>
                                ) : (
                                    <>Upload failed: {uploadResult.error}</>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Manual add */}
                    <div className="bg-slate-800/20 border border-slate-800 rounded-xl p-4">
                        <p className="text-white font-semibold mb-3">Add Contact</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <Label className="text-slate-300">Name</Label>
                                <Input
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="e.g., Jane Smith"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <Label className="text-slate-300">Email *</Label>
                                <Input
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="e.g., jane@company.com"
                                />
                            </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <Button
                                type="button"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={() => addOne.mutate({ name: newName, email: newEmail })}
                                disabled={!normalizeEmail(newEmail) || addOne.isPending}
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                {addOne.isPending ? "Adding..." : "Add"}
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-700 text-slate-200"
                                onClick={() => queryClient.invalidateQueries({ queryKey: ["mailingList"] })}
                            >
                                <RefreshCcw className="h-4 w-4 mr-2" />
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="flex flex-col md:flex-row gap-3">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-slate-900/50 border-slate-800 text-white"
                            placeholder="Search name or email..."
                        />
                    </div>

                    {/* List */}
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <div className="grid grid-cols-12 bg-slate-800/40 px-3 py-2 text-xs text-slate-300">
                            <div className="col-span-4">Name</div>
                            <div className="col-span-5">Email</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-1 text-right"> </div>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="p-4 text-sm text-slate-400">No contacts found.</div>
                        ) : (
                            <div className="divide-y divide-slate-800">
                                {filtered.map((c) => {
                                    const active = c.is_active !== false;
                                    return (
                                        <div key={c.id} className="grid grid-cols-12 px-3 py-3 items-center">
                                            <div className="col-span-4 text-white truncate">
                                                {c.name || "—"}
                                            </div>
                                            <div className="col-span-5 text-slate-300 truncate">
                                                {c.email}
                                            </div>

                                            <div className="col-span-2 flex items-center gap-2">
                                                <Switch
                                                    checked={active}
                                                    onCheckedChange={(v) => toggleActive.mutate({ id: c.id, next: v })}
                                                    disabled={toggleActive.isPending}
                                                />
                                                <span className={`text-xs ${active ? "text-emerald-300" : "text-slate-400"}`}>
                                                    {active ? "Active" : "Not Active"}
                                                </span>
                                            </div>

                                            <div className="col-span-1 flex justify-end">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="text-red-400 hover:text-red-300"
                                                    onClick={() => {
                                                        const ok = window.confirm(`Delete ${c.email}?`);
                                                        if (ok) deleteOne.mutate({ id: c.id });
                                                    }}
                                                    disabled={deleteOne.isPending}
                                                    title="Delete"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
