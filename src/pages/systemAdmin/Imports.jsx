// src/pages/systemAdmin/Imports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { collection, doc, writeBatch } from "firebase/firestore";
import { db, functions } from "@/firebase";
import { Panel, CardShell, FieldLabel } from "./_ui.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";

const TARGETS = [
    { value: "User", label: "Users (Auth + User doc)" },
    { value: "__COLLECTION__", label: "Any collection (Firestore upsert)" },
];

function readWorkbook(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: "array" });
                resolve(wb);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function sheetToRows(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return Array.isArray(json) ? json : [];
}

function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
async function callListCollections() {
    const fn = httpsCallable(functions, "systemAdminListCollections");
    const res = await fn({});
    const list = Array.isArray(res?.data?.collections) ? res.data.collections : [];
    return list;
}

async function callGetSchema(collectionName) {
    const fn = httpsCallable(functions, "systemAdminGetCollectionSchema");
    const res = await fn({ collectionName, sampleSize: 50 });
    return res?.data || {};
}

function safeSheetName(name) {
    // Avoid regex flags issues; keep simple/compatible
    const badChars = /[\\[\]\*\?:\/]/g;
    const s = String(name || "Sheet").replace(badChars, " ").trim();
    return (s.slice(0, 31) || "Sheet");
}
function jsonToCsv(rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    return XLSX.utils.sheet_to_csv(ws);
}

export default function Imports() {
    const [target, setTarget] = useState("User");
    const [collectionName, setCollectionName] = useState("ActivityLog");
    const [idField, setIdField] = useState("id");

    const [collections, setCollections] = useState([]);
    const [loadingCollections, setLoadingCollections] = useState(false);

    const [file, setFile] = useState(null);
    const [rows, setRows] = useState([]);
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);

    const canImport = useMemo(() => rows.length > 0 && !busy, [rows.length, busy]);
    const canTemplate = useMemo(() => target === "__COLLECTION__" && String(collectionName || "").trim() && !busy, [target, collectionName, busy]);

    useEffect(() => {
        let alive = true;

        async function loadCollections() {
            setLoadingCollections(true);
            try {
                const fn = httpsCallable(functions, "systemAdminListCollections");
                const res = await fn({});
                const list = Array.isArray(res?.data?.collections) ? res.data.collections : [];
                if (!alive) return;
                setCollections(list);

                // If current collectionName isn't in list, keep it (manual entry allowed)
                if (!collectionName && list[0]) setCollectionName(list[0]);
            } catch (e) {
                console.error(e);
                // keep silent; manual entry still works
            } finally {
                if (alive) setLoadingCollections(false);
            }
        }

        loadCollections();
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function pickFile(f) {
        setMessage("");
        setRows([]);
        setFile(f || null);

        if (!f) return;

        try {
            const wb = await readWorkbook(f);
            const firstSheet = wb.SheetNames[0];
            const data = sheetToRows(wb, firstSheet);
            setRows(data.slice(0, 200)); // preview only
            setMessage(`Loaded ${data.length} rows from "${firstSheet}". Previewing first 200.`);
        } catch (e) {
            console.error(e);
            setMessage("Could not read file. Use .xlsx (first sheet).");
        }
    }

    async function downloadTemplateCsv() {
        const col = String(collectionName || "").trim();
        if (!col) return;

        setBusy(true);
        setMessage("");

        try {
            const fn = httpsCallable(functions, "systemAdminGetCollectionSchema");
            const res = await fn({ collectionName: col, sampleSize: 80 });
            const data = res?.data || {};

            const fieldOrder = Array.isArray(data.fieldOrder) ? data.fieldOrder : [];
            const exampleRow = (data.exampleRow && typeof data.exampleRow === "object") ? data.exampleRow : null;

            if (!fieldOrder.length) {
                setMessage(
                    data?.warning ||
                    `No schema detected for "${col}". Add SystemAdminSchemas/${col} to define fields.`
                );
                return;
            }

            const headers = ["id", ...fieldOrder];

            // One row: use example values if present; otherwise blank row with headers
            const row = { id: data?.exampleId || "" };
            for (const k of fieldOrder) row[k] = exampleRow?.[k] ?? "";

            const ws = XLSX.utils.json_to_sheet([row], { header: headers });
            const csv = XLSX.utils.sheet_to_csv(ws);

            downloadText(`${col}__template.csv`, csv);
            setMessage(`Template CSV downloaded for "${col}" (${data.source}).`);
        } catch (e) {
            console.error(e);
            setMessage("Template failed. Check Cloud Function logs + permissions.");
        } finally {
            setBusy(false);
        }
    }

    async function downloadTemplateWorkbookAll() {
        setBusy(true);
        setMessage("");

        try {
            const list = await callListCollections();
            if (!list.length) {
                setMessage("No collections available.");
                return;
            }

            const wb = XLSX.utils.book_new();

            // Limit to protect browser
            const cols = list.slice(0, 80);

            for (const col of cols) {
                try {
                    const data = await callGetSchema(col);
                    const fieldOrder = Array.isArray(data.fieldOrder) ? data.fieldOrder : Object.keys(data.fields || {}).sort();
                    const exampleRow = (data.exampleRow && typeof data.exampleRow === "object") ? data.exampleRow : null;

                    const headers = ["id", ...fieldOrder];

                    const row = { id: data?.exampleId || "" };
                    for (const k of fieldOrder) row[k] = exampleRow?.[k] ?? "";

                    const ws = XLSX.utils.json_to_sheet([row], { header: headers });
                    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(col));
                } catch (e) {
                    // If schema call fails for one collection, still build workbook with basic sheet
                    const ws = XLSX.utils.json_to_sheet([{ id: "" }]);
                    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(col));
                }
            }

            XLSX.writeFile(wb, `firestore_templates_${new Date().toISOString().slice(0, 10)}.xlsx`);
            setMessage(`Template workbook downloaded (${cols.length} sheets).`);
        } catch (e) {
            console.error(e);
            setMessage("Workbook template failed. Fix systemAdminListCollections first.");
        } finally {
            setBusy(false);
        }
    }

    async function importNow() {
        if (!file) return;

        setBusy(true);
        setMessage("");

        try {
            const wb = await readWorkbook(file);
            const firstSheet = wb.SheetNames[0];
            const data = sheetToRows(wb, firstSheet);

            if (!data.length) {
                setMessage("No rows found.");
                return;
            }

            if (target === "User") {
                const fn = httpsCallable(functions, "systemAdminBulkCreateUsers");
                const payload = data
                    .map((r) => ({
                        email: String(r.email || r.Email || "").trim().toLowerCase(),
                        full_name: String(r.full_name || r.fullName || r.Name || "").trim(),
                        app_role: String(r.app_role || r.role || "User").trim() || "User",
                    }))
                    .filter((x) => x.email);

                const res = await fn({ users: payload });
                if (!res?.data?.ok) throw new Error("Bulk create failed");

                setMessage(`Imported users: ${res.data.created || 0} created, ${res.data.updated || 0} updated.`);
                return;
            }

            // Generic Firestore upsert (client-side)
            const col = String(collectionName || "").trim();
            if (!col) throw new Error("Missing collection name.");

            const idKey = String(idField || "id").trim();

            const batchSize = 450;
            let written = 0;

            for (let i = 0; i < data.length; i += batchSize) {
                const slice = data.slice(i, i + batchSize);
                const batch = writeBatch(db);

                slice.forEach((r) => {
                    const id = String(r[idKey] || "").trim();
                    const payload = { ...r };
                    delete payload[idKey];

                    const ref = id ? doc(collection(db, col), id) : doc(collection(db, col));
                    batch.set(ref, payload, { merge: true });
                });

                await batch.commit();
                written += slice.length;
            }

            setMessage(`Imported ${written} rows into "${col}" (upsert).`);
        } catch (e) {
            console.error(e);
            setMessage("Import failed. Check console + permissions.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Panel
            title="Bulk Import"
            subtitle="Bulk import from Excel (.xlsx). Users go via Cloud Functions (Auth + User doc). Other collections are upserted client-side."
        >
            <CardShell>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 space-y-4">
                        <div>
                            <FieldLabel>Import target</FieldLabel>
                            <Select value={target} onValueChange={setTarget}>
                                <SelectTrigger className="mt-2 bg-slate-950 border-slate-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-950 text-white border-slate-800">
                                    {TARGETS.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>
                                            {t.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {target === "__COLLECTION__" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <FieldLabel>Collection name</FieldLabel>

                                    {/* ✅ NEW: dropdown that auto-loads top-level collections */}
                                    <Select
                                        value={String(collectionName || "")}
                                        onValueChange={(v) => setCollectionName(v)}
                                    >
                                        <SelectTrigger className="mt-2 bg-slate-950 border-slate-800">
                                            <SelectValue placeholder={loadingCollections ? "Loading..." : "Select collection"} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-950 text-white border-slate-800">
                                            {collections.map((c) => (
                                                <SelectItem key={c} value={c}>
                                                    {c}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Keep manual override input (you said you like everything else) */}
                                    <Input
                                        className="mt-2 bg-slate-950 border-slate-800"
                                        value={collectionName}
                                        onChange={(e) => setCollectionName(e.target.value)}
                                        placeholder="Or type collection name"
                                    />

                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="bg-slate-800 hover:bg-slate-700 text-white"
                                            disabled={!canTemplate || loadingCollections}
                                            onClick={downloadTemplateCsv}
                                        >
                                            Download template CSV (selected)
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="bg-slate-800 hover:bg-slate-700 text-white"
                                            disabled={loadingCollections || busy}
                                            onClick={downloadTemplateWorkbookAll}
                                        >
                                            Download template workbook (all)
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="bg-slate-800 hover:bg-slate-700 text-white"
                                            disabled={loadingCollections || busy}
                                            onClick={async () => {
                                                setLoadingCollections(true);
                                                try {
                                                    const fn = httpsCallable(functions, "systemAdminListCollections");
                                                    const res = await fn({});
                                                    const list = Array.isArray(res?.data?.collections) ? res.data.collections : [];
                                                    setCollections(list);
                                                    setMessage("Collections refreshed.");
                                                } catch (e) {
                                                    console.error(e);
                                                    setMessage("Could not refresh collections.");
                                                } finally {
                                                    setLoadingCollections(false);
                                                }
                                            }}
                                        >
                                            {loadingCollections ? "Refreshing..." : "Refresh list"}
                                        </Button>
                                    </div>

                                </div>

                                <div>
                                    <FieldLabel>ID field (optional)</FieldLabel>
                                    <Input
                                        className="mt-2 bg-slate-950 border-slate-800"
                                        value={idField}
                                        onChange={(e) => setIdField(e.target.value)}
                                    />
                                    <div className="mt-1 text-xs text-slate-400">
                                        If blank/unknown, rows will be inserted with auto IDs.
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div>
                            <FieldLabel>Excel file (.xlsx)</FieldLabel>
                            <Input
                                type="file"
                                className="mt-2 bg-slate-950 border-slate-800"
                                accept=".xlsx"
                                onChange={(e) => pickFile(e.target.files?.[0] || null)}
                            />
                            <div className="mt-2 text-xs text-slate-400">
                                The importer reads the <span className="text-slate-200">first sheet</span>. Use columns like email/full_name/app_role for users.
                            </div>
                        </div>

                        {message ? <div className="text-sm text-slate-200">{message}</div> : null}

                        <div className="flex justify-end">
                            <Button type="button" disabled={!canImport} onClick={importNow}>
                                {busy ? "Importing..." : "Run import"}
                            </Button>
                        </div>
                    </div>

                    <div>
                        <FieldLabel>Preview (first 200 rows)</FieldLabel>
                        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/30 overflow-auto max-h-[420px]">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {(rows[0] ? Object.keys(rows[0]).slice(0, 5) : []).map((k) => (
                                            <TableHead key={k} className="text-slate-300">{k}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.slice(0, 12).map((r, idx) => (
                                        <TableRow key={String(idx)}>
                                            {(Object.keys(rows[0] || {}).slice(0, 5)).map((k) => (
                                                <TableCell key={k} className="text-slate-200">
                                                    {String(r[k] ?? "").slice(0, 64)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {!rows.length ? <div className="p-3 text-sm text-slate-400">No file loaded.</div> : null}
                        </div>
                    </div>
                </div>
            </CardShell>
        </Panel>
    );
}