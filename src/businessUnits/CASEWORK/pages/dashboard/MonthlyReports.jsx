import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, FileText, Sparkles, Save, Upload, Trash2, Eye, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/firebase";
import {
    addDoc,
    collection,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";
import { jsPDF } from "jspdf";

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function uid() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeForPdf(input) {
    const s = safeText(input);
    return s
        .replace(/\u2022/g, "-") // bullet • -> hyphen
        .replace(/\u00A0/g, " ") // non-breaking space
        .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
        .normalize("NFKD")
        .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function downloadHtmlAsDoc(filename, htmlBody) {
    const html = `<!doctype html><html><head><meta charset="utf-8" />
  <title>${escapeHtml(filename)}</title></head><body>${htmlBody}</body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function openPrintPdfWindow(title, htmlBody) {
    const w = window.open("", "_blank");
    if (!w) {
        alert("Popup blocked. Please allow popups.");
        return;
    }
    const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; margin: 0; padding: 24px; color: #111827; }
        .wrap { max-width: 960px; margin: 0 auto; }
        .btn { position: fixed; right: 16px; top: 16px; background: #111827; color: #fff; border: none; padding: 10px 14px; border-radius: 10px; cursor: pointer; }
        @media print { .btn { display: none; } }
        h1,h2,h3 { margin: 0 0 10px 0; }
        p { margin: 0 0 10px 0; line-height: 1.55; }
        .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-bottom: 12px; background: #fff; }
        .muted { color:#6b7280; font-size: 12px; }
        pre { white-space: pre-wrap; margin: 0; line-height: 1.55; }
        ul { margin: 0; padding-left: 18px; }
        li { margin: 0 0 6px 0; }
      </style>
    </head>
    <body>
      <button class="btn" onclick="window.print()">Save as PDF</button>
      <div class="wrap">${htmlBody}</div>
    </body>
  </html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
}

// Optional: parse questions from extracted text (PDF)
function parseQuestionsFromText(text) {
    const raw = safeText(text).trim();
    if (!raw) return [];
    const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    const questions = [];
    let buffer = [];
    const flush = () => {
        const q = buffer.join(" ").trim();
        if (q) questions.push(q);
        buffer = [];
    };

    for (const line of lines) {
        const isQ =
            line.endsWith("?") ||
            /^q\d+[:\.)]/i.test(line) ||
            /^question\s*\d+[:\.)]/i.test(line);

        if (isQ && buffer.length) flush();
        buffer.push(line);
        if (line.endsWith("?")) flush();
    }
    flush();

    const seen = new Set();
    return questions
        .map((q) => q.replace(/\s+/g, " ").trim())
        .filter((q) => q.length > 3)
        .filter((q) => {
            const k = q.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .slice(0, 120);
}

async function extractTextFromPdfFile(file) {
    if (!file) return "";
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

    const ab = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: ab }).promise;

    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const strings = (content.items || []).map((it) => safeText(it.str));
        fullText += strings.join(" ") + "\n";
    }
    return fullText.trim();
}

// HTML template renderer (auto-wrapping, easy export)
function renderMonthlyReportHtml({ title, programName, month, executiveSummary, kpis, questions }) {
    const safe = (x) => escapeHtml(safeText(x));
    let out = `<h1>${safe(title)}</h1>`;
    out += `<div class="muted">${safe(programName)} • ${safe(month)} • Generated ${safe(
        new Date().toLocaleDateString()
    )}</div>`;
    out += `<div style="height:14px"></div>`;

    out += `<div class="card">
    <h2>Executive Summary</h2>
    <pre>${safe(executiveSummary)}</pre>
  </div>`;

    if (Array.isArray(kpis) && kpis.length) {
        out += `<div class="card">
      <h2>Key KPIs</h2>
      <ul>
        ${kpis
                .map((k) => `<li><strong>${safe(k.label)}:</strong> ${safe(k.value)}</li>`)
                .join("")}
      </ul>
    </div>`;
    }

    out += `<h2>Responses</h2>`;
    for (const q of questions || []) {
        out += `<div class="card">
      <h3>${safe(q.question)}</h3>
      ${safeText(q.context).trim()
                ? `<div class="muted">Context: ${safe(q.context)}</div><div style="height:8px"></div>`
                : `<div style="height:8px"></div>`
            }
      <pre>${safe(q.answer)}</pre>
    </div>`;
    }

    return out;
}

// jsPDF blob (fallback offline PDF generator)
function renderReportPdfBlob({ title, programName, month, executiveSummary, kpis, questions }) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 48;
    const right = pageWidth - 48;
    const maxWidth = right - left;

    let y = 56;
    const h1 = 18;
    const h2 = 12;
    const body = 10;

    const addWrapped = (text, fontSize, bold = false, gap = 10) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(fontSize);
        const clean = sanitizeForPdf(text);
        const lines = doc.splitTextToSize(clean, maxWidth);
        for (const line of lines) {
            if (y > 790) {
                doc.addPage();
                y = 56;
            }
            doc.text(line, left, y);
            y += fontSize + 4;
        }
        y += gap;
    };

    addWrapped(title || "Monthly Report", h1, true, 6);
    addWrapped(`${programName || ""} | ${month || ""} | Generated ${new Date().toLocaleDateString()}`, body, false, 16);

    addWrapped("Executive Summary", h2, true, 6);
    addWrapped(executiveSummary || "", body, false, 12);

    if (Array.isArray(kpis) && kpis.length) {
        addWrapped("Key KPIs", h2, true, 6);
        for (const k of kpis) {
            addWrapped(`- ${safeText(k.label)}: ${safeText(k.value)}`, body, false, 0);
        }
        y += 10;
    }

    addWrapped("Responses", h2, true, 6);
    for (const q of questions || []) {
        addWrapped(safeText(q.question), body, true, 4);
        if (safeText(q.context).trim()) addWrapped(`Context: ${safeText(q.context)}`, body, false, 4);
        addWrapped(safeText(q.answer), body, false, 10);
    }

    return doc.output("blob");
}

export default function MonthlyReports() {
    const { data: me, isLoading: loadingMe } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 500),
    });

    const [selectedProgramId, setSelectedProgramId] = useState("");
    const [month, setMonth] = useState(() => {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        return `${d.getFullYear()}-${mm}`;
    });

    // Optional PDF question extraction
    const [pdfFile, setPdfFile] = useState(null);
    const [extracting, setExtracting] = useState(false);
    const [sourceText, setSourceText] = useState("");

    // Report builder
    const [reportTitle, setReportTitle] = useState("Monthly Report");
    const [questions, setQuestions] = useState([]); // [{id, question, context, answer}]
    const [executiveSummary, setExecutiveSummary] = useState("");
    const [kpis, setKpis] = useState([]); // [{label,value}]
    const [generating, setGenerating] = useState(false);

    // Preview/upload/save
    const [previewUrl, setPreviewUrl] = useState("");
    const [pdfUploadUrl, setPdfUploadUrl] = useState("");

    // Saved
    const [savedReports, setSavedReports] = useState([]);
    const [viewOpen, setViewOpen] = useState(false);
    const [viewReport, setViewReport] = useState(null);

    const isLoading = loadingMe || loadingPrograms;

    const selectedProgram = useMemo(
        () => (programs || []).find((p) => p.id === selectedProgramId) || null,
        [programs, selectedProgramId]
    );

    useEffect(() => {
        if (!me?.id) {
            setSavedReports([]);
            return;
        }
        const qRef = query(
            collection(db, "monthlyReports"),
            where("createdById", "==", me.id),
            orderBy("createdAt", "desc")
        );
        const unsub = onSnapshot(qRef, (snap) => {
            setSavedReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [me?.id]);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearAll = () => {
        setSourceText("");
        setQuestions([]);
        setExecutiveSummary("");
        setKpis([]);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
        setPdfUploadUrl("");
        setReportTitle("Monthly Report");
    };

    const addQuestion = () => {
        setQuestions((prev) => [
            ...prev,
            { id: uid(), question: "", context: "", answer: "" },
        ]);
    };

    const removeQuestion = (id) => {
        setQuestions((prev) => prev.filter((q) => q.id !== id));
    };

    const moveQuestion = (id, dir) => {
        setQuestions((prev) => {
            const idx = prev.findIndex((q) => q.id === id);
            if (idx < 0) return prev;
            const nextIdx = dir === "up" ? idx - 1 : idx + 1;
            if (nextIdx < 0 || nextIdx >= prev.length) return prev;
            const copy = [...prev];
            const tmp = copy[idx];
            copy[idx] = copy[nextIdx];
            copy[nextIdx] = tmp;
            return copy;
        });
    };

    const parseQuestionsFromTextAndSet = (text) => {
        const qs = parseQuestionsFromText(text);
        if (!qs.length) return alert("No questions detected in extracted text.");
        setQuestions(
            qs.map((q) => ({
                id: uid(),
                question: q,
                context: "",
                answer: "",
            }))
        );
    };

    const extractQuestionsFromPdf = async () => {
        if (!pdfFile) return alert("Choose a PDF first.");
        setExtracting(true);
        try {
            const text = await extractTextFromPdfFile(pdfFile);
            if (!text) throw new Error("No text extracted from PDF.");
            setSourceText(text);
            parseQuestionsFromTextAndSet(text);
        } catch (e) {
            console.error(e);
            alert(e?.message || "PDF extraction failed.");
        } finally {
            setExtracting(false);
        }
    };

    // Single-call AI generation: title + summary + KPIs + answers for all questions
    const generateFullReportAI = async () => {
        if (!selectedProgramId) return alert("Select a program first.");
        if (!month) return alert("Select a month.");
        if (!questions.length) return alert("Add questions first.");
        const missingQuestions = questions.some((q) => !safeText(q.question).trim());
        if (missingQuestions) return alert("One or more questions are blank. Fill them in before generating.");

        setGenerating(true);
        try {
            const schema = {
                type: "object",
                additionalProperties: false,
                properties: {
                    title: { type: "string" },
                    executiveSummary: { type: "string" },
                    kpis: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            properties: { label: { type: "string" }, value: { type: "string" } },
                            required: ["label", "value"],
                        },
                    },
                    answers: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                id: { type: "string" },
                                answer: { type: "string" },
                            },
                            required: ["id", "answer"],
                        },
                    },
                },
                required: ["title", "executiveSummary", "kpis", "answers"],
            };

            const qaInput = questions.map((q) => ({
                id: q.id,
                question: safeText(q.question),
                context: safeText(q.context),
            }));

            const prompt = [
                "You are generating a monthly program report in a single cohesive pass.",
                "Tone: professional, clear, structured. Use bullet points where helpful.",
                "Where metrics are missing, state assumptions and list what data should be captured next month.",
                "",
                `Program: ${safeText(selectedProgram?.program_name || "")}`,
                `Month: ${safeText(month)}`,
                "",
                "Questions (JSON):",
                JSON.stringify(qaInput, null, 2),
                "",
                "Return JSON only with: { title, executiveSummary, kpis, answers:[{id, answer}] }",
            ].join("\n");

            const res = await base44.integrations.Core.InvokeLLM({
                model: "gpt-4.1-mini",
                prompt,
                response_json_schema: schema,
            });

            const out = res?.json ?? res?.data ?? res;

            setReportTitle(safeText(out?.title || "Monthly Report"));
            setExecutiveSummary(safeText(out?.executiveSummary || ""));
            setKpis(Array.isArray(out?.kpis) ? out.kpis : []);

            const ansMap = new Map(
                (Array.isArray(out?.answers) ? out.answers : []).map((a) => [String(a.id), safeText(a.answer)])
            );

            setQuestions((prev) =>
                prev.map((q) => ({
                    ...q,
                    answer: ansMap.get(String(q.id)) || q.answer,
                }))
            );
        } catch (e) {
            console.error(e);
            alert(e?.message || "AI generation failed.");
        } finally {
            setGenerating(false);
        }
    };

    const buildPreviewPdf = () => {
        if (!selectedProgramId) return alert("Select a program.");
        if (!month) return alert("Select a month.");
        if (!questions.length) return alert("Add questions first.");

        const blob = renderReportPdfBlob({
            title: reportTitle || "Monthly Report",
            programName: selectedProgram?.program_name || "",
            month,
            executiveSummary,
            kpis,
            questions,
        });

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        return blob;
    };

    const uploadGeneratedPdf = async () => {
        if (!selectedProgramId) return alert("Select a program.");
        if (!month) return alert("Select a month.");
        if (!questions.length) return alert("Add questions first.");

        const blob = buildPreviewPdf();
        if (!blob) return;

        try {
            const fileName = `${safeText(selectedProgram?.program_name || "Program")
                .replace(/[^\w.\- ]+/g, "_")
                .replace(/\s+/g, "_")}_${month}_MonthlyReport.pdf`;

            const file = new File([blob], fileName, { type: "application/pdf" });

            const up = await base44.integrations.Core.UploadFile({
                file,
                pathPrefix: "monthly-reports",
            });

            const url = up?.url || up?.file_url;
            if (!url) throw new Error("Upload did not return a URL.");
            setPdfUploadUrl(url);
            alert("Generated PDF uploaded.");
        } catch (e) {
            console.error(e);
            alert(e?.message || "PDF upload failed.");
        }
    };

    const saveReport = async () => {
        if (!selectedProgramId) return alert("Select a program.");
        if (!month) return alert("Select a month.");
        if (!questions.length) return alert("Add questions first.");

        const payload = {
            programId: selectedProgramId,
            programName: selectedProgram?.program_name || "",
            month,
            title: reportTitle || "Monthly Report",
            executiveSummary: safeText(executiveSummary),
            kpis: Array.isArray(kpis) ? kpis : [],
            questions: Array.isArray(questions) ? questions : [],
            sourceText: safeText(sourceText),
            generatedPdfUrl: safeText(pdfUploadUrl),
            createdById: me?.id || null,
            createdByName: me?.full_name || me?.display_name || me?.email || "Unknown",
            createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, "monthlyReports"), payload);

        // Attach to generic Documents collection (if PDF uploaded)
        if (pdfUploadUrl) {
            await addDoc(collection(db, "documents"), {
                ownerType: "Program",
                ownerId: selectedProgramId,
                programId: selectedProgramId,
                programName: selectedProgram?.program_name || "",
                title: payload.title,
                category: "Monthly Report",
                month,
                fileUrl: pdfUploadUrl,
                fileType: "application/pdf",
                createdById: payload.createdById,
                createdByName: payload.createdByName,
                createdAt: serverTimestamp(),
            });
        }

        alert("Monthly report saved. PDF attached to Documents (if uploaded).");
    };

    const exportPdfPrint = () => {
        if (!selectedProgramId) return alert("Select a program.");
        if (!month) return alert("Select a month.");
        if (!questions.length) return alert("Add questions first.");

        const html = renderMonthlyReportHtml({
            title: reportTitle,
            programName: selectedProgram?.program_name || "",
            month,
            executiveSummary,
            kpis,
            questions,
        });

        openPrintPdfWindow(reportTitle || "Monthly Report", html);
    };

    const exportWord = () => {
        if (!selectedProgramId) return alert("Select a program.");
        if (!month) return alert("Select a month.");
        if (!questions.length) return alert("Add questions first.");

        const html = renderMonthlyReportHtml({
            title: reportTitle,
            programName: selectedProgram?.program_name || "",
            month,
            executiveSummary,
            kpis,
            questions,
        });

        downloadHtmlAsDoc(`${reportTitle || "Monthly Report"}.doc`, html);
    };

    const openSaved = (r) => {
        setViewReport(r);
        setViewOpen(true);
    };

  

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="Monthly Reports"
                subtitle="Add questions, add context, generate a full report (AI), export Word/PDF, upload PDF, and save."
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: builder */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Header controls */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Program</Label>
                                <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select program" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {(programs || []).map((p) => (
                                            <SelectItem key={p.id} value={p.id} className="text-white">
                                                {safeText(p.program_name)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Report Month</Label>
                                <Input
                                    type="month"
                                    className="bg-slate-800 border-slate-700 text-white"
                                    value={month}
                                    onChange={(e) => setMonth(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Optional PDF question extraction */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                            <div>
                                <Label className="text-slate-300">Optional: Upload PDF to extract questions</Label>
                                <Input
                                    type="file"
                                    accept="application/pdf"
                                    className="bg-slate-800 border-slate-700 text-white"
                                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                                />
                                <div className="text-xs text-slate-500 mt-2">
                                    This is optional. You can also manually add questions below.
                                </div>
                            </div>

                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    variant="outline"
                                    className="border-slate-700"
                                    type="button"
                                    onClick={extractQuestionsFromPdf}
                                    disabled={!pdfFile || extracting}
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    {extracting ? "Extracting..." : "Extract Questions"}
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-slate-700"
                                    type="button"
                                    onClick={clearAll}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Clear
                                </Button>
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300">Extracted text (optional)</Label>
                            <Textarea
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={6}
                                value={sourceText}
                                onChange={(e) => setSourceText(e.target.value)}
                                placeholder="PDF extracted text will appear here..."
                            />
                            <div className="text-xs text-slate-500 mt-2">
                                If extraction is messy, you can edit this and then re-extract by uploading again.
                            </div>
                        </div>
                    </div>

                    {/* Questions */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="text-white font-semibold">Questions ({questions.length})</div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    className="border-slate-700"
                                    type="button"
                                    onClick={addQuestion}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Question
                                </Button>

                                <Button
                                    className="bg-blue-600 hover:bg-blue-700"
                                    type="button"
                                    onClick={generateFullReportAI}
                                    disabled={generating || !questions.length || !selectedProgramId}
                                >
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    {generating ? "Generating..." : "Generate Full Report (AI)"}
                                </Button>
                            </div>
                        </div>

                        {questions.length === 0 ? (
                            <EmptyState
                                icon={Sparkles}
                                title="No questions yet"
                                description="Click Add Question, or upload a PDF and extract questions."
                            />
                        ) : (
                            <div className="space-y-3">
                                {questions.map((q, idx) => (
                                    <div key={q.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge className="bg-slate-700/50 text-slate-200">Q{idx + 1}</Badge>

                                                    <div className="ml-auto flex items-center gap-1">
                                                        <Button
                                                            variant="outline"
                                                            className="border-slate-700 px-2"
                                                            type="button"
                                                            onClick={() => moveQuestion(q.id, "up")}
                                                            disabled={idx === 0}
                                                            title="Move up"
                                                        >
                                                            <ArrowUp className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            className="border-slate-700 px-2"
                                                            type="button"
                                                            onClick={() => moveQuestion(q.id, "down")}
                                                            disabled={idx === questions.length - 1}
                                                            title="Move down"
                                                        >
                                                            <ArrowDown className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="mt-3">
                                                    <Label className="text-slate-300">Question</Label>
                                                    <Input
                                                        className="bg-slate-800 border-slate-700 text-white"
                                                        value={q.question}
                                                        onChange={(e) =>
                                                            setQuestions((prev) =>
                                                                prev.map((x) => (x.id === q.id ? { ...x, question: e.target.value } : x))
                                                            )
                                                        }
                                                        placeholder="Type the question here..."
                                                    />
                                                </div>

                                                <div className="mt-3">
                                                    <Label className="text-slate-300">Context (you add this)</Label>
                                                    <Textarea
                                                        className="bg-slate-800 border-slate-700 text-white"
                                                        rows={3}
                                                        value={q.context}
                                                        onChange={(e) =>
                                                            setQuestions((prev) =>
                                                                prev.map((x) => (x.id === q.id ? { ...x, context: e.target.value } : x))
                                                            )
                                                        }
                                                        placeholder="Add relevant numbers / outcomes / milestones..."
                                                    />
                                                </div>

                                                <div className="mt-3">
                                                    <Label className="text-slate-300">AI Response</Label>
                                                    <Textarea
                                                        className="bg-slate-800 border-slate-700 text-white"
                                                        rows={6}
                                                        value={q.answer}
                                                        onChange={(e) =>
                                                            setQuestions((prev) =>
                                                                prev.map((x) => (x.id === q.id ? { ...x, answer: e.target.value } : x))
                                                            )
                                                        }
                                                        placeholder="AI output will appear here after Generate Full Report..."
                                                    />
                                                </div>
                                            </div>

                                            <Button
                                                variant="outline"
                                                className="border-red-800 text-red-200 hover:text-white"
                                                type="button"
                                                onClick={() => removeQuestion(q.id)}
                                                title="Remove"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Summary + KPIs + exports */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div>
                            <Label className="text-slate-300">Report Title</Label>
                            <Input
                                className="bg-slate-800 border-slate-700 text-white"
                                value={reportTitle}
                                onChange={(e) => setReportTitle(e.target.value)}
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Executive Summary</Label>
                            <Textarea
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={6}
                                value={executiveSummary}
                                onChange={(e) => setExecutiveSummary(e.target.value)}
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">KPIs (simple list)</Label>
                            <Textarea
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={5}
                                value={(kpis || []).map((k) => `${safeText(k.label)}: ${safeText(k.value)}`).join("\n")}
                                onChange={(e) => {
                                    const rows = e.target.value
                                        .split("\n")
                                        .map((l) => l.trim())
                                        .filter(Boolean);

                                    setKpis(
                                        rows.map((r) => {
                                            const [label, ...rest] = r.split(":");
                                            return { label: (label || "").trim(), value: rest.join(":").trim() };
                                        })
                                    );
                                }}
                                placeholder="Participants commenced: 12"
                            />
                        </div>

                        <div className="flex gap-2 flex-wrap">
                            <Button
                                variant="outline"
                                className="border-slate-700"
                                type="button"
                                onClick={buildPreviewPdf}
                                disabled={!questions.length}
                            >
                                <Eye className="h-4 w-4 mr-2" />
                                Build Preview PDF
                            </Button>

                            <Button
                                variant="outline"
                                className="border-slate-700"
                                type="button"
                                onClick={uploadGeneratedPdf}
                                disabled={!questions.length}
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                Upload Generated PDF
                            </Button>

                            <Button
                                className="bg-emerald-600 hover:bg-emerald-700"
                                type="button"
                                onClick={saveReport}
                                disabled={!selectedProgramId}
                            >
                                <Save className="h-4 w-4 mr-2" />
                                Save Report + Attach Document
                            </Button>

                            <Button
                                variant="outline"
                                className="border-slate-700"
                                type="button"
                                onClick={exportPdfPrint}
                                disabled={!questions.length}
                            >
                                <FileDown className="h-4 w-4 mr-2" />
                                Export PDF (Print)
                            </Button>

                            <Button
                                variant="outline"
                                className="border-slate-700"
                                type="button"
                                onClick={exportWord}
                                disabled={!questions.length}
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                Export Word
                            </Button>
                        </div>

                        {previewUrl ? (
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-3">
                                <div className="text-white font-semibold mb-2">Preview</div>
                                <iframe
                                    title="Monthly report PDF preview"
                                    src={previewUrl}
                                    className="w-full h-[560px] rounded-xl border border-slate-800 bg-slate-950"
                                />
                                {pdfUploadUrl ? (
                                    <div className="text-xs text-slate-500 mt-2 break-all">
                                        Uploaded URL: {pdfUploadUrl}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Right: saved */}
                <div className="space-y-6">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
                        <div className="text-white font-semibold mb-2">Saved Reports</div>
                        {savedReports.length === 0 ? (
                            <div className="text-sm text-slate-500">No saved reports yet.</div>
                        ) : (
                            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                                {savedReports.map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => openSaved(r)}
                                        className="w-full text-left rounded-xl border border-slate-800 bg-slate-950/30 hover:bg-slate-900/40 p-3"
                                    >
                                        <div className="text-sm text-white font-medium truncate">
                                            {safeText(r.title || "Monthly Report")}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate">
                                            {safeText(r.programName)} | {safeText(r.month)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Viewer */}
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white">{safeText(viewReport?.title || "Monthly Report")}</DialogTitle>
                    </DialogHeader>

                    {!viewReport ? (
                        <div className="text-sm text-slate-500">No report selected.</div>
                    ) : (
                        <div className="space-y-4 mt-2">
                            <div className="text-xs text-slate-500">
                                {safeText(viewReport.programName)} | {safeText(viewReport.month)}
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                                <div className="text-white font-semibold mb-2">Executive Summary</div>
                                <div className="text-slate-300 whitespace-pre-wrap">{safeText(viewReport.executiveSummary)}</div>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                                <div className="text-white font-semibold mb-2">KPIs</div>
                                <ul className="list-disc pl-6 text-slate-300">
                                    {(viewReport.kpis || []).map((k, i) => (
                                        <li key={i}>
                                            <span className="text-white">{safeText(k.label)}:</span> {safeText(k.value)}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                                <div className="text-white font-semibold mb-2">Responses</div>
                                <div className="space-y-3">
                                    {(viewReport.questions || []).map((q, i) => (
                                        <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                                            <div className="text-white font-medium">{safeText(q.question)}</div>
                                            {safeText(q.context).trim() ? (
                                                <div className="text-xs text-slate-500 mt-1">Context: {safeText(q.context)}</div>
                                            ) : null}
                                            <div className="text-slate-300 whitespace-pre-wrap mt-2">{safeText(q.answer)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {safeText(viewReport.generatedPdfUrl).trim() ? (
                                <div className="text-xs text-slate-500 break-all">
                                    PDF: {safeText(viewReport.generatedPdfUrl)}
                                </div>
                            ) : null}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}