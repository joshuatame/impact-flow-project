import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    BarChart3,
    Download,
    Loader2,
    AlertTriangle,
    CheckCircle,
    Target,
    Lightbulb,
    TrendingDown,
    Plus,
    Circle,
    Clock,
    MessageSquare,
    Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    Legend,
} from "recharts";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { SURVEY_SECTIONS } from "@/pages/SurveyForm.jsx";

const riskColors = {
    Low: "bg-emerald-500/10 text-emerald-400",
    Moderate: "bg-amber-500/10 text-amber-400",
    High: "bg-orange-500/10 text-orange-400",
    "Very High": "bg-red-500/10 text-red-400",
};

const tierConfig = {
    1: { name: "Tier 1 - Low Risk", color: "bg-emerald-500", textColor: "text-emerald-400", range: "0-24" },
    2: { name: "Tier 2 - Low-Moderate", color: "bg-green-500", textColor: "text-green-400", range: "25-39" },
    3: { name: "Tier 3 - Moderate", color: "bg-amber-500", textColor: "text-amber-400", range: "40-54" },
    4: { name: "Tier 4 - Moderate-High", color: "bg-orange-500", textColor: "text-orange-400", range: "55-69" },
    5: { name: "Tier 5 - High Risk", color: "bg-red-500", textColor: "text-red-400", range: "70-100" },
};

const getTier = (score) => {
    if (score <= 24) return 1;
    if (score <= 39) return 2;
    if (score <= 54) return 3;
    if (score <= 69) return 4;
    return 5;
};

// Final report normalization (THIS component's schema)
function normalizeFinalReport(raw) {
    const obj = raw && typeof raw === "object" ? raw : {};
    return {
        executive_summary: typeof obj.executive_summary === "string" ? obj.executive_summary : "",
        risk_reduction_analysis: typeof obj.risk_reduction_analysis === "string" ? obj.risk_reduction_analysis : "",
        recidivism_assessment: typeof obj.recidivism_assessment === "string" ? obj.recidivism_assessment : "",
        key_achievements: Array.isArray(obj.key_achievements) ? obj.key_achievements.filter(Boolean) : [],
        action_plan_outcomes: typeof obj.action_plan_outcomes === "string" ? obj.action_plan_outcomes : "",
        ongoing_recommendations: Array.isArray(obj.ongoing_recommendations) ? obj.ongoing_recommendations.filter(Boolean) : [],
        prognosis: typeof obj.prognosis === "string" ? obj.prognosis : "",
    };
}

export default function ParticipantRiskReport({ participantId, participant }) {
    const [generatedReport, setGeneratedReport] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
    const [selectedAction, setSelectedAction] = useState(null);
    const [responseNotes, setResponseNotes] = useState("");
    const queryClient = useQueryClient();

    const { data: surveys = [], isLoading } = useQuery({
        queryKey: ["surveyResponses", participantId],
        queryFn: () => base44.entities.SurveyResponse.filter({ participant_id: participantId }),
    });

    const { data: actionPlanItems = [], isLoading: loadingActions } = useQuery({
        queryKey: ["actionPlanItems", participantId],
        queryFn: () => base44.entities.ActionPlanItem.filter({ participant_id: participantId }),
    });

    const { data: savedReports = [] } = useQuery({
        queryKey: ["savedReports", participantId],
        queryFn: () => base44.entities.SavedReport.filter({ participant_id: participantId }),
    });

    // Check if final report already exists
    const existingSavedReport = savedReports.find((r) => r.report_type === "lsi_r_final");

    const { data: user } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    // Load saved report into state on mount
    React.useEffect(() => {
        if (existingSavedReport && !generatedReport) {
            setGeneratedReport(
                normalizeFinalReport({
                    executive_summary: existingSavedReport.executive_summary,
                    risk_reduction_analysis: existingSavedReport.risk_reduction_analysis,
                    recidivism_assessment: existingSavedReport.recidivism_assessment,
                    key_achievements: existingSavedReport.key_achievements,
                    action_plan_outcomes: existingSavedReport.action_plan_outcomes,
                    ongoing_recommendations: existingSavedReport.ongoing_recommendations,
                    prognosis: existingSavedReport.prognosis,
                })
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingSavedReport?.id]);

    const completeActionMutation = useMutation({
        mutationFn: async ({ actionId, notes }) => {
            await base44.entities.ActionPlanItem.update(actionId, {
                status: "Completed",
                response_notes: notes,
                completed_by_id: user?.id || null,
                completed_by_name: user?.full_name || user?.display_name || null,
                completed_date: new Date().toISOString(),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(["actionPlanItems", participantId]);
            setCompleteDialogOpen(false);
            setSelectedAction(null);
            setResponseNotes("");
        },
    });

    if (isLoading) return <LoadingSpinner />;

    // Separate intake and exit surveys
    const intakeSurveys = surveys.filter((s) => s.section_id && s.survey_template_id === "intake_assessment");
    const exitSurveys = surveys.filter((s) => s.section_id && s.survey_template_id === "exit_assessment");

    // Calculate scores for a set of surveys
    const calculateScores = (surveySet) => {
        let totalScore = 0;
        const sectionScores = {};

        // Sort by date descending to get latest
        const sortedSet = [...surveySet].sort(
            (a, b) => new Date(b.completed_date || b.created_date) - new Date(a.completed_date || a.created_date)
        );

        sortedSet.forEach((s) => {
            if (s.section_id && s.overall_score !== undefined) {
                // Only process unique sections
                if (!sectionScores[s.section_id]) {
                    sectionScores[s.section_id] = {
                        score: s.overall_score,
                        maxScore: SURVEY_SECTIONS.find((sec) => sec.section_id === s.section_id)?.max_points || 0,
                        riskLevel: s.overall_risk_band,
                    };
                    totalScore += s.overall_score;
                }
            }
        });

        return { totalScore, sectionScores, completedSections: Object.keys(sectionScores).length };
    };

    const intakeScores = calculateScores(intakeSurveys);
    const exitScores = calculateScores(exitSurveys);

    const hasIntake = intakeScores.completedSections > 0;
    const hasExit = exitScores.completedSections > 0;
    const intakeComplete = intakeScores.completedSections === SURVEY_SECTIONS.length;
    const exitComplete = exitScores.completedSections === SURVEY_SECTIONS.length;
    const canGenerateFinalReport = intakeComplete && exitComplete;

    const intakeTier = hasIntake ? getTier(intakeScores.totalScore) : null;
    const exitTier = hasExit ? getTier(exitScores.totalScore) : null;

    // Score change
    const scoreChange = hasIntake && hasExit ? intakeScores.totalScore - exitScores.totalScore : null;
    const percentageReduction =
        scoreChange !== null && intakeScores.totalScore > 0 ? Math.round((scoreChange / intakeScores.totalScore) * 100) : null;

    // Comparison chart data
    const comparisonData = SURVEY_SECTIONS.map((section) => {
        const intakeData = intakeScores.sectionScores[section.section_id];
        const exitData = exitScores.sectionScores[section.section_id];
        return {
            name: section.section_name.split("/")[0].trim().slice(0, 8),
            fullName: section.section_name,
            intake: intakeData ? Math.round((intakeData.score / section.max_points) * 100) : 0,
            exit: exitData ? Math.round((exitData.score / section.max_points) * 100) : 0,
            maxPoints: section.max_points,
        };
    });

    // Radar data for comparison
    const radarData = SURVEY_SECTIONS.map((section) => {
        const intakeData = intakeScores.sectionScores[section.section_id];
        const exitData = exitScores.sectionScores[section.section_id];
        return {
            domain: section.section_name.split("/")[0].trim(),
            Intake: intakeData ? Math.round((intakeData.score / section.max_points) * 100) : 0,
            Exit: exitData ? Math.round((exitData.score / section.max_points) * 100) : 0,
        };
    });

    // Generate action plan from intake assessment
    const generateActionPlan = async () => {
        if (!hasIntake) return;

        setIsGeneratingPlan(true);
        try {
            const highRiskSections = SURVEY_SECTIONS.filter((s) => {
                const data = intakeScores.sectionScores[s.section_id];
                return data && (data.riskLevel === "High" || data.riskLevel === "Very High");
            }).map((s) => s.section_name);

            const moderateRiskSections = SURVEY_SECTIONS.filter((s) => {
                const data = intakeScores.sectionScores[s.section_id];
                return data && data.riskLevel === "Moderate";
            }).map((s) => s.section_name);

            const prompt = `Generate an action plan for a case management participant based on their intake LSI-R assessment.

Participant: ${participant.first_name} ${participant.last_name}
Total Risk Score: ${intakeScores.totalScore}/100
Risk Tier: ${tierConfig[intakeTier].name}

High Risk Areas: ${highRiskSections.length > 0 ? highRiskSections.join(", ") : "None"}
Moderate Risk Areas: ${moderateRiskSections.length > 0 ? moderateRiskSections.join(", ") : "None"}

Generate 5-8 specific, actionable interventions that case workers must complete with the participant.

Return JSON only. Each item MUST include:
- action (string)
- risk_area (string)
- timeframe (string)
- priority (number, 1 = highest urgency)`;

            // FIX: required must exist and include every key in properties
            const schema = {
                type: "object",
                properties: {
                    actions: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                action: { type: "string" },
                                risk_area: { type: "string" },
                                timeframe: { type: "string" },
                                priority: { type: "number" },
                            },
                            required: ["action", "risk_area", "timeframe", "priority"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["actions"],
                additionalProperties: false,
            };

            const raw = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: schema,
            });

            const actions = Array.isArray(raw?.actions) ? raw.actions : [];

            // Save action plan items
            for (const action of actions) {
                await base44.entities.ActionPlanItem.create({
                    participant_id: participantId,
                    action_text: typeof action?.action === "string" ? action.action : "",
                    risk_area: typeof action?.risk_area === "string" ? action.risk_area : "General",
                    timeframe: typeof action?.timeframe === "string" ? action.timeframe : "",
                    priority: typeof action?.priority === "number" ? action.priority : 99,
                    status: "Pending",
                });
            }

            queryClient.invalidateQueries(["actionPlanItems", participantId]);
        } catch (error) {
            console.error("Error generating action plan:", error);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    // Generate final comparison report (only if both complete)
    const generateComparisonReport = async () => {
        if (!canGenerateFinalReport) return;

        setIsGenerating(true);
        try {
            const improvements = [];
            const declines = [];

            SURVEY_SECTIONS.forEach((section) => {
                const intakeData = intakeScores.sectionScores[section.section_id];
                const exitData = exitScores.sectionScores[section.section_id];
                if (intakeData && exitData) {
                    const change = intakeData.score - exitData.score;
                    if (change > 0) improvements.push(`${section.section_name}: improved by ${change} points`);
                    else if (change < 0) declines.push(`${section.section_name}: increased risk by ${Math.abs(change)} points`);
                }
            });

            // Get completed action items
            const completedActions = actionPlanItems.filter((a) => a.status === "Completed");

            const prompt = `Generate a professional recidivism risk reduction final report for a program participant who has completed both intake and exit assessments.

Participant: ${participant.first_name} ${participant.last_name}
Program Phase: ${participant.current_phase}

INTAKE ASSESSMENT:
- Total Score: ${intakeScores.totalScore}/100
- Risk Tier: ${tierConfig[intakeTier].name}

EXIT ASSESSMENT:
- Total Score: ${exitScores.totalScore}/100
- Risk Tier: ${tierConfig[exitTier].name}

CHANGES:
- Score Reduction: ${scoreChange} points (${percentageReduction}% improvement)
- Areas of Improvement: ${improvements.join("; ") || "None"}
- Areas of Concern: ${declines.join("; ") || "None"}

COMPLETED ACTION PLAN ITEMS (${completedActions.length} of ${actionPlanItems.length}):
${completedActions.map((a) => `- ${a.action_text}: ${a.response_notes || "No notes"}`).join("\n")}

Provide a comprehensive final report with:
1. Executive Summary (3-4 sentences on overall program journey)
2. Risk Reduction Analysis (detailed analysis of what changed and why)
3. Recidivism Likelihood Assessment (professional assessment of reduced likelihood of reoffending with percentage estimate if appropriate)
4. Key Achievements
5. Action Plan Outcomes
6. Ongoing Support Recommendations
7. Prognosis

Be professional, evidence-based, and focused on measurable outcomes.`;

            const schema = {
                type: "object",
                properties: {
                    executive_summary: { type: "string" },
                    risk_reduction_analysis: { type: "string" },
                    recidivism_assessment: { type: "string" },
                    key_achievements: { type: "array", items: { type: "string" } },
                    action_plan_outcomes: { type: "string" },
                    ongoing_recommendations: { type: "array", items: { type: "string" } },
                    prognosis: { type: "string" },
                },
                required: [
                    "executive_summary",
                    "risk_reduction_analysis",
                    "recidivism_assessment",
                    "key_achievements",
                    "action_plan_outcomes",
                    "ongoing_recommendations",
                    "prognosis",
                ],
                additionalProperties: false,
            };

            const raw = await base44.integrations.Core.InvokeLLM({
                prompt,
                response_json_schema: schema,
            });

            const normalized = normalizeFinalReport(raw);
            setGeneratedReport(normalized);

            // Save report permanently (save normalized, not raw)
            await base44.entities.SavedReport.create({
                participant_id: participantId,
                report_type: "lsi_r_final",
                intake_score: intakeScores.totalScore,
                exit_score: exitScores.totalScore,
                score_change: scoreChange,
                percentage_improvement: percentageReduction,
                executive_summary: normalized.executive_summary,
                risk_reduction_analysis: normalized.risk_reduction_analysis,
                recidivism_assessment: normalized.recidivism_assessment,
                key_achievements: normalized.key_achievements,
                action_plan_outcomes: normalized.action_plan_outcomes,
                ongoing_recommendations: normalized.ongoing_recommendations,
                prognosis: normalized.prognosis,
                generated_by_id: user?.id || null,
                generated_by_name: user?.full_name || user?.display_name || null,
            });

            queryClient.invalidateQueries(["savedReports", participantId]);
        } catch (error) {
            console.error("Error generating report:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    // Export report
    const exportReport = () => {
        const lines = [
            "RISK ASSESSMENT & RECIDIVISM REPORT",
            "====================================",
            "",
            `Participant: ${participant.first_name} ${participant.last_name}`,
            `Date Generated: ${format(new Date(), "MMMM d, yyyy")}`,
            `Current Phase: ${participant.current_phase}`,
            "",
            "INTAKE ASSESSMENT",
            "-----------------",
            `Total Score: ${intakeScores.totalScore}/100`,
            `Risk Tier: ${intakeTier ? tierConfig[intakeTier].name : "N/A"}`,
            `Sections Completed: ${intakeScores.completedSections}/${SURVEY_SECTIONS.length}`,
            "",
        ];

        if (hasExit) {
            lines.push("EXIT ASSESSMENT");
            lines.push("---------------");
            lines.push(`Total Score: ${exitScores.totalScore}/100`);
            lines.push(`Risk Tier: ${exitTier ? tierConfig[exitTier].name : "N/A"}`);
            lines.push(`Sections Completed: ${exitScores.completedSections}/${SURVEY_SECTIONS.length}`);
            lines.push("");
            lines.push("COMPARISON");
            lines.push("----------");
            lines.push(`Score Change: ${scoreChange > 0 ? "-" : "+"}${Math.abs(scoreChange)}`);
            lines.push(`Percentage Improvement: ${percentageReduction}%`);
            lines.push("");
        }

        if (generatedReport) {
            const safe = normalizeFinalReport(generatedReport);

            lines.push("EXECUTIVE SUMMARY");
            lines.push("-----------------");
            lines.push(safe.executive_summary);
            lines.push("");
            lines.push("RISK REDUCTION ANALYSIS");
            lines.push("-----------------------");
            lines.push(safe.risk_reduction_analysis);
            lines.push("");
            lines.push("RECIDIVISM LIKELIHOOD ASSESSMENT");
            lines.push("--------------------------------");
            lines.push(safe.recidivism_assessment);
            lines.push("");
            lines.push("KEY ACHIEVEMENTS");
            lines.push("----------------");
            safe.key_achievements.forEach((a) => lines.push(`• ${a}`));
            lines.push("");
            if (safe.action_plan_outcomes) {
                lines.push("ACTION PLAN OUTCOMES");
                lines.push("--------------------");
                lines.push(safe.action_plan_outcomes);
                lines.push("");
            }
            lines.push("ONGOING RECOMMENDATIONS");
            lines.push("-----------------------");
            safe.ongoing_recommendations.forEach((r) => lines.push(`• ${r}`));
            lines.push("");
            lines.push("PROGNOSIS");
            lines.push("---------");
            lines.push(safe.prognosis);
        }

        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Risk_Report_${participant.first_name}_${participant.last_name}_${format(new Date(), "yyyy-MM-dd")}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCompleteAction = (action) => {
        setSelectedAction(action);
        setResponseNotes("");
        setCompleteDialogOpen(true);
    };

    const submitCompletion = () => {
        if (!responseNotes.trim()) return;
        completeActionMutation.mutate({ actionId: selectedAction.id, notes: responseNotes });
    };

    // Action plan stats
    const completedActionsCount = actionPlanItems.filter((a) => a.status === "Completed").length;
    const actionPlanProgress =
        actionPlanItems.length > 0 ? Math.round((completedActionsCount / actionPlanItems.length) * 100) : 0;

    if (!hasIntake) {
        return (
            <EmptyState
                icon={BarChart3}
                title="No intake assessment completed"
                description="Complete an intake survey to generate a risk assessment report"
                actionLabel="Start Intake Survey"
                onAction={() => (window.location.href = createPageUrl(`SurveyForm?participant_id=${participantId}`))}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-lg font-semibold text-white">Risk Assessment Report</h3>
                <div className="flex gap-2 flex-wrap">
                    {canGenerateFinalReport ? (
                        <>
                            {!existingSavedReport && !generatedReport && (
                                <Button onClick={generateComparisonReport} disabled={isGenerating} className="bg-violet-600 hover:bg-violet-700">
                                    {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lightbulb className="h-4 w-4 mr-2" />}
                                    Generate Final Report
                                </Button>
                            )}
                            {(existingSavedReport || generatedReport) && (
                                <Button onClick={exportReport} variant="outline" className="border-slate-700">
                                    <Download className="h-4 w-4 mr-2" />
                                    Export
                                </Button>
                            )}
                        </>
                    ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 py-2 px-3">
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Complete both Intake & Exit surveys to generate final report
                        </Badge>
                    )}
                </div>
            </div>

            {/* Tier Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Intake Card */}
                <Card
                    className={`border-2 ${intakeTier <= 2
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : intakeTier === 3
                                ? "border-amber-500/30 bg-amber-500/5"
                                : "border-red-500/30 bg-red-500/5"
                        }`}
                >
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm text-slate-400">Intake Assessment</CardTitle>
                            {intakeComplete && <Badge className="bg-emerald-500/10 text-emerald-400">Complete</Badge>}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`w-3 h-3 rounded-full ${tierConfig[intakeTier].color}`} />
                            <span className={`text-lg font-bold ${tierConfig[intakeTier].textColor}`}>{tierConfig[intakeTier].name}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">
                            {intakeScores.totalScore}
                            <span className="text-lg text-slate-400">/100</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            {intakeScores.completedSections}/{SURVEY_SECTIONS.length} sections completed
                        </p>
                    </CardContent>
                </Card>

                {/* Exit Card */}
                <Card
                    className={`border-2 ${!hasExit
                            ? "border-slate-700 bg-slate-800/20"
                            : exitTier <= 2
                                ? "border-emerald-500/30 bg-emerald-500/5"
                                : exitTier === 3
                                    ? "border-amber-500/30 bg-amber-500/5"
                                    : "border-red-500/30 bg-red-500/5"
                        }`}
                >
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm text-slate-400">Exit Assessment</CardTitle>
                            {exitComplete && <Badge className="bg-emerald-500/10 text-emerald-400">Complete</Badge>}
                        </div>
                    </CardHeader>
                    <CardContent>
                        {hasExit ? (
                            <>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`w-3 h-3 rounded-full ${tierConfig[exitTier].color}`} />
                                    <span className={`text-lg font-bold ${tierConfig[exitTier].textColor}`}>{tierConfig[exitTier].name}</span>
                                </div>
                                <p className="text-3xl font-bold text-white">
                                    {exitScores.totalScore}
                                    <span className="text-lg text-slate-400">/100</span>
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {exitScores.completedSections}/{SURVEY_SECTIONS.length} sections completed
                                </p>
                            </>
                        ) : (
                            <div className="py-4">
                                <p className="text-slate-400 mb-3">Not yet completed</p>
                                <Link to={createPageUrl(`SurveyForm?participant_id=${participantId}&type=exit`)}>
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Start Exit Survey
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Action Plan Section */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-white flex items-center gap-2">
                            <Target className="h-5 w-5 text-blue-400" />
                            Action Plan
                        </CardTitle>
                        {actionPlanItems.length === 0 && hasIntake && (
                            <Button
                                onClick={generateActionPlan}
                                disabled={isGeneratingPlan}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {isGeneratingPlan ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lightbulb className="h-4 w-4 mr-2" />}
                                Generate Action Plan
                            </Button>
                        )}
                    </div>
                    {actionPlanItems.length > 0 && (
                        <div className="mt-3">
                            <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-slate-400">
                                    {completedActionsCount} of {actionPlanItems.length} actions completed
                                </span>
                                <span className="text-white font-medium">{actionPlanProgress}%</span>
                            </div>
                            <Progress value={actionPlanProgress} className="h-2 bg-slate-800" />
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {actionPlanItems.length === 0 ? (
                        <p className="text-slate-400 text-sm py-4 text-center">
                            Generate an action plan based on the intake assessment to track interventions
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {actionPlanItems
                                .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                                .map((action) => (
                                    <div
                                        key={action.id}
                                        className={`p-4 rounded-xl border ${action.status === "Completed" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-slate-800/30 border-slate-700"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3">
                                                {action.status === "Completed" ? (
                                                    <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                                ) : (
                                                    <Circle className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                                )}
                                                <div>
                                                    <p className={action.status === "Completed" ? "text-emerald-400" : "text-white"}>{action.action_text}</p>
                                                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                                        {action.risk_area && <Badge variant="outline" className="text-xs">{action.risk_area}</Badge>}
                                                        {action.timeframe && (
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {action.timeframe}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {action.status === "Completed" && action.response_notes && (
                                                        <div className="mt-3 p-3 bg-slate-800/50 rounded-lg">
                                                            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                                                                <MessageSquare className="h-3 w-3" />
                                                                Response:
                                                            </p>
                                                            <p className="text-sm text-slate-300">{action.response_notes}</p>
                                                            {action.completed_date && (
                                                                <p className="text-xs text-slate-500 mt-2">
                                                                    Completed by {action.completed_by_name} on {format(new Date(action.completed_date), "MMM d, yyyy")}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {action.status !== "Completed" && (
                                                <Button size="sm" onClick={() => handleCompleteAction(action)} className="bg-emerald-600 hover:bg-emerald-700">
                                                    Complete
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Score Change Summary */}
            {hasExit && scoreChange !== null && (
                <Card
                    className={`border ${scoreChange > 0
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : scoreChange < 0
                                ? "border-red-500/30 bg-red-500/5"
                                : "border-slate-700 bg-slate-800/20"
                        }`}
                >
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${scoreChange > 0 ? "bg-emerald-500/20" : scoreChange < 0 ? "bg-red-500/20" : "bg-slate-700"}`}>
                                    <TrendingDown className={`h-6 w-6 ${scoreChange > 0 ? "text-emerald-400" : scoreChange < 0 ? "text-red-400 rotate-180" : "text-slate-400"}`} />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Risk Score Change</p>
                                    <p className={`text-2xl font-bold ${scoreChange > 0 ? "text-emerald-400" : scoreChange < 0 ? "text-red-400" : "text-white"}`}>
                                        {scoreChange > 0 ? "-" : "+"}
                                        {Math.abs(scoreChange)} points
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-400">Improvement</p>
                                <p className={`text-2xl font-bold ${percentageReduction > 0 ? "text-emerald-400" : percentageReduction < 0 ? "text-red-400" : "text-white"}`}>
                                    {percentageReduction > 0 ? "+" : ""}
                                    {percentageReduction}%
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Comparison Charts */}
            {hasExit && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white">Section Comparison</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={comparisonData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis type="number" stroke="#64748b" domain={[0, 100]} />
                                        <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} width={60} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                                            formatter={(value, name) => [`${value}%`, name === "intake" ? "Intake" : "Exit"]}
                                        />
                                        <Legend />
                                        <Bar dataKey="intake" name="Intake" fill="#ef4444" radius={[0, 2, 2, 0]} />
                                        <Bar dataKey="exit" name="Exit" fill="#22c55e" radius={[0, 2, 2, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white">Risk Profile Comparison</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart data={radarData}>
                                        <PolarGrid stroke="#334155" />
                                        <PolarAngleAxis dataKey="domain" stroke="#64748b" fontSize={9} />
                                        <PolarRadiusAxis stroke="#64748b" domain={[0, 100]} />
                                        <Radar name="Intake" dataKey="Intake" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                                        <Radar name="Exit" dataKey="Exit" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                                        <Legend />
                                        <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Generated Report */}
            {generatedReport && (
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Target className="h-5 w-5 text-violet-400" />
                            Final Assessment Report & Recidivism Analysis
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <h4 className="text-sm font-medium text-slate-400 mb-2">Executive Summary</h4>
                            <p className="text-white">{generatedReport.executive_summary}</p>
                        </div>

                        <div>
                            <h4 className="text-sm font-medium text-blue-400 mb-2">Risk Reduction Analysis</h4>
                            <p className="text-slate-300">{generatedReport.risk_reduction_analysis}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                                <TrendingDown className="h-4 w-4" />
                                Recidivism Likelihood Assessment
                            </h4>
                            <p className="text-white">{generatedReport.recidivism_assessment}</p>
                        </div>

                        <div>
                            <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                                <CheckCircle className="h-4 w-4" />
                                Key Achievements
                            </h4>
                            <ul className="space-y-1">
                                {generatedReport.key_achievements.map((achievement, i) => (
                                    <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                                        <span className="text-emerald-400 mt-1">•</span>
                                        {achievement}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {generatedReport.action_plan_outcomes && (
                            <div>
                                <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
                                    <Target className="h-4 w-4" />
                                    Action Plan Outcomes
                                </h4>
                                <p className="text-slate-300">{generatedReport.action_plan_outcomes}</p>
                            </div>
                        )}

                        <div>
                            <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Ongoing Support Recommendations
                            </h4>
                            <ul className="space-y-1">
                                {generatedReport.ongoing_recommendations.map((rec, i) => (
                                    <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                                        <span className="text-amber-400 mt-1">•</span>
                                        {rec}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="pt-4 border-t border-slate-800">
                            <h4 className="text-sm font-medium text-violet-400 mb-2">Prognosis</h4>
                            <p className="text-white">{generatedReport.prognosis}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Complete Action Dialog */}
            <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Complete Action Item</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                            <p className="text-white">{selectedAction?.action_text}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-400 mb-2 block">Response / Notes (required)</label>
                            <Textarea
                                value={responseNotes}
                                onChange={(e) => setResponseNotes(e.target.value)}
                                placeholder="Describe what was done, outcomes achieved, participant response..."
                                className="bg-slate-800 border-slate-700 text-white min-h-[120px]"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)} className="border-slate-700">
                                Cancel
                            </Button>
                            <Button
                                onClick={submitCompletion}
                                disabled={!responseNotes.trim() || completeActionMutation.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700"
                            >
                                {completeActionMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                Complete Action
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
