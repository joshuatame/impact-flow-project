import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Plus,
    ClipboardList,
    CheckCircle,
    Circle,
    FileText,
    Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SURVEY_SECTIONS } from "@/pages/SurveyForm.jsx";

const riskColors = {
    Low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Moderate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    High: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    "Very High": "bg-red-500/10 text-red-400 border-red-500/20",
};

const LSIR_TEMPLATE_IDS = ["intake_assessment", "exit_assessment"];

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function getTemplateQuestionsFlat(t) {
    const sections =
        t?.sections ||
        t?.sections_json ||
        t?.template_json?.sections ||
        t?.template_json?.sections_json ||
        [];

    const flat = [];
    sections.forEach((s, sIdx) => {
        const sectionName = s.section_name || s.name || `Section ${sIdx + 1}`;
        const questions = s.questions || s.questions_json || [];
        questions.forEach((q, qIdx) => {
            flat.push({
                sectionName,
                question_id: q.question_id || q.id || `${sIdx}_${qIdx}`,
                question_text: q.question_text || q.text || q.label || `Question ${qIdx + 1}`,
                type: q.type || (Array.isArray(q.options) ? "radio" : "text"),
                options: q.options || [],
            });
        });
    });

    if (flat.length === 0) {
        const questions = t?.questions || t?.questions_json || t?.template_json?.questions || [];
        questions.forEach((q, idx) => {
            flat.push({
                sectionName: null,
                question_id: q.question_id || q.id || String(idx),
                question_text: q.question_text || q.text || q.label || `Question ${idx + 1}`,
                type: q.type || (Array.isArray(q.options) ? "radio" : "text"),
                options: q.options || [],
            });
        });
    }

    return flat;
}

export default function ParticipantSurveys({ participantId }) {
    const queryClient = useQueryClient();

    const [surveyTab, setSurveyTab] = useState("lsir"); // lsir | other
    const [assessmentType, setAssessmentType] = useState("intake"); // intake | exit

    // Viewer state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerMode, setViewerMode] = useState("other"); // other | lsir
    const [viewerTemplateId, setViewerTemplateId] = useState("");
    const [viewerResponseId, setViewerResponseId] = useState("");
    const [viewerSectionId, setViewerSectionId] = useState(""); // for LSI-R
    const [viewerTitle, setViewerTitle] = useState("");

    const responsesQuery = useQuery({
        queryKey: ["surveyResponses", participantId],
        queryFn: () => base44.entities.SurveyResponse.filter({ participant_id: participantId }),
        enabled: !!participantId,
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: () => queryClient.getQueryData(["surveyResponses", participantId]) || [],
    });

    const templatesQuery = useQuery({
        queryKey: ["surveyTemplates"],
        queryFn: () => base44.entities.SurveyTemplate.list("-created_date", 1000),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: () => queryClient.getQueryData(["surveyTemplates"]) || [],
    });

    const allResponses = Array.isArray(responsesQuery.data) ? responsesQuery.data : [];
    const surveyTemplates = Array.isArray(templatesQuery.data) ? templatesQuery.data : [];

    const isSyncing = responsesQuery.isFetching || templatesQuery.isFetching;

    // -------------------------
    // LSI-R progress (unchanged)
    // -------------------------
    const lsirResponses = useMemo(() => {
        const templateId = assessmentType === "exit" ? "exit_assessment" : "intake_assessment";
        return allResponses.filter((r) => r.survey_template_id === templateId);
    }, [allResponses, assessmentType]);

    const completedSectionIds = useMemo(() => {
        return new Set(lsirResponses.filter((s) => s.section_id).map((s) => s.section_id));
    }, [lsirResponses]);

    const totalMaxPoints = useMemo(() => SURVEY_SECTIONS.reduce((sum, s) => sum + s.max_points, 0), []);
    const completedPoints = useMemo(() => {
        return SURVEY_SECTIONS.filter((s) => completedSectionIds.has(s.section_id)).reduce(
            (sum, s) => sum + s.max_points,
            0
        );
    }, [completedSectionIds]);

    const overallProgress = totalMaxPoints > 0 ? Math.round((completedPoints / totalMaxPoints) * 100) : 0;

    const totalScore = useMemo(() => {
        return lsirResponses
            .filter((s) => s.section_id)
            .reduce((sum, s) => sum + (s.overall_score || 0), 0);
    }, [lsirResponses]);

    const surveyUrlSuffix = assessmentType === "exit" ? "&type=exit" : "";

    const isAssessmentFullyComplete = (templateId) => {
        const done = new Set(
            allResponses
                .filter((r) => r.survey_template_id === templateId && r.section_id)
                .map((r) => r.section_id)
        );
        return SURVEY_SECTIONS.every((s) => done.has(s.section_id));
    };

    const intakeFullyComplete = useMemo(() => isAssessmentFullyComplete("intake_assessment"), [allResponses]);
    const exitFullyComplete = useMemo(() => isAssessmentFullyComplete("exit_assessment"), [allResponses]);
    const hideCompleteSectionButton = intakeFullyComplete && exitFullyComplete;

    // -------------------------
    // Other surveys (custom templates)
    // -------------------------
    const otherTemplates = useMemo(() => {
        const list = Array.isArray(surveyTemplates) ? surveyTemplates : [];
        return list.filter((t) => {
            const id = t.id || t.survey_template_id;
            if (id && LSIR_TEMPLATE_IDS.includes(id)) return false;

            const n = (t.template_name || t.survey_template_name || "").toLowerCase();
            if (n.includes("lsi") || n.includes("lsir")) return false;
            if (n.includes("intake assessment") || n.includes("exit assessment")) return false;

            return true;
        });
    }, [surveyTemplates]);

    const templatesById = useMemo(() => {
        const map = new Map();
        (surveyTemplates || []).forEach((t) => {
            const id = t.id || t.survey_template_id;
            if (!id) return;
            map.set(id, t);
        });
        return map;
    }, [surveyTemplates]);

    const responsesByTemplateId = useMemo(() => {
        const map = new Map();
        allResponses.forEach((r) => {
            const tid = r.survey_template_id;
            if (!tid) return;
            if (LSIR_TEMPLATE_IDS.includes(tid)) return;
            if (!map.has(tid)) map.set(tid, []);
            map.get(tid).push(r);
        });
        // sort each list newest-first
        for (const [k, arr] of map.entries()) {
            arr.sort((a, b) => String(b.created_date || b.completed_date || "").localeCompare(String(a.created_date || a.completed_date || "")));
            map.set(k, arr);
        }
        return map;
    }, [allResponses]);

    const openOtherSurvey = (templateId) => {
        window.location.href = createPageUrl(
            `SurveyTemplateForm?participant_id=${participantId}&template_id=${templateId}`
        );
    };

    const openOtherResults = (templateId) => {
        const list = responsesByTemplateId.get(templateId) || [];
        const latest = list[0];
        if (!latest) return;

        const t = templatesById.get(templateId);
        const title =
            t?.template_name ||
            t?.survey_template_name ||
            t?.name ||
            latest?.survey_template_name ||
            "Survey Results";

        setViewerMode("other");
        setViewerTemplateId(templateId);
        setViewerResponseId(latest.id || "");
        setViewerSectionId("");
        setViewerTitle(title);
        setViewerOpen(true);
    };

    const openLsirSectionResults = (sectionId) => {
        const r = lsirResponses.find((x) => x.section_id === sectionId);
        if (!r) return;

        const section = SURVEY_SECTIONS.find((s) => s.section_id === sectionId);
        const title = `LSI-R - ${section?.section_name || "Section"}`;

        setViewerMode("lsir");
        setViewerTemplateId(assessmentType === "exit" ? "exit_assessment" : "intake_assessment");
        setViewerResponseId(r.id || "");
        setViewerSectionId(sectionId);
        setViewerTitle(title);
        setViewerOpen(true);
    };

    // Viewer derived
    const viewerTemplate = useMemo(() => {
        if (!viewerTemplateId) return null;
        return templatesById.get(viewerTemplateId) || null;
    }, [templatesById, viewerTemplateId]);

    const viewerQuestionsFlat = useMemo(() => {
        if (!viewerTemplate) return [];
        return getTemplateQuestionsFlat(viewerTemplate);
    }, [viewerTemplate]);

    const viewerResponse = useMemo(() => {
        if (!viewerResponseId) return null;
        const r = allResponses.find((x) => x.id === viewerResponseId) || null;
        return r;
    }, [allResponses, viewerResponseId]);

    const viewerResponseListForTemplate = useMemo(() => {
        if (!viewerTemplateId) return [];
        return responsesByTemplateId.get(viewerTemplateId) || [];
    }, [responsesByTemplateId, viewerTemplateId]);

    const mappedViewerRows = useMemo(() => {
        const r = viewerResponse;
        if (!r) return [];

        const raw = r.raw_response_json && typeof r.raw_response_json === "object" ? r.raw_response_json : {};
        const entries = Object.entries(raw);

        // If we have template questions, map by question_id to question_text
        if (viewerMode === "other" && viewerQuestionsFlat.length) {
            const qMap = new Map(viewerQuestionsFlat.map((q) => [String(q.question_id), q]));
            return entries.map(([qid, val]) => {
                const q = qMap.get(String(qid));
                return {
                    sectionName: q?.sectionName || null,
                    label: q?.question_text || `Question ${qid}`,
                    value: safeText(val),
                    qid: String(qid),
                };
            });
        }

        // LSI-R: if raw exists, show it; otherwise fallback later
        if (viewerMode === "lsir") {
            return entries.map(([qid, val]) => ({
                sectionName: null,
                label: `Question ${qid}`,
                value: safeText(val),
                qid: String(qid),
            }));
        }

        // fallback
        return entries.map(([qid, val]) => ({
            sectionName: null,
            label: `Question ${qid}`,
            value: safeText(val),
            qid: String(qid),
        }));
    }, [viewerResponse, viewerQuestionsFlat, viewerMode]);

    const groupedViewerRows = useMemo(() => {
        // Group by sectionName for nicer display
        const rows = mappedViewerRows || [];
        const groups = new Map();
        rows.forEach((r) => {
            const k = r.sectionName || "";
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(r);
        });
        return Array.from(groups.entries()).map(([sectionName, items]) => ({ sectionName, items }));
    }, [mappedViewerRows]);

    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-4">
                <h3 className="text-lg font-semibold text-white">Surveys</h3>
                {isSyncing ? (
                    <Badge className="bg-slate-700/50 text-slate-300 mt-1">Syncing...</Badge>
                ) : null}
            </div>

            <Tabs value={surveyTab} onValueChange={setSurveyTab} className="mb-6">
                <TabsList className="bg-slate-800/50">
                    <TabsTrigger value="lsir" className="data-[state=active]:bg-blue-600">
                        LSI-R
                    </TabsTrigger>
                    <TabsTrigger value="other" className="data-[state=active]:bg-violet-600">
                        Other Surveys
                    </TabsTrigger>
                </TabsList>

                {/* ---------------- LSI-R TAB ---------------- */}
                <TabsContent value="lsir" className="mt-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="text-sm text-slate-400">Survey Progress</div>
                            <div className="text-lg font-semibold text-white">LSI-R Sections</div>
                        </div>

                        {!hideCompleteSectionButton && (
                            <Link to={createPageUrl(`SurveyForm?participant_id=${participantId}${surveyUrlSuffix}`)}>
                                <Button className="bg-blue-600 hover:bg-blue-700">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Complete Section
                                </Button>
                            </Link>
                        )}
                    </div>

                    <Tabs value={assessmentType} onValueChange={setAssessmentType} className="mb-6">
                        <TabsList className="bg-slate-800/50">
                            <TabsTrigger value="intake" className="data-[state=active]:bg-blue-600">
                                Initial Assessment
                            </TabsTrigger>
                            <TabsTrigger value="exit" className="data-[state=active]:bg-violet-600">
                                Exit Assessment
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h4 className="font-semibold text-white">
                                    {assessmentType === "exit" ? "Exit" : "Initial"} Assessment Completion
                                </h4>
                                <p className="text-sm text-slate-400">
                                    {completedSectionIds.size} of {SURVEY_SECTIONS.length} sections completed
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-3xl font-bold text-white">{overallProgress}%</span>
                                {completedSectionIds.size > 0 && (
                                    <p className="text-sm text-slate-400">
                                        Score: {totalScore}/{totalMaxPoints}
                                    </p>
                                )}
                            </div>
                        </div>
                        <Progress value={overallProgress} className="h-3 bg-slate-800" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                        {SURVEY_SECTIONS.map((section) => {
                            const completedSurvey = lsirResponses.find((s) => s.section_id === section.section_id);
                            const isCompleted = !!completedSurvey;

                            return (
                                <div
                                    key={section.section_id}
                                    className={`p-4 rounded-xl border ${isCompleted
                                            ? "bg-emerald-500/5 border-emerald-500/20"
                                            : "bg-slate-900/50 border-slate-800"
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {isCompleted ? (
                                                <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                                            ) : (
                                                <Circle className="h-5 w-5 text-slate-500 flex-shrink-0" />
                                            )}
                                            <div className="min-w-0">
                                                <h4 className={`font-medium ${isCompleted ? "text-emerald-400" : "text-white"}`}>
                                                    {section.section_name}
                                                </h4>
                                                {isCompleted && completedSurvey && (
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <Badge variant="outline" className={riskColors[completedSurvey.overall_risk_band]}>
                                                            {completedSurvey.overall_risk_band}
                                                        </Badge>
                                                        <span className="text-xs text-slate-400">
                                                            {completedSurvey.overall_score}/{section.max_points} pts
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {!isCompleted ? (
                                                <Link
                                                    to={createPageUrl(
                                                        `SurveyForm?participant_id=${participantId}&section=${section.section_id}${surveyUrlSuffix}`
                                                    )}
                                                >
                                                    <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">
                                                        Start
                                                    </Button>
                                                </Link>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-slate-700 text-slate-200"
                                                    type="button"
                                                    onClick={() => openLsirSectionResults(section.section_id)}
                                                >
                                                    <Eye className="h-4 w-4 mr-2" />
                                                    View
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {isCompleted && completedSurvey?.completed_date && (
                                        <p className="text-xs text-slate-500 mt-2 ml-8">
                                            Completed {format(new Date(completedSurvey.completed_date), "MMM d, yyyy")}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {lsirResponses.filter((s) => s.section_id).length === 0 && (
                        <EmptyState
                            icon={ClipboardList}
                            title={`No ${assessmentType === "exit" ? "exit" : "initial"} survey sections completed`}
                            description={`Start completing ${assessmentType === "exit" ? "exit" : "initial"} survey sections for this participant`}
                            actionLabel="Start Survey"
                            onAction={() =>
                                (window.location.href = createPageUrl(`SurveyForm?participant_id=${participantId}${surveyUrlSuffix}`))
                            }
                        />
                    )}
                </TabsContent>

                {/* ---------------- OTHER SURVEYS TAB ---------------- */}
                <TabsContent value="other" className="mt-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="text-sm text-slate-400">Templates</div>
                            <div className="text-lg font-semibold text-white">Other Surveys</div>
                        </div>
                        <Badge className="bg-slate-700/50 text-slate-300">Templates: {otherTemplates.length}</Badge>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {otherTemplates.map((t) => {
                            const templateId = t.id || t.survey_template_id;
                            const templateName =
                                t.template_name ||
                                t.survey_template_name ||
                                t.name ||
                                "Survey Template";
                            const templateDesc = t.description || t.template_description || "";

                            const completed = (templateId && responsesByTemplateId.get(templateId)) || [];
                            const last = completed[0];

                            return (
                                <div
                                    key={templateId || templateName}
                                    className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/20">Survey</Badge>
                                                <Badge className="bg-slate-700/50 text-slate-300">Completed: {completed.length}</Badge>
                                            </div>

                                            <h4 className="text-white font-semibold text-base truncate">{templateName}</h4>

                                            {templateDesc ? (
                                                <p className="text-sm text-slate-400 mt-2 line-clamp-2">{templateDesc}</p>
                                            ) : (
                                                <p className="text-sm text-slate-500 mt-2">No description provided</p>
                                            )}

                                            {last?.completed_date || last?.created_date ? (
                                                <p className="text-xs text-slate-500 mt-3">
                                                    Last completed{" "}
                                                    {format(new Date(last.completed_date || last.created_date), "MMM d, yyyy")}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-slate-600 mt-3">Not completed yet</p>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-2 shrink-0">
                                            {completed.length > 0 ? (
                                                <Button
                                                    onClick={() => openOtherResults(templateId)}
                                                    variant="outline"
                                                    className="border-slate-700 text-slate-200"
                                                    disabled={!templateId}
                                                    type="button"
                                                >
                                                    <Eye className="h-4 w-4 mr-2" />
                                                    View Results
                                                </Button>
                                            ) : null}

                                            <Button
                                                onClick={() => openOtherSurvey(templateId)}
                                                className="bg-blue-600 hover:bg-blue-700"
                                                disabled={!templateId}
                                                type="button"
                                            >
                                                <FileText className="h-4 w-4 mr-2" />
                                                {completed.length > 0 ? "Complete Again" : "Start"}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {otherTemplates.length === 0 && (
                            <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-10 text-center text-slate-500 lg:col-span-2">
                                No custom survey templates found (SurveyBuilder).
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Viewer Dialog */}
            <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white">{viewerTitle || "Survey Results"}</DialogTitle>
                    </DialogHeader>

                    {!viewerResponse ? (
                        <div className="text-sm text-slate-400">No response selected.</div>
                    ) : (
                        <div className="space-y-4 mt-2">
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                <span>
                                    Completed:{" "}
                                    {viewerResponse.completed_date || viewerResponse.created_date
                                        ? format(
                                            new Date(viewerResponse.completed_date || viewerResponse.created_date),
                                            "MMM d, yyyy"
                                        )
                                        : "Unknown"}
                                </span>
                                {viewerResponse.completed_by_name ? (
                                    <span>By: {safeText(viewerResponse.completed_by_name)}</span>
                                ) : null}
                                {viewerMode === "lsir" && viewerSectionId ? (
                                    <span>Section: {viewerSectionId}</span>
                                ) : null}
                            </div>

                            {viewerMode === "other" && viewerResponseListForTemplate.length > 1 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-slate-300">Select completed instance</Label>
                                        <Select
                                            value={viewerResponseId}
                                            onValueChange={(v) => setViewerResponseId(v)}
                                        >
                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                                <SelectValue placeholder="Select response" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                                {viewerResponseListForTemplate.map((r) => {
                                                    const d = r.completed_date || r.created_date;
                                                    const label = d ? format(new Date(d), "MMM d, yyyy") : (r.id || "Response");
                                                    return (
                                                        <SelectItem key={r.id} value={r.id}>
                                                            {label}
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            ) : null}

                            {/* LSI-R summary (fallback if no raw_response_json) */}
                            {viewerMode === "lsir" ? (
                                <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-white font-semibold">Section Summary</div>
                                        {viewerResponse.overall_risk_band ? (
                                            <Badge variant="outline" className={riskColors[viewerResponse.overall_risk_band]}>
                                                {viewerResponse.overall_risk_band}
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <div className="text-sm text-slate-300 mt-2">
                                        Score: {viewerResponse.overall_score ?? "—"}
                                    </div>
                                    {!viewerResponse.raw_response_json ? (
                                        <div className="text-xs text-slate-500 mt-2">
                                            Detailed question answers were not stored for this section (raw_response_json missing). This view shows the saved score and band only.
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {/* Responses */}
                            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                                <div className="text-white font-semibold mb-3">Responses</div>

                                {mappedViewerRows.length === 0 ? (
                                    <div className="text-sm text-slate-400">No responses found on this record.</div>
                                ) : (
                                    <div className="space-y-4">
                                        {groupedViewerRows.map((g) => (
                                            <div key={g.sectionName || "default"} className="space-y-2">
                                                {g.sectionName ? (
                                                    <div className="text-xs text-slate-500">{g.sectionName}</div>
                                                ) : null}

                                                <div className="space-y-2">
                                                    {g.items.map((row) => (
                                                        <div
                                                            key={row.qid}
                                                            className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                                                        >
                                                            <div className="text-sm text-white font-medium">
                                                                {row.label}
                                                            </div>
                                                            <div className="text-sm text-slate-300 mt-2 whitespace-pre-wrap">
                                                                {row.value || "—"}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
