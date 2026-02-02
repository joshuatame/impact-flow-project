import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Download } from "lucide-react";

function exportToPdf({ title, monthLabel, summary, rows }) {
    const w = window.open("", "_blank");

    const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <title>${title} - ${monthLabel}</title>
      <style>
        @media print { .btn { display: none; } }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 28px; color: #0f172a; }
        .btn { position: fixed; top: 16px; right: 16px; background: #2563eb; color: #fff; border: none; padding: 10px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        h1 { margin: 0 0 6px; }
        .meta { color: #475569; margin-bottom: 18px; }
        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0 22px; }
        .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; }
        .kpi .l { color: #64748b; font-size: 12px; }
        .kpi .v { font-size: 18px; font-weight: 800; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #0f172a; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; }
        td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; vertical-align: top; }
      </style>
    </head>
    <body>
      <button class="btn" onclick="window.print()">Save as PDF</button>

      <h1>${title}</h1>
      <div class="meta">${monthLabel} | Generated ${new Date().toLocaleDateString()}</div>

      <div class="kpis">
        ${summary.map((k) => `<div class="kpi"><div class="l">${k.label}</div><div class="v">${k.value}</div></div>`).join("")}
      </div>

      <table>
        <thead>
          <tr>${Object.keys(rows[0] || { note: "" }).map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${(rows.length ? rows : [{ note: "No records" }]).map((r) => `<tr>${Object.keys(r).map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </body>
  </html>
  `;

    w.document.write(html);
    w.document.close();
}

export default function MonthlyReport() {
    const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));

    const start = format(startOfMonth(new Date(`${month}-01`)), "yyyy-MM-dd");
    const end = format(endOfMonth(new Date(`${month}-01`)), "yyyy-MM-dd");
    const monthLabel = format(new Date(`${month}-01`), "MMMM yyyy");

    const { data: caseNotes = [], isLoading: loadingNotes } = useQuery({
        queryKey: ["monthlyCaseNotes", month],
        queryFn: () => base44.entities.CaseNote.list("-created_date", 5000),
    });

    const { data: training = [] } = useQuery({
        queryKey: ["monthlyTraining", month],
        queryFn: () => base44.entities.ParticipantTraining.list("-created_date", 5000),
    });

    const { data: employment = [] } = useQuery({
        queryKey: ["monthlyEmployment", month],
        queryFn: () => base44.entities.EmploymentPlacement.list("-created_date", 5000),
    });

    const { data: funding = [] } = useQuery({
        queryKey: ["monthlyFunding", month],
        queryFn: () => base44.entities.FundingRecord.list("-created_date", 5000),
    });

    const { data: survey = [] } = useQuery({
        queryKey: ["monthlySurvey", month],
        queryFn: () => base44.entities.SurveyResponse.list("-created_date", 5000),
    });

    const within = (d) => d && d >= start && d <= end;

    const notesIn = useMemo(() => caseNotes.filter((n) => within(n.interaction_date || n.created_date)), [caseNotes, start, end]);
    const trainIn = useMemo(() => training.filter((t) => within(t.enrollment_date || t.created_date)), [training, start, end]);
    const empIn = useMemo(() => employment.filter((e) => within(e.start_date || e.created_date)), [employment, start, end]);
    const fundIn = useMemo(() => funding.filter((f) => within(f.funding_date || f.created_date)), [funding, start, end]);
    const surveyIn = useMemo(() => survey.filter((s) => within(s.completed_date || s.created_date)), [survey, start, end]);

    if (loadingNotes) return <LoadingSpinner />;

    const summary = [
        { label: "Case Notes", value: notesIn.length },
        { label: "Training", value: trainIn.length },
        { label: "Employment", value: empIn.length },
        { label: "Survey Responses", value: surveyIn.length },
    ];

    const rows = notesIn.slice(0, 500).map((n) => ({
        interaction_date: n.interaction_date || "",
        note_type: n.note_type || "",
        duration_minutes: n.duration_minutes || "",
        location: n.location || "",
        participants: (n.linked_participant_ids || []).join("; "),
    }));

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-white font-semibold text-xl">Monthly Report</div>
                    <div className="text-slate-400 text-sm">Range: {start} to {end}</div>
                </div>

                <div className="flex items-end gap-3">
                    <div>
                        <div className="text-slate-300 text-sm mb-1">Month</div>
                        <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2"
                        />
                    </div>

                    <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() =>
                            exportToPdf({
                                title: "Monthly Report",
                                monthLabel,
                                summary,
                                rows: rows.length ? rows : [{ note: "No case notes in this month." }],
                            })
                        }
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Export PDF
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {summary.map((k) => (
                    <div key={k.label} className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4">
                        <div className="text-slate-400 text-xs">{k.label}</div>
                        <div className="text-white text-2xl font-bold mt-1">{k.value}</div>
                    </div>
                ))}
            </div>

            <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4">
                <div className="text-white font-semibold mb-2">Case Notes (preview)</div>
                {rows.length === 0 ? (
                    <div className="text-slate-400 text-sm">No records</div>
                ) : (
                    <div className="space-y-2">
                        {rows.slice(0, 20).map((r, idx) => (
                            <div key={idx} className="bg-slate-950/30 border border-slate-800/40 rounded-lg p-3">
                                <div className="text-slate-300 text-sm">
                                    {r.interaction_date} | {r.note_type} | {r.duration_minutes} mins
                                </div>
                                <div className="text-slate-500 text-xs mt-1">{r.location}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
