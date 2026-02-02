// src/lib/csv/simpleCsv.js

/**
 * Minimal CSV utilities for simple admin imports.
 * Supports:
 * - comma delimiter
 * - quoted fields with escaped quotes ("")
 * - CRLF / LF newlines
 */

export function parseCsv(text) {
    const input = (text ?? "").toString();
    const rows = [];

    let row = [];
    let field = "";
    let i = 0;
    let inQuotes = false;

    const pushField = () => {
        row.push(field);
        field = "";
    };
    const pushRow = () => {
        // Avoid pushing a trailing empty row from final newline
        if (row.length === 1 && row[0] === "" && rows.length > 0) return;
        rows.push(row);
        row = [];
    };

    while (i < input.length) {
        const ch = input[i];

        if (inQuotes) {
            if (ch === '"') {
                const next = input[i + 1];
                if (next === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                continue;
            }

            field += ch;
            i += 1;
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }

        if (ch === ",") {
            pushField();
            i += 1;
            continue;
        }

        if (ch === "\n") {
            pushField();
            pushRow();
            i += 1;
            continue;
        }

        if (ch === "\r") {
            // Handle CRLF
            if (input[i + 1] === "\n") {
                pushField();
                pushRow();
                i += 2;
            } else {
                pushField();
                pushRow();
                i += 1;
            }
            continue;
        }

        field += ch;
        i += 1;
    }

    pushField();
    pushRow();

    if (rows.length === 0) return { headers: [], records: [] };

    const headers = rows[0].map((h) => (h ?? "").toString().trim());
    const records = rows.slice(1).filter((r) => r.some((v) => (v ?? "").toString().trim() !== ""));

    return { headers, records };
}

export function toCsv(headers, rows) {
    const escapeCell = (v) => {
        const s = (v ?? "").toString();
        if (/[",\r\n]/.test(s)) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    };

    const lines = [];
    lines.push(headers.map(escapeCell).join(","));
    for (const row of rows) {
        lines.push(headers.map((h) => escapeCell(row[h])).join(","));
    }
    return lines.join("\r\n") + "\r\n";
}
