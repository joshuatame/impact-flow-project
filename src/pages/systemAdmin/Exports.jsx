/**************************************************************************************************
 * FILE: src/pages/systemAdmin/Exports.jsx
 * CHANGE: auto-load collections + export one/all. Uses schema to build a template too.
 * (This keeps it client-driven for now; large exports should be moved server-side later.)
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/firebase";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { systemAdminGetCollectionSchema, systemAdminListCollections } from "@/lib/systemAdminApi";

function safeSheetName(name) {
    const s = String(name ?? "Sheet").replace(/[\[\]\*\?\/\\:]/g, " ").trim();
    return s.slice(0, 31) || "Sheet";
}

function toRowsFromDocs(docs) {
    return docs.map((d) => ({ id: d.id, ...d.data() }));
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function buildCsv(rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    return csv;
}

export default function Exports() {
    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");

    useEffect(() => {
        let alive = true;
        async function run() {
            setLoading(true);
            setStatus("");
            try {
                const cols = await systemAdminListCollections();
                if (!alive) return;
                setCollections(cols);
                setSelected(cols[0] || "");
            } catch (e) {
                console.error(e);
                if (!alive) return;
                setStatus("Could not load collections.");
            } finally {
                if (alive) setLoading(false);
            }
        }
        run();
        return () => {
            alive = false;
        };
    }, []);

    const canExport = useMemo(() => Boolean(selected) && !busy, [selected, busy]);

    async function exportCollectionAsXlsx(collectionName) {
        const snap = await getDocs(collection(db, collectionName));
        const rows = toRowsFromDocs(snap.docs);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(collectionName));
        const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
        downloadBlob(`${collectionName}.xlsx`, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    }

    async function exportCollectionAsCsv(collectionName) {
        const snap = await getDocs(collection(db, collectionName));
        const rows = toRowsFromDocs(snap.docs);
        const csv = buildCsv(rows);
        downloadBlob(`${collectionName}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
    }

    async function exportAllAsZip() {
        const zip = new JSZip();
        for (const c of collections) {
            const snap = await getDocs(collection(db, c));
            const rows = toRowsFromDocs(snap.docs);
            const csv = buildCsv(rows);
            zip.file(`${c}.csv`, csv);
        }
        const out = await zip.generateAsync({ type: "blob" });
        downloadBlob("firestore_export_all_csv.zip", out);
    }

    

    return (
        <div className="p-6 space-y-4">
            <div className="text-2xl font-semibold">Exports</div>

            <Card className="rounded-2xl">
                <CardHeader>
                    <CardTitle>Export Firestore data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {loading ? <div className="text-sm text-slate-400">Loading collections…</div> : null}
                    {status ? <div className="text-sm text-rose-300">{status}</div> : null}

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                        <div className="flex-1">
                            <label className="text-xs text-slate-400">Collection</label>
                            <select
                                className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2"
                                value={selected}
                                onChange={(e) => setSelected(e.target.value)}
                            >
                                {collections.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                            <Button disabled={!canExport} onClick={async () => { setBusy(true); setStatus(""); try { await exportCollectionAsCsv(selected); } finally { setBusy(false); } }}>
                                Export CSV
                            </Button>
                            <Button disabled={!canExport} onClick={async () => { setBusy(true); setStatus(""); try { await exportCollectionAsXlsx(selected); } finally { setBusy(false); } }}>
                                Export XLSX
                            </Button>
                           
                            <Button
                                variant="secondary"
                                className="bg-slate-800 hover:bg-slate-700"
                                disabled={!collections.length || busy}
                                onClick={async () => {
                                    setBusy(true);
                                    setStatus("");
                                    try {
                                        await exportAllAsZip();
                                    } catch (e) {
                                        console.error(e);
                                        setStatus("Could not export all.");
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            >
                                Export ALL (ZIP CSV)
                            </Button>
                        </div>
                    </div>

                    <div className="text-xs text-slate-500">
                        Note: This lists top-level collections. Subcollections aren’t discoverable without a registry.
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}