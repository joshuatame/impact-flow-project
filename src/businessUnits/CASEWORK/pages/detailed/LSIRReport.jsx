import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    ArrowLeft,
    BarChart3,
    Download,
    FileText,
    Loader2,
    AlertTriangle,
    CheckCircle,
    Target,
    Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { SURVEY_SECTIONS } from "@/businessUnits/CASEWORK/pages/forms/SurveyForm.jsx";
import AssessmentComparison from "@/businessUnits/CASEWORK/components/lsir/AssessmentComparison.jsx";
const riskColors = {
    Low: "bg-emerald-500/10 text-emerald-400",
    Moderate: "bg-amber-500/10 text-amber-400",
    High: "bg-orange-500/10 text-orange-400",
    "Very High": "bg-red-500/10 text-red-400",
};

const tierConfig = {
    1: { name: "Tier 1 - Low Risk", color: "bg-emerald-500", textColor: "text-emerald-400", range: "0-24", description: "Minimal intervention needed" },
    2: { name: "Tier 2 - Low-Moderate Risk", color: "bg-green-500", textColor: "text-green-400", range: "25-39", description: "Light support recommended" },
    3: { name: "Tier 3 - Moderate Risk", color: "bg-amber-500", textColor: "text-amber-400", range: "40-54", description: "Regular support needed" },
    4: { name: "Tier 4 - Moderate-High Risk", color: "bg-orange-500", textColor: "text-orange-400", range: "55-69", description: "Intensive support required" },
    5: { name: "Tier 5 - High Risk", color: "bg-red-500", textColor: "text-red-400", range: "70-100", description: "Crisis intervention needed" },
};

const getTier = (totalScore) => {
    if (totalScore <= 24) return 1;
    if (totalScore <= 39) return 2;
    if (totalScore <= 54) return 3;
    if (totalScore <= 69) return 4;
    return 5;
};

function normalizeAiReport(raw) {
    const obj = raw && typeof raw === "object" ? raw : {};

    const actionPlan = Array.isArray(obj.action_plan) ? obj.action_plan : [];
    const normalizedPlan = actionPlan
        .filter((x) => x && typeof x === "object")
        .map((x, idx) => ({
            priority: typeof x.priority === "number" ? x.priority : idx + 1,
            action: typeof x.action === "string" ? x.action : "",
            timeframe: typeof x.timeframe === "string" ? x.timeframe : "",
            risk_area: typeof x.risk_area === "string" ? x.risk_area : "General",
        }))
        .filter((x) => x.action.trim().length > 0);

    return {
        executive_summary: typeof obj.executive_summary === "string" ? obj.executive_summary : "",
        key_risk_factors: Array.isArray(obj.key_risk_factors) ? obj.key_risk_factors.filter(Boolean) : [],
        identified_strengths: Array.isArray(obj.identified_strengths) ? obj.identified_strengths.filter(Boolean) : [],
        action_plan: normalizedPlan,
        review_timeline: typeof obj.review_timeline === "string" ? obj.review_timeline : "",
    };
}

export default function LSIRReport() {
    const [selectedParticipantId, setSelectedParticipantId] = useState("");
    const [generatedReport, setGeneratedReport] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const reportRef = useRef(null);
    const queryClient = useQueryClient();

    const { data: surveyResponses = [], isLoading } = useQuery({
        queryKey: ["surveyResponses"],
        queryFn: () => base44.entities.SurveyResponse.list("-completed_date", 2000),
    });

    const { data: participants = [] } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 1000),
    });

    const { data: savedReports = [] } = useQuery({
        queryKey: ["savedReportsLSIR"],
        queryFn: () => base44.entities.SavedReport.list("-created_date", 1000),
    });

    const { data: user } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const existingSavedReport = savedReports.find(
        (r) => r.participant_id === selectedParticipantId && r.report_type === "lsi_r_intake"
    );

    React.useEffect(() => {
        if (existingSavedReport) {
            setGeneratedReport(
                normalizeAiReport({
                    executive_summary: existingSavedReport.executive_summary,
                    key_risk_factors: existingSavedReport.key_risk_factors,
                    identified_strengths: existingSavedReport.identified_strengths,
                    action_plan: existingSavedReport.action_plan,
                    review_timeline: existingSavedReport.review_timeline,
                })
            );
        } else {
            setGeneratedReport(null);
        }
    }, [selectedParticipantId, existingSavedReport?.id]);

    const participantsWithSurveys = participants.filter(
        (p) => p.status === "Active" && surveyResponses.some((r) => r.participant_id === p.id)
    );

    const getParticipantScores = (participantId, assessmentType = "intake") => {
        const responses = surveyResponses.filter((r) => {
            if (r.participant_id !== participantId || !r.section_id) return false;
            const templateId = (r.survey_template_id || "").toLowerCase();
            if (assessmentType === "exit") return templateId === "exit_assessment";
            return templateId === "intake_assessment" || templateId === "";
        });

        let totalScore = 0;
        let maxPossibleScore = 0;
        const sectionScores = {};

        const sortedResponses = [...responses].sort(
            (a, b) => new Date(b.completed_date || b.created_date) - new Date(a.completed_date || a.created_date)
        );

        sortedResponses.forEach((r) => {
            if (r.section_id && r.overall_score !== undefined) {
                if (!sectionScores[r.section_id]) {
                    const sectionDef = SURVEY_SECTIONS.find((s) => s.section_id === r.section_id);
                    const maxPoints = sectionDef?.max_points || 0;

                    sectionScores[r.section_id] = {
                        score: r.overall_score,
                        maxScore: maxPoints,
                        riskLevel: r.overall_risk_band,
                    };
                    totalScore += r.overall_score;
                    maxPossibleScore += maxPoints;
                }
            }
        });

        const completedSections = Object.keys(sectionScores).length;
        const totalSections = SURVEY_SECTIONS.length;

        return {
            totalScore,
            maxPossibleScore,
            sectionScores,
            completedSections,
            totalSections,
            completionPercentage: Math.round((completedSections / totalSections) * 100),
        };
    };

    const selectedParticipant = participants.find((p) => p.id === selectedParticipantId);

    const intakeScores = selectedParticipantId ? getParticipantScores(selectedParticipantId, "intake") : null;
    const exitScores = selectedParticipantId ? getParticipantScores(selectedParticipantId, "exit") : null;

    const participantScores = intakeScores;
    const tier = participantScores ? getTier(participantScores.totalScore) : null;

    const generateReport = async () => {
        if (!selectedParticipantId || !participantScores || !selectedParticipant) return;

        setIsGenerating(true);
        try {
            const highRiskSections = SURVEY_SECTIONS.filter((s) => {
                const data = participantScores.sectionScores[s.section_id];
                return data && (data.riskLevel === "High" || data.riskLevel === "Very High");
            }).map((s) => s.section_name);

            const moderateRiskSections = SURVEY_SECTIONS.filter((s) => {
                const data = participantScores.sectionScores[s.section_id];
                return data && data.riskLevel === "Moderate";
            }).map((s) => s.section_name);

            const lowRiskSections = SURVEY_SECTIONS.filter((s) => {
                const data = participantScores.sectionScores[s.section_id];
                return data && data.riskLevel === "Low";
            }).map((s) => s.section_name);

            const prompt = `Generate a professional case management assessment summary and action plan for a participant.

Participant: ${selectedParticipant.first_name} ${selectedParticipant.last_name}
Current Phase: ${selectedParticipant.current_phase}
Total Risk Score: ${participantScores.totalScore}/100
Risk Tier: ${tierConfig[tier].name}

High Risk Areas (need immediate attention): ${highRiskSections.length > 0 ? highRiskSections.join(", ") : "None identified"}
Moderate Risk Areas (need monitoring): ${moderateRiskSections.length > 0 ? moderateRiskSections.join(", ") : "None identified"}
Low Risk/Strength Areas: ${lowRiskSections.length > 0 ? lowRiskSections.join(", ") : "None identified"}

Completed ${participantScores.completedSections} of ${participantScores.totalSections} assessment sections.

Provide a structured response with:
1. Executive Summary (2-3 sentences overview)
2. Key Risk Factors (bullet points of main concerns)
3. Identified Strengths (bullet points of protective factors)
4. Recommended Action Plan (array of 4-6 objects prioritized by urgency). Each item MUST include priority, action, timeframe, risk_area.
5. Suggested Review Timeline (when to reassess)

Return JSON only. Keep it professional and actionable for case workers.`;

            const schema = {
                type: "object",
                properties: {
                    executive_summary: { type: "string" },
                    key_risk_factors: { type: "array", items: { type: "string" } },
                    identified_strengths: { type: "array", items: { type: "string" } },
                    action_plan: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                priority: { type: "number" },
                                action: { type: "string" },
                                timeframe: { type: "string" },
                                risk_area: { type: "string" },
                            },
                            required: ["priority", "action", "timeframe", "risk_area"],
                            additionalProperties: false,
                        },
                    },
                    review_timeline: { type: "string" },
                },
                required: ["executive_summary", "key_risk_factors", "identified_strengths", "action_plan", "review_timeline"],
                additionalProperties: false,
            };

            const raw = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: schema,
                model: "gpt-4.1-mini",
            });

            const normalized = normalizeAiReport(raw);
            setGeneratedReport(normalized);

            await base44.entities.SavedReport.create({
                participant_id: selectedParticipantId,
                report_type: "lsi_r_intake",
                intake_score: participantScores.totalScore,
                executive_summary: normalized.executive_summary,
                key_risk_factors: normalized.key_risk_factors,
                identified_strengths: normalized.identified_strengths,
                action_plan: normalized.action_plan,
                review_timeline: normalized.review_timeline,
                generated_by_id: user?.id || null,
                generated_by_name: user?.full_name || user?.display_name || null,
            });

            if (Array.isArray(normalized.action_plan) && normalized.action_plan.length > 0) {
                const sorted = [...normalized.action_plan].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

                await Promise.all(
                    sorted.map((item, idx) =>
                        base44.entities.ActionPlanItem.create({
                            participant_id: selectedParticipantId,
                            action_text: typeof item?.action === "string" ? item.action : "",
                            risk_area: typeof item?.risk_area === "string" ? item.risk_area : "General",
                            timeframe: typeof item?.timeframe === "string" ? item.timeframe : "",
                            priority: typeof item?.priority === "number" ? item.priority : idx + 1,
                            status: "Pending",
                        })
                    )
                );
                queryClient.invalidateQueries(["actionPlanItems"]);
            }

            queryClient.invalidateQueries(["savedReportsLSIR"]);
        } catch (error) {
            console.error("Error generating report:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const exportReport = () => {
        if (!selectedParticipant || !participantScores) return;

        const printWindow = window.open("", "_blank");

        const riskColorMap = {
            Low: "#10b981",
            Moderate: "#f59e0b",
            High: "#f97316",
            "Very High": "#ef4444",
        };

        const tierColorMap = {
            1: "#10b981",
            2: "#22c55e",
            3: "#f59e0b",
            4: "#f97316",
            5: "#ef4444",
        };

        const hasExitData = exitScores && exitScores.completedSections > 0;
        const exitTier = hasExitData ? getTier(exitScores.totalScore) : null;
        const scoreChange = hasExitData ? intakeScores.totalScore - exitScores.totalScore : 0;
        const percentageImprovement =
            intakeScores?.totalScore > 0 ? Math.round((scoreChange / intakeScores.totalScore) * 100) : 0;

        const generateRadarSVG = (scores, color, label) => {
            const sections = SURVEY_SECTIONS;
            const centerX = 200,
                centerY = 200,
                radius = 150;
            const angleStep = (2 * Math.PI) / sections.length;

            const points = sections
                .map((section, i) => {
                    const data = scores?.sectionScores[section.section_id];
                    const percentage = data ? data.score / data.maxScore : 0;
                    const angle = i * angleStep - Math.PI / 2;
                    const x = centerX + Math.cos(angle) * radius * percentage;
                    const y = centerY + Math.sin(angle) * radius * percentage;
                    return `${x},${y}`;
                })
                .join(" ");

            const gridCircles = [0.25, 0.5, 0.75, 1]
                .map((pct) => `<circle cx="${centerX}" cy="${centerY}" r="${radius * pct}" fill="none" stroke="#334155" stroke-width="1"/>`)
                .join("");

            const axisLines = sections
                .map((section, i) => {
                    const angle = i * angleStep - Math.PI / 2;
                    const x = centerX + Math.cos(angle) * radius;
                    const y = centerY + Math.sin(angle) * radius;
                    const labelX = centerX + Math.cos(angle) * (radius + 30);
                    const labelY = centerY + Math.sin(angle) * (radius + 30);
                    const shortName = section.section_name.split("/")[0].trim().slice(0, 10);
                    return `
            <line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="#334155" stroke-width="1"/>
            <text x="${labelX}" y="${labelY}" fill="#64748b" font-size="9" text-anchor="middle" dominant-baseline="middle">${shortName}</text>
          `;
                })
                .join("");

            return `
        <svg viewBox="0 0 400 400" width="350" height="350">
          ${gridCircles}
          ${axisLines}
          <polygon points="${points}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2"/>
          <text x="${centerX}" y="30" fill="#f8fafc" font-size="14" font-weight="bold" text-anchor="middle">${label}</text>
        </svg>
      `;
        };

        const generateBarChartSVG = (intakeData, exitData) => {
            const sections = SURVEY_SECTIONS;
            const barHeight = 20;
            const gap = 8;
            const maxWidth = 300;
            const leftPadding = 100;
            const chartHeight = sections.length * (barHeight * 2 + gap) + 40;

            const bars = sections
                .map((section, i) => {
                    const intake = intakeData?.sectionScores[section.section_id];
                    const exit = exitData?.sectionScores[section.section_id];
                    const intakePct = intake ? (intake.score / intake.maxScore) * 100 : 0;
                    const exitPct = exit ? (exit.score / exit.maxScore) * 100 : 0;
                    const y = i * (barHeight * 2 + gap) + 30;
                    const shortName = section.section_name.split("/")[0].trim().slice(0, 12);

                    return `
            <text x="${leftPadding - 8}" y="${y + barHeight}" fill="#94a3b8" font-size="9" text-anchor="end">${shortName}</text>
            <rect x="${leftPadding}" y="${y}" width="${(intakePct / 100) * maxWidth}" height="${barHeight}" rx="4" fill="#3b82f6"/>
            ${exitData
                            ? `<rect x="${leftPadding}" y="${y + barHeight + 2}" width="${(exitPct / 100) * maxWidth}" height="${barHeight}" rx="4" fill="#8b5cf6"/>`
                            : ""
                        }
          `;
                })
                .join("");

            return `
        <svg viewBox="0 0 450 ${chartHeight}" width="100%" height="${chartHeight}">
          <text x="225" y="15" fill="#f8fafc" font-size="14" font-weight="bold" text-anchor="middle">Section Comparison</text>
          ${bars}
          <rect x="${leftPadding}" y="${chartHeight - 20}" width="15" height="10" rx="2" fill="#3b82f6"/>
          <text x="${leftPadding + 20}" y="${chartHeight - 12}" fill="#94a3b8" font-size="10">Initial</text>
          ${exitData
                    ? `
              <rect x="${leftPadding + 80}" y="${chartHeight - 20}" width="15" height="10" rx="2" fill="#8b5cf6"/>
              <text x="${leftPadding + 100}" y="${chartHeight - 12}" fill="#94a3b8" font-size="10">Exit</text>
            `
                    : ""
                }
        </svg>
      `;
        };

        const generateScoreCard = (scores, tierNum, label, badgeColor) => {
            const tierInfo = tierConfig[tierNum];
            const borderColor = tierNum <= 2 ? "#10b981" : tierNum === 3 ? "#f59e0b" : "#ef4444";
            return `
        <div style="flex: 1; background: rgba(${tierNum <= 2 ? "16,185,129" : tierNum === 3 ? "245,158,11" : "239,68,68"}, 0.05);
             border: 2px solid ${borderColor}30; border-radius: 12px; padding: 20px; text-align: center;">
          <div style="display: inline-block; padding: 4px 12px; background: ${badgeColor}20; color: ${badgeColor};
               border-radius: 20px; font-size: 12px; font-weight: 500; margin-bottom: 12px;">${label}</div>
          <div style="font-size: 48px; font-weight: bold; color: #f8fafc;">${scores.totalScore}</div>
          <div style="color: #94a3b8; font-size: 14px;">out of 100</div>
          <div style="margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <div style="width: 10px; height: 10px; border-radius: 50%; background: ${tierColorMap[tierNum]};"></div>
            <span style="color: ${tierColorMap[tierNum]}; font-size: 12px; font-weight: 500;">${tierInfo.name}</span>
          </div>
          <div style="color: #64748b; font-size: 11px; margin-top: 8px;">${scores.completedSections}/${scores.totalSections} sections</div>
        </div>
      `;
        };

        const safeReport = generatedReport ? normalizeAiReport(generatedReport) : null;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>LSI-R Report - ${selectedParticipant.first_name} ${selectedParticipant.last_name}</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-break { page-break-before: always; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            padding: 40px;
            margin: 0;
            line-height: 1.6;
          }
          .header {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            padding: 24px;
            border-radius: 12px;
            margin-bottom: 24px;
            border: 1px solid #334155;
          }
          .header h1 { margin: 0 0 8px 0; color: #f8fafc; font-size: 24px; }
          .header p { margin: 0; color: #94a3b8; font-size: 14px; }
          .section {
            background: #1e293b;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid #334155;
          }
          .section h2 {
            margin: 0 0 16px 0;
            color: #f8fafc;
            font-size: 18px;
            border-bottom: 1px solid #334155;
            padding-bottom: 12px;
          }
          .score-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            border-radius: 8px;
            margin-bottom: 4px;
            background: rgba(15, 23, 42, 0.5);
          }
          .risk-badge {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
          }
          .summary-section { margin-bottom: 16px; }
          .summary-section h3 { color: #94a3b8; font-size: 13px; margin: 0 0 8px 0; text-transform: uppercase; }
          .summary-section p { margin: 0; color: #e2e8f0; font-size: 14px; }
          .list-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
          .list-item .bullet { flex-shrink: 0; width: 6px; height: 6px; border-radius: 50%; margin-top: 6px; }
          .action-item { display: flex; gap: 12px; padding: 10px; background: #0f172a; border-radius: 8px; margin-bottom: 6px; }
          .action-number { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; background: rgba(59, 130, 246, 0.2); color: #3b82f6; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; }
          .footer { margin-top: 24px; text-align: center; color: #64748b; font-size: 11px; padding-top: 16px; border-top: 1px solid #334155; }
          .print-btn { position: fixed; top: 20px; right: 20px; background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; z-index: 1000; }
          .print-btn:hover { background: #2563eb; }
          @media print { .print-btn { display: none; } }
          .chart-container { display: flex; justify-content: center; padding: 20px 0; }
          .page-title { color: #3b82f6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">Save as PDF</button>

        <div class="page-title">Page 1 of ${hasExitData ? "3" : "1"}</div>
        <div class="header">
          <h1>LSI-R Initial Assessment</h1>
          <p>${selectedParticipant.first_name} ${selectedParticipant.last_name} - ${selectedParticipant.current_phase} - Generated ${format(new Date(), "MMMM d, yyyy")}</p>
        </div>

        <div style="display: flex; gap: 20px; margin-bottom: 20px;">
          ${generateScoreCard(intakeScores, tier, "Initial Assessment", "#3b82f6")}
        </div>

        <div class="section">
          <h2>Initial Risk Profile</h2>
          <div class="chart-container">
            ${generateRadarSVG(intakeScores, "#3b82f6", "Initial Assessment Risk Distribution")}
          </div>
        </div>

        <div class="section">
          <h2>Section Scores - Initial Assessment</h2>
          ${SURVEY_SECTIONS.map((section) => {
            const data = intakeScores.sectionScores[section.section_id];
            return `
              <div class="score-row">
                <span style="color: ${data ? "#e2e8f0" : "#64748b"}; font-size: 13px;">${section.section_name}</span>
                ${data
                    ? `
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="color: #94a3b8; font-size: 12px;">${data.score}/${data.maxScore}</span>
                    <span class="risk-badge" style="background: ${riskColorMap[data.riskLevel]}20; color: ${riskColorMap[data.riskLevel]};">${data.riskLevel}</span>
                  </div>
                `
                    : '<span style="color: #64748b; font-size: 12px;">Not completed</span>'
                }
              </div>
            `;
        }).join("")}
        </div>

        ${safeReport
                ? `
          <div class="section">
            <h2>Assessment Summary & Action Plan</h2>
            <div class="summary-section">
              <h3>Executive Summary</h3>
              <p>${safeReport.executive_summary}</p>
            </div>
            <div class="summary-section">
              <h3 style="color: #ef4444;">Key Risk Factors</h3>
              ${safeReport.key_risk_factors.map((f) => `<div class="list-item"><div class="bullet" style="background: #ef4444;"></div><span style="font-size: 13px;">${f}</span></div>`).join("")}
            </div>
            <div class="summary-section">
              <h3 style="color: #10b981;">Identified Strengths</h3>
              ${safeReport.identified_strengths.map((s) => `<div class="list-item"><div class="bullet" style="background: #10b981;"></div><span style="font-size: 13px;">${s}</span></div>`).join("")}
            </div>
            <div class="summary-section">
              <h3 style="color: #3b82f6;">Recommended Action Plan</h3>
              ${safeReport.action_plan.map((a, i) => `<div class="action-item"><div class="action-number">${i + 1}</div><div><div style="color: #e2e8f0; font-size: 13px;">${a.action || ""}</div><div style="color: #64748b; font-size: 11px; margin-top: 2px;">Timeframe: ${a.timeframe || ""}</div></div></div>`).join("")}
            </div>
            <div style="padding-top: 12px; border-top: 1px solid #334155;">
              <p style="color: #94a3b8; font-size: 13px;"><strong style="color: #e2e8f0;">Suggested Review:</strong> ${safeReport.review_timeline}</p>
            </div>
          </div>
        `
                : ""
            }

        <div class="footer">LSI-R Initial Assessment - CaseFlow</div>

        ${hasExitData
                ? `
          <div class="page-break"></div>
          <div class="page-title">Page 2 of 3</div>
          <div class="header">
            <h1>LSI-R Exit Assessment</h1>
            <p>${selectedParticipant.first_name} ${selectedParticipant.last_name} - ${selectedParticipant.current_phase} - Generated ${format(new Date(), "MMMM d, yyyy")}</p>
          </div>

          <div style="display: flex; gap: 20px; margin-bottom: 20px;">
            ${generateScoreCard(exitScores, exitTier, "Exit Assessment", "#8b5cf6")}
          </div>

          <div class="section">
            <h2>Exit Risk Profile</h2>
            <div class="chart-container">
              ${generateRadarSVG(exitScores, "#8b5cf6", "Exit Assessment Risk Distribution")}
            </div>
          </div>

          <div class="section">
            <h2>Section Scores - Exit Assessment</h2>
            ${SURVEY_SECTIONS.map((section) => {
                    const data = exitScores.sectionScores[section.section_id];
                    return `
                <div class="score-row">
                  <span style="color: ${data ? "#e2e8f0" : "#64748b"}; font-size: 13px;">${section.section_name}</span>
                  ${data
                            ? `
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <span style="color: #94a3b8; font-size: 12px;">${data.score}/${data.maxScore}</span>
                      <span class="risk-badge" style="background: ${riskColorMap[data.riskLevel]}20; color: ${riskColorMap[data.riskLevel]};">${data.riskLevel}</span>
                    </div>
                  `
                            : '<span style="color: #64748b; font-size: 12px;">Not completed</span>'
                        }
                </div>
              `;
                }).join("")}
          </div>

          <div class="footer">LSI-R Exit Assessment - CaseFlow</div>

          <div class="page-break"></div>
          <div class="page-title">Page 3 of 3</div>
          <div class="header">
            <h1>LSI-R Assessment Comparison</h1>
            <p>${selectedParticipant.first_name} ${selectedParticipant.last_name} - Initial vs Exit - Generated ${format(new Date(), "MMMM d, yyyy")}</p>
          </div>

          <div style="display: flex; gap: 20px; margin-bottom: 20px;">
            ${generateScoreCard(intakeScores, tier, "Initial", "#3b82f6")}

            <div style="flex: 1; background: ${scoreChange > 0 ? "rgba(16,185,129,0.05)" : scoreChange < 0 ? "rgba(239,68,68,0.05)" : "rgba(100,116,139,0.05)"};
                 border: 2px solid ${scoreChange > 0 ? "#10b98130" : scoreChange < 0 ? "#ef444430" : "#64748b30"};
                 border-radius: 12px; padding: 20px; text-align: center; display: flex; flex-direction: column; justify-content: center;">
              <div style="font-size: 14px; color: #94a3b8; margin-bottom: 8px;">Change</div>
              <div style="font-size: 42px; font-weight: bold; color: ${scoreChange > 0 ? "#10b981" : scoreChange < 0 ? "#ef4444" : "#64748b"};">
                ${scoreChange > 0 ? `-${scoreChange}` : scoreChange < 0 ? `+${Math.abs(scoreChange)}` : "0"}
              </div>
              <div style="color: #94a3b8; font-size: 14px;">points</div>
              ${scoreChange !== 0
                    ? `
                <div style="margin-top: 12px; display: inline-block; padding: 4px 12px; background: ${scoreChange > 0 ? "#10b98120" : "#ef444420"};
                     color: ${scoreChange > 0 ? "#10b981" : "#ef4444"}; border-radius: 20px; font-size: 12px;">
                  ${scoreChange > 0 ? `${percentageImprovement}% improvement` : `${Math.abs(percentageImprovement)}% increase`}
                </div>
              `
                    : ""
                }
            </div>

            ${generateScoreCard(exitScores, exitTier, "Exit", "#8b5cf6")}
          </div>

          <div class="section">
            <h2>Risk Profile Overlay</h2>
            <div style="display: flex; justify-content: space-around;">
              ${generateRadarSVG(intakeScores, "#3b82f6", "Initial")}
              ${generateRadarSVG(exitScores, "#8b5cf6", "Exit")}
            </div>
          </div>

          <div class="section">
            ${generateBarChartSVG(intakeScores, exitScores)}
          </div>

          <div class="section">
            <h2>Detailed Changes by Section</h2>
            ${SURVEY_SECTIONS.map((section) => {
                    const intakeData = intakeScores.sectionScores[section.section_id];
                    const exitData = exitScores.sectionScores[section.section_id];
                    const intakeScore = intakeData?.score || 0;
                    const exitScore = exitData?.score || 0;
                    const change = intakeScore - exitScore;
                    return `
                <div class="score-row">
                  <span style="color: #e2e8f0; font-size: 12px; flex: 1;">${section.section_name}</span>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="color: #3b82f6; font-size: 12px;">${intakeScore} pts</span>
                    <span style="color: #64748b;">→</span>
                    <span style="color: #8b5cf6; font-size: 12px;">${exitScore} pts</span>
                    <span style="padding: 2px 10px; border-radius: 12px; font-size: 11px; min-width: 50px; text-align: center;
                          background: ${change > 0 ? "#10b98120" : change < 0 ? "#ef444420" : "#64748b20"};
                          color: ${change > 0 ? "#10b981" : change < 0 ? "#ef4444" : "#64748b"};">
                      ${change > 0 ? `-${change}` : change < 0 ? `+${Math.abs(change)}` : "0"}
                    </span>
                  </div>
                </div>
              `;
                }).join("")}
          </div>

          <div class="footer">LSI-R Assessment Comparison - CaseFlow</div>
        `
                : ""
            }
      </body>
      </html>
    `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <Link
                to={createPageUrl("Reports")}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Reports
            </Link>

            <PageHeader title="LSI-R Assessment Report" subtitle="Individual risk assessment and action planning">
                {selectedParticipantId && participantScores && (
                    <div className="flex gap-2">
                        {!existingSavedReport && !generatedReport && (
                            <Button onClick={generateReport} disabled={isGenerating} className="bg-violet-600 hover:bg-violet-700">
                                {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lightbulb className="h-4 w-4 mr-2" />}
                                Generate Summary
                            </Button>
                        )}
                        <Button onClick={exportReport} variant="outline" className="border-slate-700">
                            <Download className="h-4 w-4 mr-2" />
                            Export PDF
                        </Button>
                    </div>
                )}
            </PageHeader>

            <div className="mb-6">
                <Select value={selectedParticipantId} onValueChange={(v) => setSelectedParticipantId(v)}>
                    <SelectTrigger className="w-72 bg-slate-900/50 border-slate-800 text-white">
                        <SelectValue placeholder="Select a participant" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 max-h-80">
                        {participantsWithSurveys.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-white">
                                {p.first_name} {p.last_name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {!selectedParticipantId ? (
                <EmptyState icon={BarChart3} title="Select a participant" description="Choose a participant to view their LSI-R assessment report" />
            ) : participantScores.completedSections === 0 ? (
                <EmptyState
                    icon={FileText}
                    title="No survey sections completed"
                    description="This participant has not completed any assessment sections yet"
                    actionLabel="Start Survey"
                    onAction={() => (window.location.href = createPageUrl(`SurveyForm?participant_id=${selectedParticipantId}`))}
                />
            ) : (
                <div ref={reportRef}>
                    <div className="mb-6">
                        <AssessmentComparison intakeScores={intakeScores} exitScores={exitScores} />
                    </div>

                    <Card className="bg-slate-900/50 border-slate-800 mb-6">
                        <CardHeader>
                            <CardTitle className="text-white">Section Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="min-w-full">
                                <div className="grid grid-cols-12 gap-4 mb-4 text-sm font-medium text-slate-400 px-3">
                                    <div className="col-span-4">Section</div>
                                    <div className="col-span-4">Initial Assessment</div>
                                    <div className="col-span-4">Exit Assessment</div>
                                </div>

                                <div className="space-y-2">
                                    {SURVEY_SECTIONS.map((section) => {
                                        const intakeData = intakeScores?.sectionScores[section.section_id];
                                        const exitData = exitScores?.sectionScores[section.section_id];

                                        return (
                                            <div
                                                key={section.section_id}
                                                className="grid grid-cols-12 gap-4 items-center p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                                            >
                                                <div className="col-span-4 flex items-center gap-3">
                                                    <span className="text-white text-sm font-medium">{section.section_name}</span>
                                                </div>

                                                <div className="col-span-4 flex items-center justify-between pr-4 border-r border-slate-700/50">
                                                    {intakeData ? (
                                                        <div className="flex items-center gap-3">
                                                            <Badge className={riskColors[intakeData.riskLevel]}>{intakeData.riskLevel}</Badge>
                                                            <span className="text-sm text-slate-300">
                                                                {intakeData.score}/{intakeData.maxScore}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-500 italic">Not started</span>
                                                    )}

                                                    <Link to={createPageUrl(`SurveyForm?participant_id=${selectedParticipantId}&section=${section.section_id}&type=intake_assessment`)}>
                                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
                                                            {intakeData ? "Edit" : "Start"}
                                                        </Button>
                                                    </Link>
                                                </div>

                                                <div className="col-span-4 flex items-center justify-between">
                                                    {exitData ? (
                                                        <div className="flex items-center gap-3">
                                                            <Badge className={riskColors[exitData.riskLevel]}>{exitData.riskLevel}</Badge>
                                                            <span className="text-sm text-slate-300">
                                                                {exitData.score}/{exitData.maxScore}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-500 italic">Not started</span>
                                                    )}

                                                    <Link to={createPageUrl(`SurveyForm?participant_id=${selectedParticipantId}&section=${section.section_id}&type=exit_assessment`)}>
                                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10">
                                                            {exitData ? "Edit" : "Start"}
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {generatedReport && (
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Target className="h-5 w-5 text-violet-400" />
                                    Assessment Summary & Action Plan
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2">Executive Summary</h4>
                                    <p className="text-white">{normalizeAiReport(generatedReport).executive_summary}</p>
                                </div>

                                <div>
                                    <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        Key Risk Factors
                                    </h4>
                                    <ul className="space-y-1">
                                        {normalizeAiReport(generatedReport).key_risk_factors.map((factor, i) => (
                                            <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                                                <span className="text-red-400 mt-1">•</span>
                                                {factor}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4" />
                                        Identified Strengths
                                    </h4>
                                    <ul className="space-y-1">
                                        {normalizeAiReport(generatedReport).identified_strengths.map((strength, i) => (
                                            <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                                                <span className="text-emerald-400 mt-1">•</span>
                                                {strength}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
                                        <Target className="h-4 w-4" />
                                        Recommended Action Plan
                                    </h4>
                                    <div className="space-y-2">
                                        {normalizeAiReport(generatedReport).action_plan.map((action, i) => (
                                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30">
                                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-medium">
                                                    {i + 1}
                                                </span>
                                                <div>
                                                    <p className="text-white">{action?.action || ""}</p>
                                                    <p className="text-xs text-slate-500 mt-1">Timeframe: {action?.timeframe || ""}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800">
                                    <p className="text-sm text-slate-400">
                                        <span className="font-medium text-white">Suggested Review:</span> {normalizeAiReport(generatedReport).review_timeline}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
