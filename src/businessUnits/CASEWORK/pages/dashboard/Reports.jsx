// Reports.jsx (PART 1/4)
// src/pages/Reports.jsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import {
    FileText,
    Download,
    BarChart3,
    Target,
    Users,
    Briefcase,
    GraduationCap,
    DollarSign,
    PieChart,
    ClipboardList,
    Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart as RechartsPie,
    Pie,
    Cell,
} from "recharts";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
const CHART_TEXT = "#ffffff";

const TOOLTIP_STYLE = {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: CHART_TEXT,
};
const TOOLTIP_LABEL_STYLE = { color: CHART_TEXT };
const TOOLTIP_ITEM_STYLE = { color: CHART_TEXT };

function PieLabelWhite(props) {
    const { x, y, name, value, textAnchor } = props;
    return (
        <text
            x={x}
            y={y}
            fill={CHART_TEXT}
            textAnchor={textAnchor}
            dominantBaseline="central"
            fontSize={12}
        >
            {`${name}: ${value}`}
        </text>
    );
}

function toMs(d) {
    if (!d) return null;

    if (d instanceof Date) {
        const t = d.getTime();
        return Number.isFinite(t) ? t : null;
    }

    if (typeof d === "number") {
        const t = new Date(d).getTime();
        return Number.isFinite(t) ? t : null;
    }

    const s = String(d).trim();
    if (!s) return null;

    // If it's "yyyy-MM-dd", force local midnight to avoid timezone shifts.
    const isYmd = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const dt = isYmd ? new Date(`${s}T00:00:00`) : new Date(s);
    const t = dt.getTime();
    return Number.isFinite(t) ? t : null;
}

function inRangeMs(valueMs, startMs, endMs) {
    if (valueMs === null) return true;
    if (startMs !== null && valueMs < startMs) return false;
    if (endMs !== null && valueMs > endMs) return false;
    return true;
}

const riskBadgeClass = (risk) => {
    const r = String(risk || "").toLowerCase();
    if (r.includes("very")) return "bg-red-500/10 text-red-400 border border-red-500/20";
    if (r.includes("high")) return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
    if (r.includes("moderate")) return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
    if (r.includes("low")) return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    return "bg-slate-500/10 text-slate-300 border border-slate-500/20";
};

function safeString(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

function normalize(s) {
    return String(s || "").trim().toLowerCase();
}

// Robust LSIR template detection
function isLSIRTemplateName(name) {
    const n = normalize(name);
    return n.includes("lsi-r") || n.includes("lsir") || (n.includes("lsi") && n.includes("risk"));
}

function extractAnswers(sr) {
    // 1) sr.answers: [{ question_id, question_text, value }, ...]
    if (Array.isArray(sr?.answers) && sr.answers.length) {
        return sr.answers.map((a, idx) => ({
            key: a.question_id || a.questionId || a.id || `q_${idx + 1}`,
            label: a.question_text || a.questionText || a.label || a.key || `Question ${idx + 1}`,
            value: a.value ?? a.answer ?? a.response ?? "",
        }));
    }

    // 2) sr.responses: { [questionId]: value, ... }
    if (sr?.responses && typeof sr.responses === "object" && !Array.isArray(sr.responses)) {
        return Object.entries(sr.responses).map(([k, v]) => ({ key: k, label: k, value: v }));
    }

    // 3) sr.raw_response_json: { [questionKey]: value, ... }
    if (
        sr?.raw_response_json &&
        typeof sr.raw_response_json === "object" &&
        !Array.isArray(sr.raw_response_json)
    ) {
        return Object.entries(sr.raw_response_json).map(([k, v]) => ({ key: k, label: k, value: v }));
    }

    // 4) sr.response_json / payload / data
    const candidate = sr?.response_json || sr?.payload || sr?.data;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        return Object.entries(candidate).map(([k, v]) => ({ key: k, label: k, value: v }));
    }

    return [];
}

function isNumericLike(v) {
    if (v === null || v === undefined || v === "") return false;
    const n = Number(v);
    return Number.isFinite(n);
}

function formatDateMaybe(d) {
    if (!d) return "";
    try {
        return format(new Date(d), "yyyy-MM-dd");
    } catch {
        return String(d);
    }
}

/* -------------------- template label mapping helpers -------------------- */
function buildQuestionLabelMapFromTemplate(template) {
    const map = new Map();
    if (!template) return map;

    const questions =
        template.questions ||
        template.items ||
        template.fields ||
        template.schema?.questions ||
        template.schema?.items ||
        [];

    if (!Array.isArray(questions)) return map;

    for (const q of questions) {
        if (!q || typeof q !== "object") continue;

        const id = q.id || q.question_id || q.questionId;
        const key = q.key || q.field_key || q.fieldKey || q.slug;
        const label =
            q.label ||
            q.question_text ||
            q.questionText ||
            q.text ||
            q.title ||
            (id ? String(id) : null) ||
            (key ? String(key) : null);

        if (id && label) map.set(String(id), String(label));
        if (key && label) map.set(String(key), String(label));
    }

    return map;
}

function prettifyQuestionKey(k) {
    const s = String(k || "");
    if (s.startsWith("q_")) return `Question ${s.replace("q_", "")}`;
    return s.replace(/_/g, " ");
}

function mergeLabelMapsPreferLonger(targetMap, sourceMap) {
    for (const [k, v] of sourceMap.entries()) {
        const key = String(k);
        const next = String(v || "");
        if (!next) continue;

        const current = targetMap.get(key);
        if (!current) {
            targetMap.set(key, next);
            continue;
        }
        if (String(next).length > String(current).length) targetMap.set(key, next);
    }
}
/* ---------------------------------------------------------------------- */
// Reports.jsx (PART 2/4)
export default function Reports() {
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
        end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    });
    const [programFilter, setProgramFilter] = useState("all");

    // Survey reporting state
    const [surveyMode, setSurveyMode] = useState("lsir"); // lsir | other
    const [lsirAggMode, setLsirAggMode] = useState("domain"); // domain | questions
    const [otherSurveyTemplateId, setOtherSurveyTemplateId] = useState("all");
    const [otherViewMode, setOtherViewMode] = useState("bySurvey"); // bySurvey | byParticipant
    const [selectedOtherParticipantId, setSelectedOtherParticipantId] = useState("all");

    const [responseViewerOpen, setResponseViewerOpen] = useState(false);
    const [activeResponse, setActiveResponse] = useState(null);

    // ✅ rangeStartMs/rangeEndMs declared BEFORE any use
    const rangeStartMs = useMemo(() => (dateRange.start ? toMs(dateRange.start) : null), [dateRange.start]);
    const rangeEndMs = useMemo(() => (dateRange.end ? toMs(dateRange.end) : null), [dateRange.end]);

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 1000),
    });

    const { data: programs = [] } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list(),
    });

    const { data: caseNotes = [] } = useQuery({
        queryKey: ["caseNotes"],
        queryFn: () => base44.entities.CaseNote.list("-created_date", 1000),
    });

    const { data: employments = [] } = useQuery({
        queryKey: ["employments"],
        queryFn: () => base44.entities.EmploymentPlacement.list("-created_date", 500),
    });

    const { data: trainings = [] } = useQuery({
        queryKey: ["trainings"],
        queryFn: () => base44.entities.ParticipantTraining.list("-created_date", 500),
    });

    const { data: funding = [] } = useQuery({
        queryKey: ["funding"],
        queryFn: () => base44.entities.FundingRecord.list("-created_date", 500),
    });

    const { data: enrollments = [] } = useQuery({
        queryKey: ["enrollments"],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.list(),
    });

    const { data: surveyResponses = [] } = useQuery({
        queryKey: ["surveyResponsesAll"],
        queryFn: () => base44.entities.SurveyResponse.list("-created_date", 5000),
    });

    const { data: surveyTemplates = [] } = useQuery({
        queryKey: ["surveyTemplatesAll"],
        queryFn: () => base44.entities.SurveyTemplate.list("-created_date", 500),
    });

    const isLoading = loadingParticipants;

    const participantsById = useMemo(() => {
        const m = new Map();
        for (const p of participants || []) m.set(p.id, p);
        return m;
    }, [participants]);

    const enrollmentsByProgramId = useMemo(() => {
        const m = new Map();
        for (const e of enrollments || []) {
            if (!e?.program_id) continue;
            if (!m.has(e.program_id)) m.set(e.program_id, []);
            m.get(e.program_id).push(e);
        }
        return m;
    }, [enrollments]);

    const filteredParticipantIds = useMemo(() => {
        if (programFilter === "all") return null;
        return (enrollments || [])
            .filter((e) => e.program_id === programFilter)
            .map((e) => e.participant_id);
    }, [programFilter, enrollments]);

    const filteredParticipants = useMemo(() => {
        return programFilter === "all"
            ? participants
            : (participants || []).filter((p) => filteredParticipantIds?.includes(p.id));
    }, [participants, programFilter, filteredParticipantIds]);

    const filterByDateAndProgram = useCallback(
        (items, dateField) => {
            return (items || []).filter((item) => {
                const itemDateMs = toMs(item?.[dateField]);
                if (!inRangeMs(itemDateMs, rangeStartMs, rangeEndMs)) return false;

                if (programFilter !== "all") {
                    if (item?.program_id && item.program_id !== programFilter) return false;

                    if (
                        Array.isArray(item?.linked_program_ids) &&
                        !item.linked_program_ids.includes(programFilter)
                    ) {
                        return false;
                    }
                }

                return true;
            });
        },
        [programFilter, rangeStartMs, rangeEndMs]
    );

    // ✅ define these (your JSX references them)
    const filteredCaseNotes = useMemo(() => {
        // for case notes, pick best date field
        const withDate = (caseNotes || []).map((n) => ({
            ...n,
            __date: n.interaction_date || n.created_date || null,
        }));
        return filterByDateAndProgram(withDate, "__date");
    }, [caseNotes, filterByDateAndProgram]);

    const filteredEmployments = useMemo(() => {
        const base =
            programFilter === "all"
                ? employments
                : (employments || []).filter((e) => filteredParticipantIds?.includes(e.participant_id));
        return filterByDateAndProgram(base, "start_date");
    }, [employments, programFilter, filteredParticipantIds, filterByDateAndProgram]);

    const filteredTrainings = useMemo(() => {
        const base =
            programFilter === "all"
                ? trainings
                : (trainings || []).filter((t) => filteredParticipantIds?.includes(t.participant_id));
        // fallback to completion_date if needed handled in charts later
        return filterByDateAndProgram(base, "enrollment_date");
    }, [trainings, programFilter, filteredParticipantIds, filterByDateAndProgram]);

    const filteredFunding = useMemo(() => {
        const withDate = (funding || []).map((f) => ({
            ...f,
            __date: f.funding_date || f.created_date || null,
        }));
        return filterByDateAndProgram(withDate, "__date");
    }, [funding, filterByDateAndProgram]);

    const programAnalyticsRows = useMemo(() => {
        const start = dateRange.start || null;
        const end = dateRange.end || null;

        const inRange = (d) => {
            if (!d) return true;
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        };

        const programsToReport =
            programFilter === "all"
                ? programs || []
                : (programs || []).filter((p) => p.id === programFilter);

        return programsToReport.map((program) => {
            const pid = program.id;
            const enrolls = enrollmentsByProgramId.get(pid) || [];
            const enrolledIds = Array.from(new Set(enrolls.map((e) => e.participant_id).filter(Boolean)));

            const enrolledParticipants = enrolledIds
                .map((id) => participantsById.get(id))
                .filter(Boolean);

            const genderCounts = enrolledParticipants.reduce(
                (acc, p) => {
                    const g = String(p.gender || "").trim();
                    if (g === "Male") acc.male += 1;
                    else if (g === "Female") acc.female += 1;
                    else if (g === "Non-binary") acc.nonBinary += 1;
                    else if (g === "Other") acc.other += 1;
                    else if (g === "Prefer not to say") acc.preferNot += 1;
                    else acc.unknown += 1;
                    return acc;
                },
                { male: 0, female: 0, nonBinary: 0, other: 0, preferNot: 0, unknown: 0 }
            );

            const employmentsInRange = (employments || []).filter(
                (e) => e.program_id === pid && inRange(e.start_date)
            );

            const employmentsTotal = employmentsInRange.length;

            const employmentsActive = employmentsInRange.filter(
                (e) => String(e.status || "").trim() === "Active"
            ).length;

            const employmentsMilestone4w = employmentsInRange.filter((e) => Boolean(e.week_4_milestone)).length;
            const employmentsMilestone13w = employmentsInRange.filter((e) => Boolean(e.week_13_milestone)).length;
            const employmentsMilestone26w = employmentsInRange.filter((e) => Boolean(e.week_26_milestone)).length;

            const trainingsTotal = (trainings || []).filter(
                (t) => t.program_id === pid && inRange(t.enrollment_date)
            ).length;

            const trainingsCompleted = (trainings || []).filter(
                (t) =>
                    t.program_id === pid &&
                    inRange(t.completion_date || t.enrollment_date) &&
                    String(t.outcome || "").toLowerCase() === "completed"
            ).length;

            const surveysCompleted = (surveyResponses || []).filter(
                (sr) => sr.program_id === pid && inRange(sr.completed_date || sr.created_date)
            ).length;

            const caseNotesCount = (caseNotes || []).filter((n) => {
                const d = n.interaction_date || n.created_date;
                if (!inRange(d)) return false;
                return Array.isArray(n.linked_program_ids) && n.linked_program_ids.includes(pid);
            }).length;

            const fundingTotal = (funding || [])
                .filter((f) => {
                    const d = f.funding_date || f.created_date;
                    if (!inRange(d)) return false;
                    return Array.isArray(f.linked_program_ids) && f.linked_program_ids.includes(pid);
                })
                .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

            const dexHubCounts = {};
            if (program.dex_reporting_required) {
                for (const e of enrolls) {
                    const hub = String(e.dex_case_location || "").trim();
                    if (!hub) continue;
                    dexHubCounts[hub] = (dexHubCounts[hub] || 0) + 1;
                }
            }

            const topHubs = Object.entries(dexHubCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([hub, count]) => `${hub} (${count})`)
                .join("; ");

            return {
                Program: program.program_name || "",
                "Program ID": pid,
                "DEX Reportable": program.dex_reporting_required ? "Yes" : "No",
                "Participants Enrolled": enrolledIds.length,
                Male: genderCounts.male,
                Female: genderCounts.female,
                "Non-binary": genderCounts.nonBinary,
                Other: genderCounts.other,
                "Prefer not to say": genderCounts.preferNot,
                Unknown: genderCounts.unknown,
                "Employments (All)": employmentsTotal,
                "Employments (Active)": employmentsActive,
                "Employments (4w Milestone)": employmentsMilestone4w,
                "Employments (13w Milestone)": employmentsMilestone13w,
                "Employments (26w Milestone)": employmentsMilestone26w,
                Trainings: trainingsTotal,
                "Trainings Completed": trainingsCompleted,
                "Surveys Completed": surveysCompleted,
                "Case Notes": caseNotesCount,
                "Funding Total": fundingTotal,
                "Top Hubs": topHubs,
            };
        });
    }, [
        programs,
        programFilter,
        dateRange.start,
        dateRange.end,
        enrollmentsByProgramId,
        participantsById,
        employments,
        trainings,
        surveyResponses,
        caseNotes,
        funding,
    ]);

    const programHubChartData = useMemo(() => {
        const start = dateRange.start || null;
        const end = dateRange.end || null;
        const inRange = (d) => {
            if (!d) return true;
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        };

        const programsToReport =
            programFilter === "all"
                ? programs || []
                : (programs || []).filter((p) => p.id === programFilter);

        const hubs = new Map();
        for (const program of programsToReport) {
            if (!program?.dex_reporting_required) continue;
            const enrolls = enrollmentsByProgramId.get(program.id) || [];
            for (const e of enrolls) {
                const d = e.created_date || e.enrollment_date;
                if (!inRange(d)) continue;
                const hub = String(e.dex_case_location || "").trim();
                if (!hub) continue;
                hubs.set(hub, (hubs.get(hub) || 0) + 1);
            }
        }

        return Array.from(hubs.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([hub, count]) => ({ hub, count }));
    }, [programs, programFilter, dateRange.start, dateRange.end, enrollmentsByProgramId]);
    // Reports.jsx (PART 3/4)
    const filteredSurveyResponses = useMemo(() => {
        const byProgram =
            programFilter === "all"
                ? surveyResponses || []
                : (surveyResponses || []).filter((sr) => filteredParticipantIds?.includes(sr.participant_id));

        return byProgram.filter((sr) => {
            const d = sr.completed_date || sr.created_date;
            const ms = toMs(d);
            return inRangeMs(ms, rangeStartMs, rangeEndMs);
        });
    }, [surveyResponses, programFilter, filteredParticipantIds, rangeStartMs, rangeEndMs]);

    const lsirTemplateIdSet = useMemo(() => {
        const set = new Set();
        for (const t of surveyTemplates || []) {
            const name = t.name || t.survey_template_name || "";
            if (t.is_lsir === true || isLSIRTemplateName(name)) {
                if (t.id) set.add(t.id);
            }
        }
        return set;
    }, [surveyTemplates]);

    const isLsirResponse = useCallback(
        (sr) => {
            if (!sr) return false;
            if (sr.is_lsir === true) return true;

            const tid = sr.survey_template_id || sr.template_id;
            if (tid && lsirTemplateIdSet.has(tid)) return true;

            const name = sr.survey_template_name || sr.template_name || "";
            if (name && isLSIRTemplateName(name)) return true;

            return false;
        },
        [lsirTemplateIdSet]
    );

    const lsirResponses = useMemo(() => {
        return (filteredSurveyResponses || []).filter((sr) => isLsirResponse(sr));
    }, [filteredSurveyResponses, isLsirResponse]);

    const otherResponses = useMemo(() => {
        return (filteredSurveyResponses || []).filter((sr) => !isLsirResponse(sr));
    }, [filteredSurveyResponses, isLsirResponse]);

    // ✅ otherTemplates excludes LSIR (templates + responses)
    const otherTemplates = useMemo(() => {
        const templateMap = new Map();

        // From templates: exclude LSIR by template flags/name
        for (const t of surveyTemplates || []) {
            const id = t.id;
            const name = t.name || t.survey_template_name || "Unnamed Survey";
            const lsir = t.is_lsir === true || isLSIRTemplateName(name) || (id && lsirTemplateIdSet.has(id));
            if (lsir) continue;
            templateMap.set(id, { id, name });
        }

        // From responses: exclude LSIR by classifier
        for (const sr of otherResponses || []) {
            const id =
                sr.survey_template_id ||
                sr.template_id ||
                sr.survey_template_name ||
                "unknown_template";
            const name = sr.survey_template_name || sr.template_name || "Unknown Survey";
            if (!templateMap.has(id)) templateMap.set(id, { id, name });
        }

        return Array.from(templateMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [surveyTemplates, otherResponses, lsirTemplateIdSet]);

    const otherResponsesByParticipant = useMemo(() => {
        const map = new Map();
        for (const sr of otherResponses || []) {
            const pid = sr.participant_id || "unknown";
            if (!map.has(pid)) map.set(pid, []);
            map.get(pid).push(sr);
        }
        for (const [k, arr] of map.entries()) {
            arr.sort((a, b) => {
                const da = a.completed_date || a.created_date || "";
                const db = b.completed_date || b.created_date || "";
                return String(db).localeCompare(String(da));
            });
            map.set(k, arr);
        }
        return map;
    }, [otherResponses]);

    const otherParticipantsWithResponses = useMemo(() => {
        const ids = Array.from(otherResponsesByParticipant.keys()).filter((id) => id && id !== "unknown");
        return ids
            .map((pid) => {
                const p = participantsById.get(pid);
                const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "Unknown";
                return { pid, name };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [otherResponsesByParticipant, participantsById]);

    const globalLsirLabelMap = useMemo(() => {
        const merged = new Map();
        for (const t of surveyTemplates || []) {
            const name = t.name || t.survey_template_name || "";
            const isLsir = t.is_lsir === true || isLSIRTemplateName(name);
            if (!isLsir) continue;
            mergeLabelMapsPreferLonger(merged, buildQuestionLabelMapFromTemplate(t));
        }
        return merged;
    }, [surveyTemplates]);

    useEffect(() => {
        if (surveyMode !== "other") return;
        if (otherSurveyTemplateId === "all") return;
        const ok = otherTemplates.some((t) => t.id === otherSurveyTemplateId);
        if (!ok) setOtherSurveyTemplateId("all");
    }, [surveyMode, otherTemplates, otherSurveyTemplateId]);

    useEffect(() => {
        if (surveyMode !== "other") return;
        if (otherViewMode !== "byParticipant") return;
        if (selectedOtherParticipantId === "all") return;
        const ok = (otherParticipantsWithResponses || []).some((x) => x.pid === selectedOtherParticipantId);
        if (!ok) setSelectedOtherParticipantId("all");
    }, [surveyMode, otherViewMode, selectedOtherParticipantId, otherParticipantsWithResponses]);

    const phaseData = Object.entries(
        (filteredParticipants || []).reduce((acc, p) => {
            const key = p.current_phase || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value }));

    const statusData = Object.entries(
        (filteredParticipants || []).reduce((acc, p) => {
            const key = p.status || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value }));

    const caseNotesByType = Object.entries(
        (filteredCaseNotes || []).reduce((acc, n) => {
            const key = n.note_type || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value }));

    const employmentByStatus = Object.entries(
        (filteredEmployments || []).reduce((acc, e) => {
            const key = e.status || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value }));

    const trainingByOutcome = Object.entries(
        (filteredTrainings || []).reduce((acc, t) => {
            const key = t.outcome || "Unknown";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({ name, value }));

    const fundingByCategory = Object.entries(
        (filteredFunding || [])
            .filter((f) => f.record_type === "Expense")
            .reduce((acc, f) => {
                const key = f.category || "Uncategorised";
                acc[key] = (acc[key] || 0) + (Number(f.amount) || 0);
                return acc;
            }, {})
    ).map(([name, value]) => ({ name, value }));

    const lsirDomainSummary = useMemo(() => {
        const domains = new Map();

        for (const sr of lsirResponses || []) {
            const domain =
                sr.domain_name ||
                sr.section_name ||
                sr.section_id ||
                sr.domain ||
                "Unknown Domain";

            if (!domains.has(domain)) {
                domains.set(domain, {
                    domain,
                    count: 0,
                    scoreSum: 0,
                    scoreCount: 0,
                    riskCounts: {},
                });
            }
            const row = domains.get(domain);
            row.count += 1;

            if (sr.overall_score !== null && sr.overall_score !== undefined && sr.overall_score !== "") {
                const n = Number(sr.overall_score);
                if (Number.isFinite(n)) {
                    row.scoreSum += n;
                    row.scoreCount += 1;
                }
            }

            const risk = sr.overall_risk_band || "Unknown";
            row.riskCounts[risk] = (row.riskCounts[risk] || 0) + 1;
        }

        const out = Array.from(domains.values()).map((d) => ({
            domain: d.domain,
            count: d.count,
            avgScore: d.scoreCount ? Math.round((d.scoreSum / d.scoreCount) * 10) / 10 : "",
            riskCounts: d.riskCounts,
        }));

        out.sort((a, b) => String(a.domain || "").localeCompare(String(b.domain || "")));
        return out;
    }, [lsirResponses]);

    const lsirQuestionAggregate = useMemo(() => {
        const templateById = new Map();
        const templateByName = new Map();

        for (const t of surveyTemplates || []) {
            const name = (t.name || t.survey_template_name || "").trim();
            const isLsir = t.is_lsir === true || isLSIRTemplateName(name);
            if (!isLsir) continue;

            if (t.id) templateById.set(t.id, t);
            if (name) templateByName.set(name.toLowerCase(), t);
        }

        const agg = new Map();

        for (const sr of lsirResponses || []) {
            const tid = sr.survey_template_id || sr.template_id;
            const srName = (sr.survey_template_name || sr.template_name || "").trim().toLowerCase();

            const template = (tid && templateById.get(tid)) || (srName && templateByName.get(srName)) || null;
            const localLabelMap = buildQuestionLabelMapFromTemplate(template);

            const answers = extractAnswers(sr);
            if (!answers.length) continue;

            for (const a of answers) {
                const key = String(a.key || a.label || "");
                if (!key) continue;

                const mappedLocal = localLabelMap.get(key);
                const mappedGlobal = globalLsirLabelMap.get(key);
                const storedLabel = a.label && a.label !== a.key ? a.label : "";
                const questionText =
                    mappedLocal || mappedGlobal || storedLabel || prettifyQuestionKey(a.label || key);

                if (!agg.has(key)) {
                    agg.set(key, {
                        key,
                        questionText,
                        responses: 0,
                        numericSum: 0,
                        numericCount: 0,
                        valueCounts: new Map(),
                    });
                }

                const row = agg.get(key);

                if (questionText && String(questionText).length > String(row.questionText || "").length) {
                    row.questionText = questionText;
                }

                row.responses += 1;

                const v = a.value;
                if (isNumericLike(v)) {
                    row.numericSum += Number(v);
                    row.numericCount += 1;
                } else {
                    const sv = safeString(v) || "(blank)";
                    row.valueCounts.set(sv, (row.valueCounts.get(sv) || 0) + 1);
                }
            }
        }

        const rows = Array.from(agg.values()).map((r) => {
            const avgNumeric = r.numericCount ? Math.round((r.numericSum / r.numericCount) * 10) / 10 : "";
            const topValues = Array.from(r.valueCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([value, count]) => ({ value, count }));

            return {
                key: r.key,
                questionText: r.questionText,
                responses: r.responses,
                avgNumeric,
                topValues,
            };
        });

        rows.sort((a, b) => {
            const d = (b.responses || 0) - (a.responses || 0);
            if (d !== 0) return d;
            return String(a.questionText || "").localeCompare(String(b.questionText || ""));
        });

        return rows;
    }, [lsirResponses, surveyTemplates, globalLsirLabelMap]);

    const selectedOtherResponses = useMemo(() => {
        if (otherSurveyTemplateId === "all") return otherResponses || [];
        return (otherResponses || []).filter((sr) => {
            const tid = sr.survey_template_id || sr.template_id || sr.survey_template_name || "unknown_template";
            return tid === otherSurveyTemplateId;
        });
    }, [otherResponses, otherSurveyTemplateId]);

    const selectedOtherResponsesByParticipant = useMemo(() => {
        if (selectedOtherParticipantId === "all") return otherResponses || [];
        return otherResponsesByParticipant.get(selectedOtherParticipantId) || [];
    }, [otherResponses, otherResponsesByParticipant, selectedOtherParticipantId]);

    const selectedOtherTemplateName = useMemo(() => {
        if (otherSurveyTemplateId === "all") return "All Other Surveys";
        const t = otherTemplates.find((x) => x.id === otherSurveyTemplateId);
        return t?.name || "Selected Survey";
    }, [otherSurveyTemplateId, otherTemplates]);

    const participantExportRows = useMemo(() => {
        return (filteredParticipants || []).map((p) => ({
            id: p.id,
            first_name: p.first_name || "",
            last_name: p.last_name || "",
            full_name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
            status: p.status || "",
            current_phase: p.current_phase || "",
            gender: p.gender || "",
            dob: p.dob || "",
            mobile: p.mobile || "",
            email: p.email || "",
            created_date: p.created_date || "",
        }));
    }, [filteredParticipants]);

    const exportToCSV = (data, filename) => {
        if (!data || !data.length) return;
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(","),
            ...data.map((row) =>
                headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
            ),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}_${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportToPDFOrWord = (data, filename, fileType = "pdf") => {
        if (!data || !data.length) return;
        const headers = Object.keys(data[0]);
        const programName =
            programFilter !== "all"
                ? programs.find((p) => p.id === programFilter)?.program_name
                : "All Programs";

        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const html = `<!DOCTYPE html>
<html>
<head>
  <title>${filename} Report</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 40px;
      margin: 0;
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
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border-radius: 8px;
      overflow: hidden;
    }
    th {
      background: #334155;
      color: #f8fafc;
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      border-bottom: 2px solid #475569;
    }
    td {
      padding: 10px 16px;
      border-bottom: 1px solid #334155;
      color: #cbd5e1;
      font-size: 13px;
    }
    tr:nth-child(even) td { background: #0f172a; }
    .footer {
      margin-top: 24px;
      text-align: center;
      color: #64748b;
      font-size: 12px;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #3b82f6;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .print-btn:hover { background: #2563eb; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Save as ${fileType.toUpperCase()}</button>
  <div class="header">
    <h1>${String(filename).replace(/_/g, " ")} Report</h1>
    <p>Program: ${programName} | Date Range: ${dateRange.start} to ${dateRange.end} | Generated: ${format(
            new Date(),
            "MMMM d, yyyy"
        )}</p>
  </div>
  <table>
    <thead><tr>${headers.map((h) => `<th>${String(h).replace(/_/g, " ")}</th>`).join("")}</tr></thead>
    <tbody>
      ${data
                .map(
                    (row) => `<tr>${headers
                        .map((h) => `<td>${row[h] !== null && row[h] !== undefined ? row[h] : ""}</td>`)
                        .join("")}</tr>`
                )
                .join("")}
    </tbody>
  </table>
  <div class="footer"><p>${data.length} records | CaseFlow Reports</p></div>
</body>
</html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const openResponse = (sr) => {
        setActiveResponse(sr);
        setResponseViewerOpen(true);
    };

    // ✅ HOOKS must be BEFORE early return
    const activeTemplateResolved = useMemo(() => {
        const sr = activeResponse;
        if (!sr) return null;

        const id = sr.survey_template_id || sr.template_id;
        if (id) {
            const match = (surveyTemplates || []).find((t) => t.id === id);
            if (match) return match;
        }

        const srName = (sr.survey_template_name || sr.template_name || "").trim().toLowerCase();
        if (!srName) return null;

        const matchByName = (surveyTemplates || []).find((t) => {
            const tn = (t.name || t.survey_template_name || "").trim().toLowerCase();
            return tn && tn === srName;
        });

        return matchByName || null;
    }, [activeResponse, surveyTemplates]);

    const activeTemplate = activeTemplateResolved;

    const surveyExportRows = useMemo(() => {
        return (filteredSurveyResponses || []).map((sr) => {
            const p = participantsById.get(sr.participant_id);
            return {
                participant_name: p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "",
                survey_template_name: sr.survey_template_name || sr.template_name || "",
                section_name: sr.section_name || sr.section_id || "",
                overall_score: sr.overall_score ?? "",
                overall_risk_band: sr.overall_risk_band || "",
                completed_date: sr.completed_date || sr.created_date || "",
                is_lsir: isLsirResponse(sr) ? "Yes" : "No",
            };
        });
    }, [filteredSurveyResponses, participantsById, isLsirResponse]);
    // Reports.jsx (PART 4/4)
    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader title="Reports & Analytics" subtitle="View program performance and export data" />

            <Card className="bg-slate-900/50 border-slate-800 mb-6">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div>
                            <Label className="text-slate-300">From Date</Label>
                            <Input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white w-40"
                            />
                        </div>
                        <div>
                            <Label className="text-slate-300">To Date</Label>
                            <Input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                                className="bg-slate-800 border-slate-700 text-white w-40"
                            />
                        </div>
                        <div>
                            <Label className="text-slate-300">Program</Label>
                            <Select value={programFilter} onValueChange={setProgramFilter}>
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-48">
                                    <SelectValue placeholder="All Programs" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    <SelectItem value="all" className="text-white">
                                        All Programs
                                    </SelectItem>
                                    {programs.map((p) => (
                                        <SelectItem key={p.id} value={p.id} className="text-white">
                                            {p.program_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList className="bg-slate-900/50 border border-slate-800 p-1 flex flex-wrap gap-1">
                    <TabsTrigger value="overview" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="participants" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <Users className="h-4 w-4 mr-2" />
                        Participants
                    </TabsTrigger>
                    <TabsTrigger value="outcomes" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <Briefcase className="h-4 w-4 mr-2" />
                        Outcomes
                    </TabsTrigger>
                    <TabsTrigger value="programs" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <Target className="h-4 w-4 mr-2" />
                        Programs
                    </TabsTrigger>
                    <TabsTrigger value="surveys" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <ClipboardList className="h-4 w-4 mr-2" />
                        Survey Results
                    </TabsTrigger>
                    <TabsTrigger value="exports" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <Download className="h-4 w-4 mr-2" />
                        Export Data
                    </TabsTrigger>
                    <TabsTrigger value="lsir" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        LSI-R Analysis
                    </TabsTrigger>
                    <TabsTrigger value="custom" className="data-[state=active]:bg-slate-800 whitespace-nowrap">
                        <PieChart className="h-4 w-4 mr-2" />
                        Custom Reports
                    </TabsTrigger>
                </TabsList>

                {/* OVERVIEW */}
                <TabsContent value="overview">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Participants by Phase</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPie>
                                            <Pie
                                                data={phaseData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                dataKey="value"
                                                labelLine={false}
                                                label={<PieLabelWhite />}
                                            >
                                                {phaseData.map((_, index) => (
                                                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={TOOLTIP_STYLE}
                                                labelStyle={TOOLTIP_LABEL_STYLE}
                                                itemStyle={TOOLTIP_ITEM_STYLE}
                                            />
                                        </RechartsPie>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Case Notes by Type</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={caseNotesByType}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis dataKey="name" stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                                            <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Employment Outcomes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={employmentByStatus} layout="vertical">
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                            <XAxis type="number" stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                                            <YAxis type="category" dataKey="name" stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} width={80} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                            <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Spending by Category</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPie>
                                            <Pie
                                                data={fundingByCategory}
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={80}
                                                dataKey="value"
                                                labelLine={false}
                                                label={({ x, y, value, textAnchor }) => (
                                                    <text x={x} y={y} fill={CHART_TEXT} textAnchor={textAnchor} dominantBaseline="central" fontSize={12}>
                                                        {`$${Number(value || 0).toLocaleString()}`}
                                                    </text>
                                                )}
                                            >
                                                {fundingByCategory.map((_, index) => (
                                                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={TOOLTIP_STYLE}
                                                labelStyle={TOOLTIP_LABEL_STYLE}
                                                itemStyle={TOOLTIP_ITEM_STYLE}
                                                formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, "Amount"]}
                                            />
                                        </RechartsPie>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* PARTICIPANTS */}
                <TabsContent value="participants">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Participants by Status</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={statusData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis dataKey="name" stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                                            <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                            <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Training Outcomes</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPie>
                                            <Pie
                                                data={trainingByOutcome}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                dataKey="value"
                                                labelLine={false}
                                                label={<PieLabelWhite />}
                                            >
                                                {trainingByOutcome.map((_, index) => (
                                                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                        </RechartsPie>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* OUTCOMES */}
                <TabsContent value="outcomes">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-white">{filteredParticipants.length}</p>
                                <p className="text-sm text-slate-400">Total Participants</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-emerald-400">
                                    {filteredEmployments.filter((e) => e.status === "Sustained").length}
                                </p>
                                <p className="text-sm text-slate-400">Sustained Employment</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-blue-400">
                                    {filteredTrainings.filter((t) => t.outcome === "Completed").length}
                                </p>
                                <p className="text-sm text-slate-400">Training Completions</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardContent className="p-4 text-center">
                                <p className="text-3xl font-bold text-violet-400">{filteredCaseNotes.length}</p>
                                <p className="text-sm text-slate-400">Total Case Notes</p>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* PROGRAM ANALYTICS */}
                <TabsContent value="programs">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Program KPI Summary</CardTitle>
                                <p className="text-sm text-slate-400">
                                    KPI breakdown by program for the selected date range and program filter.
                                </p>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-slate-300">
                                            <tr className="border-b border-slate-800">
                                                {[
                                                    "Program",
                                                    "Participants Enrolled",
                                                    "Male",
                                                    "Female",
                                                    "Non-binary",
                                                    "Other",
                                                    "Prefer not to say",
                                                    "Unknown",
                                                    "Employments (All)",
                                                    "Employments (Active)",
                                                    "Employments (4w Milestone)",
                                                    "Employments (13w Milestone)",
                                                    "Employments (26w Milestone)",
                                                    "Trainings",
                                                    "Trainings Completed",
                                                    "Surveys Completed",
                                                    "Case Notes",
                                                    "Funding Total",
                                                ].map((h) => (
                                                    <th key={h} className="text-left py-2 pr-3 font-medium whitespace-nowrap">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>

                                        <tbody className="text-slate-200">
                                            {(programAnalyticsRows || []).map((r) => (
                                                <tr key={r["Program ID"]} className="border-b border-slate-800/60">
                                                    {[
                                                        "Program",
                                                        "Participants Enrolled",
                                                        "Male",
                                                        "Female",
                                                        "Non-binary",
                                                        "Other",
                                                        "Prefer not to say",
                                                        "Unknown",
                                                        "Employments (All)",
                                                        "Employments (Active)",
                                                        "Employments (4w Milestone)",
                                                        "Employments (13w Milestone)",
                                                        "Employments (26w Milestone)",
                                                        "Trainings",
                                                        "Trainings Completed",
                                                        "Surveys Completed",
                                                        "Case Notes",
                                                        "Funding Total",
                                                    ].map((k) => (
                                                        <td key={k} className="py-2 pr-3 whitespace-nowrap">
                                                            {k === "Funding Total"
                                                                ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
                                                                    Number(r[k] || 0)
                                                                )
                                                                : r[k]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}

                                            {!programAnalyticsRows?.length ? (
                                                <tr>
                                                    <td colSpan={18} className="py-6 text-center text-slate-400">
                                                        No program data available for the selected filters.
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">DEX Hub Breakdown</CardTitle>
                                <p className="text-sm text-slate-400">
                                    Hub counts for DEX-reportable program enrollments (selected range).
                                </p>
                            </CardHeader>
                            <CardContent className="h-80">
                                {programHubChartData?.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={programHubChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis
                                                dataKey="hub"
                                                stroke={CHART_TEXT}
                                                tick={{ fill: CHART_TEXT, fontSize: 11 }}
                                                interval={0}
                                                angle={-25}
                                                textAnchor="end"
                                                height={80}
                                            />
                                            <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                                        No hub data (ensure program is marked DEX reportable and enrollments have Hub).
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Employments by Program</CardTitle>
                            </CardHeader>
                            <CardContent className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={(programAnalyticsRows || []).map((r) => ({
                                            program: r["Program"],
                                            count: r["Employments (All)"],
                                        }))}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis
                                            dataKey="program"
                                            stroke={CHART_TEXT}
                                            tick={{ fill: CHART_TEXT, fontSize: 11 }}
                                            interval={0}
                                            angle={-25}
                                            textAnchor="end"
                                            height={80}
                                        />
                                        <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                        <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="bg-slate-900/50 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white text-lg">Trainings by Program</CardTitle>
                            </CardHeader>
                            <CardContent className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={(programAnalyticsRows || []).map((r) => ({
                                            program: r["Program"],
                                            count: r["Trainings"],
                                        }))}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis
                                            dataKey="program"
                                            stroke={CHART_TEXT}
                                            tick={{ fill: CHART_TEXT, fontSize: 11 }}
                                            interval={0}
                                            angle={-25}
                                            textAnchor="end"
                                            height={80}
                                        />
                                        <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                                        <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>










                {/* SURVEY RESULTS */}
                <TabsContent value="surveys">
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white text-lg">Survey Results</CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant={surveyMode === "lsir" ? "default" : "outline"}
                                        className={surveyMode === "lsir" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-700"}
                                        onClick={() => setSurveyMode("lsir")}
                                    >
                                        LSI-R
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={surveyMode === "other" ? "default" : "outline"}
                                        className={surveyMode === "other" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-700"}
                                        onClick={() => setSurveyMode("other")}
                                    >
                                        Other Surveys
                                    </Button>
                                </div>

                                {surveyMode === "other" ? (
                                    <div className="flex items-end gap-3 flex-wrap">
                                        <div>
                                            <Label className="text-slate-300 text-xs">Survey</Label>
                                            <Select value={otherSurveyTemplateId} onValueChange={setOtherSurveyTemplateId}>
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-72">
                                                    <SelectValue placeholder="Select survey" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-800 border-slate-700">
                                                    <SelectItem value="all" className="text-white">
                                                        All Other Surveys
                                                    </SelectItem>
                                                    {otherTemplates.map((t) => (
                                                        <SelectItem key={t.id} value={t.id} className="text-white">
                                                            {t.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant={otherViewMode === "bySurvey" ? "default" : "outline"}
                                                className={otherViewMode === "bySurvey" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-700"}
                                                onClick={() => setOtherViewMode("bySurvey")}
                                            >
                                                View by Survey
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={otherViewMode === "byParticipant" ? "default" : "outline"}
                                                className={otherViewMode === "byParticipant" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-700"}
                                                onClick={() => setOtherViewMode("byParticipant")}
                                            >
                                                View by Participant
                                            </Button>
                                        </div>

                                        {otherViewMode === "byParticipant" ? (
                                            <div>
                                                <Label className="text-slate-300 text-xs">Participant</Label>
                                                <Select value={selectedOtherParticipantId} onValueChange={setSelectedOtherParticipantId}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white w-72">
                                                        <SelectValue placeholder="Select participant" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-800 border-slate-700">
                                                        <SelectItem value="all" className="text-white">
                                                            All participants
                                                        </SelectItem>
                                                        {otherParticipantsWithResponses.map((r) => (
                                                            <SelectItem key={r.pid} value={r.pid} className="text-white">
                                                                {r.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            {/* LSIR MODE */}
                            {surveyMode === "lsir" ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card className="bg-slate-950/40 border-slate-800">
                                        <CardHeader>
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                                <div>
                                                    <CardTitle className="text-white text-base">LSI-R Aggregation</CardTitle>
                                                    <p className="text-sm text-slate-400">
                                                        Switch between domain-level and question-level aggregation.
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        variant={lsirAggMode === "domain" ? "default" : "outline"}
                                                        className={lsirAggMode === "domain" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-700"}
                                                        onClick={() => setLsirAggMode("domain")}
                                                    >
                                                        Domain
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant={lsirAggMode === "questions" ? "default" : "outline"}
                                                        className={lsirAggMode === "questions" ? "bg-blue-600 hover:bg-blue-700" : "border-slate-700"}
                                                        onClick={() => setLsirAggMode("questions")}
                                                    >
                                                        Questions
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardHeader>

                                        <CardContent>
                                            {lsirAggMode === "domain" ? (
                                                lsirDomainSummary.length === 0 ? (
                                                    <p className="text-slate-400 text-sm">No LSI-R responses found for the selected filters.</p>
                                                ) : (
                                                    <div className="overflow-auto max-h-[520px]">
                                                        <table className="w-full text-sm">
                                                            <thead className="bg-slate-800">
                                                                <tr>
                                                                    <th className="text-left p-3 text-slate-300">Domain</th>
                                                                    <th className="text-right p-3 text-slate-300">Responses</th>
                                                                    <th className="text-right p-3 text-slate-300">Avg Score</th>
                                                                    <th className="text-left p-3 text-slate-300">Risk Mix</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {lsirDomainSummary.map((d) => (
                                                                    <tr key={d.domain} className="border-b border-slate-800">
                                                                        <td className="p-3 text-white">{d.domain}</td>
                                                                        <td className="p-3 text-right text-white">{d.count}</td>
                                                                        <td className="p-3 text-right text-white">{d.avgScore}</td>
                                                                        <td className="p-3 text-slate-300">
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {Object.entries(d.riskCounts || {})
                                                                                    .sort((a, b) => b[1] - a[1])
                                                                                    .slice(0, 4)
                                                                                    .map(([risk, count]) => (
                                                                                        <span
                                                                                            key={risk}
                                                                                            className={`inline-flex px-2 py-1 rounded-md text-xs ${riskBadgeClass(risk)}`}
                                                                                        >
                                                                                            {risk}: {count}
                                                                                        </span>
                                                                                    ))}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )
                                            ) : lsirQuestionAggregate.length === 0 ? (
                                                <p className="text-slate-400 text-sm">
                                                    No question-level answers found for LSI-R in the selected filters.
                                                </p>
                                            ) : (
                                                <div className="overflow-auto max-h-[520px]">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-slate-800">
                                                            <tr>
                                                                <th className="text-left p-3 text-slate-300">Question</th>
                                                                <th className="text-right p-3 text-slate-300">Responses</th>
                                                                <th className="text-right p-3 text-slate-300">Avg</th>
                                                                <th className="text-left p-3 text-slate-300">Top Values</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {lsirQuestionAggregate.map((q) => (
                                                                <tr key={q.key} className="border-b border-slate-800 align-top">
                                                                    <td className="p-3 text-white min-w-[320px]">{q.questionText}</td>
                                                                    <td className="p-3 text-right text-white whitespace-nowrap">{q.responses}</td>
                                                                    <td className="p-3 text-right text-white whitespace-nowrap">
                                                                        {q.avgNumeric !== "" ? q.avgNumeric : "-"}
                                                                    </td>
                                                                    <td className="p-3 text-slate-200">
                                                                        {q.topValues?.length ? (
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {q.topValues.map((tv) => (
                                                                                    <span
                                                                                        key={`${q.key}-${tv.value}`}
                                                                                        className="inline-flex px-2 py-1 rounded-md text-xs bg-slate-800 text-slate-200 border border-slate-700"
                                                                                    >
                                                                                        {tv.value} - {tv.count}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-slate-500 text-xs">
                                                                                Numeric-only question or no non-numeric values.
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-slate-950/40 border-slate-800">
                                        <CardHeader>
                                            <CardTitle className="text-white text-base">Individual LSI-R Responses</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            {lsirResponses.length === 0 ? (
                                                <p className="text-slate-400 text-sm">No LSI-R responses found for the selected filters.</p>
                                            ) : (
                                                <div className="overflow-auto max-h-[520px]">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-slate-800">
                                                            <tr>
                                                                <th className="text-left p-3 text-slate-300">Participant</th>
                                                                <th className="text-left p-3 text-slate-300">Domain</th>
                                                                <th className="text-right p-3 text-slate-300">Score</th>
                                                                <th className="text-left p-3 text-slate-300">Risk</th>
                                                                <th className="text-left p-3 text-slate-300">Date</th>
                                                                <th className="text-right p-3 text-slate-300">View</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {lsirResponses.map((sr) => {
                                                                const p = participantsById.get(sr.participant_id);
                                                                const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "Unknown";
                                                                const domain =
                                                                    sr.domain_name || sr.section_name || sr.section_id || "Unknown Domain";
                                                                const date = sr.completed_date || sr.created_date || "";

                                                                return (
                                                                    <tr key={sr.id} className="border-b border-slate-800">
                                                                        <td className="p-3 text-white whitespace-nowrap">{name}</td>
                                                                        <td className="p-3 text-slate-200">{domain}</td>
                                                                        <td className="p-3 text-right text-white">{sr.overall_score ?? ""}</td>
                                                                        <td className="p-3">
                                                                            <span
                                                                                className={`inline-flex px-2 py-1 rounded-md text-xs ${riskBadgeClass(
                                                                                    sr.overall_risk_band
                                                                                )}`}
                                                                            >
                                                                                {sr.overall_risk_band || "Unknown"}
                                                                            </span>
                                                                        </td>
                                                                        <td className="p-3 text-slate-400 whitespace-nowrap">{formatDateMaybe(date)}</td>
                                                                        <td className="p-3 text-right">
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="border-slate-700 hover:bg-slate-800"
                                                                                onClick={() => openResponse(sr)}
                                                                            >
                                                                                <Eye className="h-4 w-4 mr-2" />
                                                                                View
                                                                            </Button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            ) : null}

                            {/* OTHER SURVEYS MODE */}
                            {surveyMode === "other" ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card className="bg-slate-950/40 border-slate-800">
                                        <CardHeader>
                                            <CardTitle className="text-white text-base">
                                                Individual Responses - {selectedOtherTemplateName}
                                                {otherViewMode === "byParticipant" && selectedOtherParticipantId !== "all"
                                                    ? " (Participant Filtered)"
                                                    : ""}
                                            </CardTitle>
                                        </CardHeader>

                                        <CardContent>
                                            {(() => {
                                                const rows =
                                                    otherViewMode === "bySurvey" ? selectedOtherResponses : selectedOtherResponsesByParticipant;

                                                if (!rows.length) {
                                                    return <p className="text-slate-400 text-sm">No responses found for the selected filters.</p>;
                                                }

                                                return (
                                                    <div className="overflow-auto max-h-[520px]">
                                                        <table className="w-full text-sm">
                                                            <thead className="bg-slate-800">
                                                                <tr>
                                                                    <th className="text-left p-3 text-slate-300">Participant</th>
                                                                    <th className="text-left p-3 text-slate-300">Survey</th>
                                                                    <th className="text-left p-3 text-slate-300">Date</th>
                                                                    <th className="text-right p-3 text-slate-300">Score</th>
                                                                    <th className="text-left p-3 text-slate-300">Risk</th>
                                                                    <th className="text-right p-3 text-slate-300">View</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rows.map((sr) => {
                                                                    const p = participantsById.get(sr.participant_id);
                                                                    const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "Unknown";
                                                                    const surveyName = sr.survey_template_name || sr.template_name || "Unknown";
                                                                    const date = sr.completed_date || sr.created_date || "";

                                                                    return (
                                                                        <tr key={sr.id} className="border-b border-slate-800">
                                                                            <td className="p-3 text-white whitespace-nowrap">{name}</td>
                                                                            <td className="p-3 text-slate-200">{surveyName}</td>
                                                                            <td className="p-3 text-slate-400 whitespace-nowrap">{formatDateMaybe(date)}</td>
                                                                            <td className="p-3 text-right text-white">{sr.overall_score ?? ""}</td>
                                                                            <td className="p-3">
                                                                                <span
                                                                                    className={`inline-flex px-2 py-1 rounded-md text-xs ${riskBadgeClass(
                                                                                        sr.overall_risk_band
                                                                                    )}`}
                                                                                >
                                                                                    {sr.overall_risk_band || "Unknown"}
                                                                                </span>
                                                                            </td>
                                                                            <td className="p-3 text-right">
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="outline"
                                                                                    size="sm"
                                                                                    className="border-slate-700 hover:bg-slate-800"
                                                                                    onClick={() => openResponse(sr)}
                                                                                >
                                                                                    <Eye className="h-4 w-4 mr-2" />
                                                                                    View
                                                                                </Button>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })()}
                                        </CardContent>
                                    </Card>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    {/* Full response viewer */}
                    <Dialog open={responseViewerOpen} onOpenChange={setResponseViewerOpen}>
                        <DialogContent className="bg-slate-900 border-slate-800 max-w-5xl">
                            <DialogHeader>
                                <DialogTitle className="text-white">Survey Response</DialogTitle>
                            </DialogHeader>

                            {activeResponse ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3">
                                            <p className="text-xs text-slate-400">Participant</p>
                                            <p className="text-white font-medium">
                                                {(() => {
                                                    const p = participantsById.get(activeResponse.participant_id);
                                                    return p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "Unknown";
                                                })()}
                                            </p>
                                        </div>

                                        <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3">
                                            <p className="text-xs text-slate-400">Survey</p>
                                            <p className="text-white font-medium">
                                                {activeResponse.survey_template_name || activeResponse.template_name || "Unknown"}
                                            </p>
                                        </div>

                                        <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-3">
                                            <p className="text-xs text-slate-400">Completed</p>
                                            <p className="text-white font-medium">
                                                {formatDateMaybe(activeResponse.completed_date || activeResponse.created_date || "")}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Badge className="bg-slate-500/10 text-slate-200 border border-slate-700">
                                            Score: {activeResponse.overall_score ?? ""}
                                        </Badge>
                                        <Badge className={riskBadgeClass(activeResponse.overall_risk_band)}>
                                            Risk: {activeResponse.overall_risk_band || "Unknown"}
                                        </Badge>
                                        {activeResponse.section_name || activeResponse.section_id ? (
                                            <Badge className="bg-slate-500/10 text-slate-200 border border-slate-700">
                                                Section: {activeResponse.section_name || activeResponse.section_id}
                                            </Badge>
                                        ) : null}
                                    </div>

                                    {(() => {
                                        const answers = extractAnswers(activeResponse);
                                        const labelMap = buildQuestionLabelMapFromTemplate(activeTemplate);

                                        if (answers.length) {
                                            const improved = answers.map((a) => {
                                                const key = String(a.key || "");
                                                const mapped = labelMap.get(key);
                                                const label =
                                                    mapped || (a.label && a.label !== a.key ? a.label : prettifyQuestionKey(a.label || key));
                                                return { ...a, label };
                                            });

                                            return (
                                                <div className="border border-slate-800 rounded-xl overflow-hidden">
                                                    <div className="bg-slate-950/40 p-3 border-b border-slate-800">
                                                        <p className="text-white font-semibold">Responses</p>
                                                        <p className="text-xs text-slate-400">
                                                            Rendered from stored response data{activeTemplate ? " with template labels." : "."}
                                                        </p>
                                                    </div>
                                                    <div className="max-h-[420px] overflow-auto">
                                                        <table className="w-full text-sm">
                                                            <thead className="bg-slate-800">
                                                                <tr>
                                                                    <th className="text-left p-3 text-slate-300">Question</th>
                                                                    <th className="text-left p-3 text-slate-300">Answer</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {improved.map((a) => (
                                                                    <tr key={a.key} className="border-b border-slate-800">
                                                                        <td className="p-3 text-white">{a.label}</td>
                                                                        <td className="p-3 text-slate-200">{safeString(a.value)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const rawObj =
                                            activeResponse?.raw_response_json && typeof activeResponse.raw_response_json === "object"
                                                ? activeResponse.raw_response_json
                                                : null;

                                        if (rawObj && Object.keys(rawObj).length) {
                                            const rows = Object.entries(rawObj).map(([k, v]) => {
                                                const mapped = labelMap.get(String(k));
                                                return { key: k, label: mapped || prettifyQuestionKey(k), value: v };
                                            });

                                            return (
                                                <div className="border border-slate-800 rounded-xl overflow-hidden">
                                                    <div className="bg-slate-950/40 p-3 border-b border-slate-800">
                                                        <p className="text-white font-semibold">Responses</p>
                                                        <p className="text-xs text-slate-400">
                                                            Rendered from stored response data{activeTemplate ? " with template labels." : "."}
                                                        </p>
                                                    </div>
                                                    <div className="max-h-[420px] overflow-auto">
                                                        <table className="w-full text-sm">
                                                            <thead className="bg-slate-800">
                                                                <tr>
                                                                    <th className="text-left p-3 text-slate-300">Question</th>
                                                                    <th className="text-left p-3 text-slate-300">Answer</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rows.map((r) => (
                                                                    <tr key={r.key} className="border-b border-slate-800">
                                                                        <td className="p-3 text-white">{r.label}</td>
                                                                        <td className="p-3 text-slate-200">{safeString(r.value)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const metaRows = Object.entries(activeResponse || {}).map(([k, v]) => ({
                                            key: k,
                                            label: prettifyQuestionKey(k),
                                            value: v,
                                        }));

                                        return (
                                            <div className="border border-slate-800 rounded-xl overflow-hidden">
                                                <div className="bg-slate-950/40 p-3 border-b border-slate-800">
                                                    <p className="text-white font-semibold">Record Details</p>
                                                    <p className="text-xs text-slate-400">
                                                        No structured response fields found - showing record fields in table form.
                                                    </p>
                                                </div>
                                                <div className="max-h-[420px] overflow-auto">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-slate-800">
                                                            <tr>
                                                                <th className="text-left p-3 text-slate-300">Field</th>
                                                                <th className="text-left p-3 text-slate-300">Value</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {metaRows.map((r) => (
                                                                <tr key={r.key} className="border-b border-slate-800">
                                                                    <td className="p-3 text-white">{r.label}</td>
                                                                    <td className="p-3 text-slate-200">{safeString(r.value)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <p className="text-slate-400">No response selected.</p>
                            )}
                        </DialogContent>
                    </Dialog>
                </TabsContent>

                {/* EXPORTS */}
                <TabsContent value="exports">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <ExportCard
                                            icon={Users}
                                            iconColor="blue"
                                            title="Participants"
                                            count={filteredParticipants.length}
                                            onExportCSV={() => exportToCSV(filteredParticipants, "participants")}
                                            onExportPDF={() => exportToPDFOrWord(filteredParticipants, "Participants", "pdf")}
                                            onExportWord={() => exportToPDFOrWord(filteredParticipants, "Participants", "word")}
                                        />
                                        <ExportCard
                                            icon={FileText}
                                            iconColor="violet"
                                            title="Case Notes"
                                            count={filteredCaseNotes.length}
                                            onExportCSV={() => exportToCSV(filteredCaseNotes, "case_notes")}
                                            onExportPDF={() => exportToPDFOrWord(filteredCaseNotes, "Case_Notes", "pdf")}
                                            onExportWord={() => exportToPDFOrWord(filteredCaseNotes, "Case_Notes", "word")}
                                        />
                                        <ExportCard
                                            icon={Briefcase}
                                            iconColor="emerald"
                                            title="Employment"
                                            count={filteredEmployments.length}
                                            onExportCSV={() => exportToCSV(filteredEmployments, "employment_placements")}
                                            onExportPDF={() => exportToPDFOrWord(filteredEmployments, "Employment", "pdf")}
                                            onExportWord={() => exportToPDFOrWord(filteredEmployments, "Employment", "word")}
                                        />
                                        <ExportCard
                                            icon={GraduationCap}
                                            iconColor="amber"
                                            title="Training"
                                            count={filteredTrainings.length}
                                            onExportCSV={() => exportToCSV(filteredTrainings, "training_records")}
                                            onExportPDF={() => exportToPDFOrWord(filteredTrainings, "Training", "pdf")}
                                            onExportWord={() => exportToPDFOrWord(filteredTrainings, "Training", "word")}
                                        />
                                        <ExportCard
                                            icon={DollarSign}
                                            iconColor="pink"
                                            title="Funding Records"
                                            count={filteredFunding.length}
                                            onExportCSV={() => exportToCSV(filteredFunding, "funding_records")}
                                            onExportPDF={() => exportToPDFOrWord(filteredFunding, "Funding", "pdf")}
                                            onExportWord={() => exportToPDFOrWord(filteredFunding, "Funding", "word")}
                                        />
                                        <ExportCard
                                            icon={ClipboardList}
                                            iconColor="blue"
                                            title="Survey Responses (All)"
                                            count={surveyExportRows.length}
                                            onExportCSV={() => exportToCSV(surveyExportRows, "survey_responses")}
                                            onExportPDF={() => exportToPDFOrWord(surveyExportRows, "Survey_Responses", "pdf")}
                                            onExportWord={() => exportToPDFOrWord(surveyExportRows, "Survey_Responses", "word")}
                                        />
                                    </div>
                                </TabsContent>

                {/* LSI-R */}
                <TabsContent value="lsir">
                                    <Card className="bg-slate-900/50 border-slate-800">
                                        <CardContent className="p-6 text-center">
                                            <BarChart3 className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                                            <h3 className="text-lg font-semibold text-white mb-2">LSI-R Domain Analysis</h3>
                                            <p className="text-slate-400 mb-4">This is the dedicated LSI-R report page. It remains separate from Survey Results.</p>
                                            <Link to={createPageUrl("LSIRReport")}>
                                                <Button className="bg-blue-600 hover:bg-blue-700">View LSI-R Report</Button>
                                            </Link>
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                {/* CUSTOM REPORTS */}
                <TabsContent value="custom">
                                    <div className="space-y-6">
                                        <div className="flex justify-end">
                                            <Link to={createPageUrl("ReportBuilder")}>
                                                <Button className="bg-blue-600 hover:bg-blue-700">
                                                    <PieChart className="h-4 w-4 mr-2" />
                                                    Create Custom Report
                                                </Button>
                                            </Link>
                                        </div>
                                        <CustomReportsList />
                                    </div>
                                </TabsContent>


            </Tabs>
        </div>
    );
}

/* ExportCard + CustomReportsList unchanged */
function ExportCard({ icon: Icon, iconColor, title, count, onExportCSV, onExportPDF, onExportWord }) {
    const colorClasses = {
        blue: "bg-blue-500/20 text-blue-400",
        violet: "bg-violet-500/20 text-violet-400",
        emerald: "bg-emerald-500/20 text-emerald-400",
        amber: "bg-amber-500/20 text-amber-400",
        pink: "bg-pink-500/20 text-pink-400",
    };

    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className={`p-3 rounded-xl ${colorClasses[iconColor]?.split(" ")[0] || "bg-slate-500/20"}`}>
                        <Icon className={`h-6 w-6 ${colorClasses[iconColor]?.split(" ")[1] || "text-slate-400"}`} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">{title}</h3>
                        <p className="text-sm text-slate-400">{count} records</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <Button onClick={onExportCSV} variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 text-xs" type="button">
                        CSV
                    </Button>
                    <Button onClick={onExportPDF} variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 text-xs" type="button">
                        PDF
                    </Button>
                    <Button onClick={onExportWord} variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 text-xs" type="button">
                        Word
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function CustomReportsList() {
    const { data: reports = [], isLoading } = useQuery({
        queryKey: ["customReports"],
        queryFn: () => base44.entities.CustomReport.list("-created_date", 50),
    });

    if (isLoading) return <LoadingSpinner />;

    if (reports.length === 0) {
        return (
            <Card className="bg-slate-900/50 border-slate-800 border-dashed">
                <CardContent className="p-8 text-center">
                    <PieChart className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No custom reports yet. Create your first report to get started.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
                <Link key={report.id} to={createPageUrl(`ReportView?id=${report.id}`)}>
                    <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors h-full">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <BarChart3 className="h-5 w-5 text-blue-400" />
                                <h4 className="font-medium text-white">{report.name}</h4>
                            </div>
                            {report.description ? (
                                <p className="text-sm text-slate-400 line-clamp-2">{report.description}</p>
                            ) : null}
                            <div className="flex items-center gap-2 mt-3">
                                <Badge className="bg-slate-700 text-slate-300">{report.charts?.length || 0} charts</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
    );
}
