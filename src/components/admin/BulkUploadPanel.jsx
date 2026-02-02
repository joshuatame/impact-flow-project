// src/components/admin/BulkUploadPanel.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { saveAs } from "file-saver";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { parseCsv, toCsv } from "@/lib/csv/simpleCsv";

const ENTITIES = {
    participants: {
        label: "Participants",
        filename: "participants_template.csv",
        headers: [
            "first_name",
            "last_name",
            "date_of_birth",
            "gender",
            "indigenous_status",
            "contact_email",
            "contact_phone",
            "address_line1",
            "address_line2",
            "suburb",
            "state",
            "postcode",
            "emergency_contact_name",
            "emergency_contact_phone",
            "primary_case_worker_id",
            "current_phase",
            "status",
            "dex_id",
        ],
        exampleRow: {
            first_name: "Jane",
            last_name: "Citizen",
            date_of_birth: "1990-01-15",
            gender: "Female",
            indigenous_status: "No",
            contact_email: "jane.citizen@example.com",
            contact_phone: "0400 000 000",
            address_line1: "123 Example St",
            address_line2: "",
            suburb: "Brisbane",
            state: "QLD",
            postcode: "4000",
            emergency_contact_name: "John Citizen",
            emergency_contact_phone: "0400 111 111",
            primary_case_worker_id: "",
            current_phase: "Pre Employment Support",
            status: "Active",
            dex_id: "",
        },
        async importRow(row) {
            const payload = {};

            for (const key of ENTITIES.participants.headers) {
                if (row[key] !== undefined) payload[key] = row[key];
            }

            // Normalize common fields (strings)
            for (const [k, v] of Object.entries(payload)) {
                payload[k] = (v ?? "").toString().trim();
            }

            // Optional: allow empty strings to remain empty (Firebase schema already handles this)
            // Required minimal fields
            if (!payload.first_name || !payload.last_name) {
                throw new Error("Missing required fields: first_name, last_name");
            }

            await base44.entities.Participant.create(payload);
        },
    },

programs: {
    label: "Programs",
    filename: "programs_template.csv",
    headers: [
        "program_name",
        "contract_code",
        "funder_name",
        "start_date",
        "end_date",
        "target_cohort_description",
        "location",
        "total_funding_amount",
        "dex_reporting_required",
        "status",
    ],
    exampleRow: {
        program_name: "Example Program",
        contract_code: "CON-001",
        funder_name: "Example Funder",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        target_cohort_description: "Target cohort description",
        location: "Brisbane",
        total_funding_amount: "100000",
        dex_reporting_required: "false",
        status: "Active",
    },
    async importRow(row) {
        const payload = {};
        for (const key of ENTITIES.programs.headers) {
            if (row[key] !== undefined) payload[key] = row[key];
        }
        payload.total_funding_amount = payload.total_funding_amount ? Number(payload.total_funding_amount) : 0;
        payload.dex_reporting_required =
            String(payload.dex_reporting_required || "false").toLowerCase() === "true";

        await base44.entities.Program.create(payload);
    },
},

funding_programs: {
    label: "Funding (Programs)",
    filename: "funding_programs_template.csv",
    headers: [
        "record_type",
        "linked_program_ids",
        "linked_program_names",
        "funding_source_name",
        "category",
        "amount",
        "funding_date",
        "invoice_number",
        "description",
        "dex_reporting_flag",
        "supplier_name",
        "supplier_is_indigenous",
    ],
    exampleRow: {
        record_type: "FundingAllocation",
        linked_program_ids: "PROGRAM_ID_1;PROGRAM_ID_2",
        linked_program_names: "",
        funding_source_name: "Department",
        category: "Other",
        amount: "5000",
        funding_date: "2026-01-10",
        invoice_number: "INV-001",
        description: "Allocation",
        dex_reporting_flag: "false",
        supplier_name: "",
        supplier_is_indigenous: "Unknown",
    },
    async importRow(row, context) {
        const payload = {};
        for (const key of ENTITIES.funding_programs.headers) {
            if (row[key] !== undefined) payload[key] = row[key];
        }

        const ids = String(payload.linked_program_ids || "")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean);

        const names = String(payload.linked_program_names || "")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean);

        const programIds = ids.length
            ? ids
            : names.map((n) => {
                const key = String(n || "").trim();
                const id = context?.programIdByName?.get(key);
                if (!id) throw new Error(`Program name not found (strict match): ${key}`);
                return id;
            });

        if (programIds.length === 0) {
            throw new Error("linked_program_ids or linked_program_names is required (semicolon-separated).");
        }

        await base44.entities.FundingRecord.create({
            record_type: payload.record_type || "Expense",
            linked_program_ids: programIds,
            linked_participant_ids: [],
            funding_source_name: payload.funding_source_name || "",
            category: payload.category || "Other",
            amount: payload.amount ? Number(payload.amount) : 0,
            funding_date: payload.funding_date || new Date().toISOString().split("T")[0],
            invoice_number: payload.invoice_number || "",
            description: payload.description || "",
            dex_reporting_flag: String(payload.dex_reporting_flag || "false").toLowerCase() === "true",
            supplier_name: payload.supplier_name || "",
            supplier_is_indigenous: payload.supplier_is_indigenous || "Unknown",
        });
    },
},

funding_participants: {
    label: "Funding (Participants)",
    filename: "funding_participants_template.csv",
    headers: [
        "record_type",
        "linked_participant_ids",
        "linked_participant_emails",
        "funding_source_name",
        "category",
        "amount",
        "funding_date",
        "invoice_number",
        "description",
        "dex_reporting_flag",
        "supplier_name",
        "supplier_is_indigenous",
    ],
    exampleRow: {
        record_type: "Expense",
        linked_participant_ids: "PARTICIPANT_ID_1;PARTICIPANT_ID_2",
        linked_participant_emails: "",
        funding_source_name: "Internal",
        category: "Other",
        amount: "250",
        funding_date: "2026-01-12",
        invoice_number: "INV-100",
        description: "Participant expense",
        dex_reporting_flag: "false",
        supplier_name: "Supplier Pty Ltd",
        supplier_is_indigenous: "Unknown",
    },
    async importRow(row, context) {
        const payload = {};
        for (const key of ENTITIES.funding_participants.headers) {
            if (row[key] !== undefined) payload[key] = row[key];
        }

        const ids = String(payload.linked_participant_ids || "")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean);

        const emails = String(payload.linked_participant_emails || "")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean);

        const participantIds = ids.length
            ? ids
            : emails.map((e) => {
                const key = String(e || "").trim();
                const id = context?.participantIdByEmail?.get(key);
                if (!id) throw new Error(`Participant email not found (strict match): ${key}`);
                return id;
            });

        if (participantIds.length === 0) {
            throw new Error("linked_participant_ids or linked_participant_emails is required (semicolon-separated).");
        }

        await base44.entities.FundingRecord.create({
            record_type: payload.record_type || "Expense",
            linked_program_ids: [],
            linked_participant_ids: participantIds,
            funding_source_name: payload.funding_source_name || "",
            category: payload.category || "Other",
            amount: payload.amount ? Number(payload.amount) : 0,
            funding_date: payload.funding_date || new Date().toISOString().split("T")[0],
            invoice_number: payload.invoice_number || "",
            description: payload.description || "",
            dex_reporting_flag: String(payload.dex_reporting_flag || "false").toLowerCase() === "true",
            supplier_name: payload.supplier_name || "",
            supplier_is_indigenous: payload.supplier_is_indigenous || "Unknown",
        });
    },
},

};

function buildRecords(headers, records) {
    const normalized = [];
    for (const rec of records) {
        const rowObj = {};
        for (let i = 0; i < headers.length; i += 1) {
            rowObj[headers[i]] = rec[i] ?? "";
        }
        normalized.push(rowObj);
    }
    return normalized;
}

export default function BulkUploadPanel() {
    const [entityKey, setEntityKey] = useState("participants");
    const entity = ENTITIES[entityKey];

    const [file, setFile] = useState(null);
    const [rawText, setRawText] = useState("");
    const [headers, setHeaders] = useState([]);
    const [rows, setRows] = useState([]);

    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [parseError, setParseError] = useState(null);

    const [importReport, setImportReport] = useState(null);

    const previewRows = useMemo(() => rows.slice(0, 20), [rows]);
    const previewCols = useMemo(() => {
        const cols = new Set([...(headers || [])]);
        for (const h of entity.headers) cols.add(h);
        return Array.from(cols).filter(Boolean);
    }, [headers, entity.headers]);

    
const downloadImportReport = () => {
    if (!importReport || importReport.length === 0) return;
    const headers = Object.keys(importReport[0] || {});
    const csv = toCsv(headers, importReport);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `${entityKey}_import_report.csv`);
};

const downloadTemplate = () => {
        const csv = toCsv(entity.headers, [entity.exampleRow]);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        saveAs(blob, entity.filename);
    };

    const onFileChange = async (e) => {
        const f = e.target.files?.[0] || null;
        setFile(f);
        setImportResult(null);
        setImportReport(null);
        setParseError(null);
        setHeaders([]);
        setRows([]);
        setRawText("");

        if (!f) return;

        try {
            const text = await f.text();
            setRawText(text);
            const parsed = parseCsv(text);
            setHeaders(parsed.headers);
            setRows(buildRecords(parsed.headers, parsed.records));
        } catch (err) {
            console.error(err);
            setParseError(err?.message || String(err));
        }
    };

    const importCsv = async () => {
        if (!rows.length) {
            alert("No rows to import.");
            return;
        }

        
setImporting(true);
setImportResult(null);
setImportReport(null);

const context = {};

if (entityKey === "funding_programs") {
    const programs = await base44.entities.Program.list("-created_date", 5000);
    context.programIdByName = new Map(
        programs.map((p) => [String(p.program_name || "").trim(), p.id])
    );
}

if (entityKey === "funding_participants") {
    const participants = await base44.entities.Participant.list("-created_date", 5000);
    context.participantIdByEmail = new Map(
        participants.map((p) => [String(p.email || "").trim(), p.id])
    );
}

const reportRows = [];
        setImportReport(null);

        let ok = 0;
        let failed = 0;
        const errors = [];

        try {
            for (let i = 0; i < rows.length; i += 1) {
                const row = rows[i];
                try {
                    await entity.importRow(row, context);
                    ok += 1;
                } catch (e) {
                    failed += 1;
                    const msg = e?.message || String(e);
                    errors.push({ row: i + 2, error: msg });
                    reportRows.push({ row: i + 2, entity: entity.label, status: "failed", error: msg, ...row }); // +2 for header row + 1-index
                }
            }

            setImportResult({ ok, failed, errors });
            setImportReport(reportRows);
        } finally {
            setImporting(false);
        }
    };

    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white">Bulk Upload</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-slate-300">Entity</Label>
                        <Select value={entityKey} onValueChange={setEntityKey}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                <SelectValue placeholder="Select entity" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(ENTITIES).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>
                                        {v.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-300">CSV Template</Label>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={downloadTemplate}
                            >
                                Download CSV Template
                            </Button>
                        </div>
                        <p className="text-xs text-slate-400">
                            Includes one example row. Dates should be YYYY-MM-DD.
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-slate-300">Upload CSV</Label>
                    <Input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={onFileChange}
                        className="bg-slate-800 border-slate-700 text-white"
                    />
                    {file && (
                        <p className="text-xs text-slate-400">
                            Selected: {file.name}
                        </p>
                    )}
                    {parseError && (
                        <p className="text-sm text-red-300">
                            CSV parse error: {parseError}
                        </p>
                    )}
                </div>

                {rows.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <p className="text-slate-300 text-sm">
                                Previewing first {previewRows.length} of {rows.length} rows
                            </p>
                            <Button
                                type="button"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={importCsv}
                                disabled={importing}
                            >
                                {importing ? "Importing..." : "Import"}
                            </Button>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-900/30">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {previewCols.map((h) => (
                                            <TableHead key={h} className="text-slate-300">
                                                {h}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewRows.map((r, idx) => (
                                        <TableRow key={idx}>
                                            {previewCols.map((h) => (
                                                <TableCell key={h} className="text-slate-200">
                                                    {r[h] ?? ""}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                {importResult && (
                    <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-2">
                        <p className="text-white font-semibold">Import result</p>
                        <p className="text-slate-300 text-sm">
                            Created: {importResult.ok} • Failed: {importResult.failed}
                        </p>
                        {importResult.errors?.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-slate-300 text-sm">Errors (row number in CSV):</p>
                                <ul className="list-disc list-inside text-sm text-red-200 space-y-1">
                                    {importResult.errors.slice(0, 20).map((e, i) => (
                                        <li key={i}>
                                            Row {e.row}: {e.error}
                                        </li>
                                    ))}
                                </ul>
                                {importResult.errors.length > 20 && (
                                    <p className="text-xs text-slate-400">
                                        Showing first 20 errors.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
