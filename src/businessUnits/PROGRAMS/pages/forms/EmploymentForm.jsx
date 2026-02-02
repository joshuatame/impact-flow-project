// src/pages/EmploymentForm.jsx
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Users, Search, Building2, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ----- helpers -----
function isActiveParticipant(p) {
    const s = (p?.status || "").toString().trim().toLowerCase();
    // If your data sometimes has no status, don't hide people.
    if (!s) return true;
    return s === "active";
}

function safeName(p) {
    const fn = (p?.first_name || "").toString().trim();
    const ln = (p?.last_name || "").toString().trim();
    const full = `${fn} ${ln}`.trim();
    return full || p?.full_name || "Unnamed";
}

function isEmploymentActive(status) {
    const s = (status || "").toString();
    return !["Finished", "Lost"].includes(s);
}

// Fallback (used only if settings doc not available)
const DEFAULT_INDUSTRY_TYPES = [
    "Accommodation & Food Services",
    "Administrative & Support Services",
    "Agriculture, Forestry & Fishing",
    "Arts & Recreation Services",
    "Construction",
    "Education & Training",
    "Electricity, Gas, Water & Waste Services",
    "Financial & Insurance Services",
    "Health Care & Social Assistance",
    "Information Media & Telecommunications",
    "Manufacturing",
    "Mining",
    "Other Services",
    "Professional, Scientific & Technical Services",
    "Public Administration & Safety",
    "Rental, Hiring & Real Estate Services",
    "Retail Trade",
    "Security",
    "Transport, Postal & Warehousing",
    "Wholesale Trade",
    "Youth & Community Services",
].sort((a, b) => a.localeCompare(b));

/**
 * EmploymentForm
 * - page mode: uses URL params
 * - embedded mode: pass props { embedded, participantId, employmentId, onClose, onSaved }
 */
export default function EmploymentForm({
    embedded = false,
    participantId: embeddedParticipantId = "",
    employmentId: embeddedEmploymentId = "",
    onClose,
    onSaved,
} = {}) {
    const queryClient = useQueryClient();

    const urlParams = new URLSearchParams(window.location.search);
    const employmentId = embedded ? embeddedEmploymentId : urlParams.get("id");
    const preselectedParticipantId = embedded
        ? embeddedParticipantId
        : urlParams.get("participant_id");

    const isEditing = !!employmentId;

    const [participantSearch, setParticipantSearch] = useState("");

    const [selectedParticipantIds, setSelectedParticipantIds] = useState(() => {
        return preselectedParticipantId ? [preselectedParticipantId] : [];
    });

    // For legacy bits that expect "primary" selected participant
    const selectedParticipantId = selectedParticipantIds[0] || "";

    const [industryOtherOpen, setIndustryOtherOpen] = useState(false);
    const [industryOtherDraft, setIndustryOtherDraft] = useState("");

    const [formData, setFormData] = useState({
        employer_name: "",
        abn: "",
        job_title: "",
        employment_type: "Full Time",
        industry_type: "", // ✅ uses SystemSettings now
        industry_type_other: "", // ✅ only when "Other" chosen
        hours_per_week: "",
        wage_rate: "",
        start_date: "",
        end_date: "",
        status: "Pending",
        reason_end: "",
        week_4_milestone: false,
        week_13_milestone: false,
        week_26_milestone: false,
    });

    // --- data ---
    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 5000),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: programs = [] } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 2000),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: existingEmployment, isLoading: loadingEmployment } = useQuery({
        queryKey: ["employmentPlacement", employmentId],
        queryFn: () => base44.entities.EmploymentPlacement.get(employmentId),
        enabled: isEditing,
    });

    // ✅ Industry Types from SystemSettings (Firestore: systemSettings/industry_types)
    const { data: industrySetting } = useQuery({
        queryKey: ["systemSetting", "industry_types"],
        queryFn: () => base44.entities.SystemSettings.get("industry_types"),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const industryOptions = useMemo(() => {
        const opts = Array.isArray(industrySetting?.options) ? industrySetting.options : [];
        const cleaned = opts
            .map((x) => String(x || "").trim())
            .filter(Boolean);

        const unique = Array.from(new Set(cleaned));

        const base = unique.length > 0 ? unique : DEFAULT_INDUSTRY_TYPES;

        // Avoid duplicates if someone adds "Other" as an option in settings
        const withoutOther = base.filter((x) => x.toLowerCase() !== "other");

        return withoutOther.slice().sort((a, b) => a.localeCompare(b));
    }, [industrySetting]);

    // used for stage alignment + DEX checks
    const { data: placementsForPrimary = [] } = useQuery({
        queryKey: ["employmentPlacements", selectedParticipantId],
        queryFn: () =>
            base44.entities.EmploymentPlacement.filter({ participant_id: selectedParticipantId }),
        enabled: !!selectedParticipantId,
    });

    // edit-load
    useEffect(() => {
        if (!existingEmployment) return;

        setFormData({
            employer_name: existingEmployment.employer_name || "",
            abn: existingEmployment.abn || "",
            job_title: existingEmployment.job_title || "",
            employment_type: existingEmployment.employment_type || "Full Time",

            // ✅ industry (support both possible field names)
            industry_type: existingEmployment.industry_type || existingEmployment.industry || "",
            industry_type_other: existingEmployment.industry_type_other || "",

            hours_per_week: existingEmployment.hours_per_week ?? "",
            wage_rate: existingEmployment.wage_rate ?? "",
            start_date: existingEmployment.start_date || "",
            end_date: existingEmployment.end_date || "",
            status: existingEmployment.status || "Pending",
            reason_end: existingEmployment.reason_end || "",
            week_4_milestone: !!existingEmployment.week_4_milestone,
            week_13_milestone: !!existingEmployment.week_13_milestone,
            week_26_milestone: !!existingEmployment.week_26_milestone,
        });

        const pid = existingEmployment.participant_id || "";
        if (pid) setSelectedParticipantIds([pid]);
    }, [existingEmployment]);

    // In embedded mode, force the single participant selection
    useEffect(() => {
        if (!embedded) return;
        if (embeddedParticipantId) setSelectedParticipantIds([embeddedParticipantId]);
    }, [embedded, embeddedParticipantId]);

    const activeParticipants = useMemo(() => {
        const s = participantSearch.trim().toLowerCase();
        return (participants || [])
            .filter(isActiveParticipant)
            .filter((p) => {
                if (!s) return true;
                return safeName(p).toLowerCase().includes(s);
            })
            .sort((a, b) => safeName(a).localeCompare(safeName(b)));
    }, [participants, participantSearch]);

    const updateField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

    const handleIndustryChange = (v) => {
        if (v === "__OTHER__") {
            setIndustryOtherDraft(formData.industry_type_other || "");
            setIndustryOtherOpen(true);
            // keep selection as "Other" for now
            updateField("industry_type", "Other");
            return;
        }

        updateField("industry_type", v);
        updateField("industry_type_other", "");
    };

    const saveIndustryOther = () => {
        const val = String(industryOtherDraft || "").trim();
        updateField("industry_type", "Other");
        updateField("industry_type_other", val);
        setIndustryOtherOpen(false);
    };

    // --- save ---
    const saveMutation = useMutation({
        mutationFn: async (data) => {
            const ids = (selectedParticipantIds || []).filter(Boolean);

            if (!data?.start_date) throw new Error("Start date is required");
            if (!ids.length) throw new Error("Participant is required");

            const user = await base44.auth.me().catch(() => null);

            const payloadBase = {
                employer_name: data.employer_name || "",
                abn: data.abn || "",
                job_title: data.job_title || "",
                employment_type: data.employment_type || "Full Time",

                // ✅ industry type fields
                industry_type: data.industry_type || "",
                industry_type_other: data.industry_type === "Other" ? (data.industry_type_other || "") : "",

                hours_per_week: data.hours_per_week ? Number(data.hours_per_week) : null,
                wage_rate: data.wage_rate ? Number(data.wage_rate) : null,
                start_date: data.start_date || "",
                end_date: data.end_date || "",
                status: data.status || "Pending",
                reason_end: data.reason_end || "",
                week_4_milestone: !!data.week_4_milestone,
                week_13_milestone: !!data.week_13_milestone,
                week_26_milestone: !!data.week_26_milestone,
            };

            // Edit = single record update
            if (isEditing) {
                const before = existingEmployment;

                const updated = await base44.entities.EmploymentPlacement.update(employmentId, payloadBase);

                // DEX: record sustained transition
                if (data.status === "Sustained" && before?.status !== "Sustained") {
                    try {
                        await base44.entities.DEXActivityRecord.create({
                            participant_id: before?.participant_id || selectedParticipantId,
                            program_id: before?.program_id || null,
                            activity_type: "Employment Sustained",
                            activity_date: new Date().toISOString().split("T")[0],
                            reference_entity_type: "EmploymentPlacement",
                            reference_entity_id: employmentId,
                            details: { employer: data.employer_name, job_title: data.job_title },
                            recorded_by_id: user?.id || null,
                            recorded_by_name: user?.full_name || null,
                            recorded_by_email: user?.email || null,
                        });
                    } catch (e) {
                        console.warn("DEX sustained record failed (non-blocking)", e);
                    }
                }

                return { id: employmentId, updated };
            }

            // Create = possibly multiple participants
            const createdIds = [];

            for (const pid of ids) {
                // enrollments (for DEX)
                const enrollments = await base44.entities.ParticipantProgramEnrollment.filter({
                    participant_id: pid,
                });

                const dexEnrollment =
                    (enrollments || []).find((e) => {
                        const program = (programs || []).find((p) => p.id === e.program_id);
                        return e.status !== "Exited" && !!program?.dex_reporting_required;
                    }) || null;

                if (!dexEnrollment?.program_id) {
                    throw new Error(
                        "Participant must be enrolled in a DEX active program before adding employment."
                    );
                }

                const programId = dexEnrollment.program_id;
                const caseLocation =
                    dexEnrollment.dex_case_location ||
                    dexEnrollment.case_location ||
                    dexEnrollment.hub_location ||
                    null;

                const created = await base44.entities.EmploymentPlacement.create({
                    ...payloadBase,
                    participant_id: pid,
                    program_id: programId,
                });

                createdIds.push(created?.id);

                // Stage alignment + DEX checks
                try {
                    const currentPlacements =
                        pid === selectedParticipantId
                            ? placementsForPrimary
                            : await base44.entities.EmploymentPlacement.filter({ participant_id: pid });

                    const hadActiveBefore = (currentPlacements || []).some((p) => isEmploymentActive(p?.status));
                    const willBeActive = isEmploymentActive(payloadBase.status);

                    let nextStage = null;
                    if (payloadBase.status === "Started" || payloadBase.status === "Sustained") {
                        nextStage = "Employment";
                    } else if (payloadBase.status === "Pending" && hadActiveBefore) {
                        nextStage = "Employment";
                    }

                    if (nextStage) {
                        await base44.entities.Participant.update(pid, { current_phase: nextStage });
                    }

                    // DEX: Employment Commenced + Mentoring Commenced only if first active employment
                    const program = (programs || []).find((p) => p.id === programId);
                    const isDexActive = !!program?.dex_reporting_required;

                    if (isDexActive && willBeActive && !hadActiveBefore) {
                        const p = (participants || []).find((x) => x.id === pid);
                        const participantName = p ? safeName(p) : null;

                        const common = {
                            participant_id: pid,
                            participant_name: participantName,
                            program_id: programId,
                            case_location: caseLocation,
                            service_setting: null,
                            activity_date: payloadBase.start_date,
                            reference_entity_type: "EmploymentPlacement",
                            reference_entity_id: created?.id,
                            details: {
                                employer_name: payloadBase.employer_name,
                                job_title: payloadBase.job_title,
                                employment_type: payloadBase.employment_type,
                            },
                            recorded_by_id: user?.id || null,
                            recorded_by_name: user?.full_name || null,
                            recorded_by_email: user?.email || null,
                        };

                        await base44.entities.DEXActivityRecord.create({
                            ...common,
                            activity_type: "Employment Commenced",
                        });

                        await base44.entities.DEXActivityRecord.create({
                            ...common,
                            activity_type: "Mentoring Commenced",
                        });
                    }
                } catch (e) {
                    console.warn("Employment alignment/DEX failed (non-blocking)", e);
                }
            }

            return { id: createdIds[0] || null, ids: createdIds };
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["EmploymentPlacement"] });
            queryClient.invalidateQueries({ queryKey: ["employmentPlacements"] });
            queryClient.invalidateQueries({ queryKey: ["DEXActivityRecord"] });
            queryClient.invalidateQueries({ queryKey: ["participant"] });

            onSaved?.(res);

            // Close after save (required)
            if (embedded) {
                onClose?.();
                return;
            }

            // Page navigation behavior
            if (selectedParticipantId) {
                window.location.href = createPageUrl(`ParticipantDetail?id=${selectedParticipantId}`);
            } else {
                window.location.href = createPageUrl("Dashboard");
            }
        },
    });

    const showParticipantPicker = !embedded && !preselectedParticipantId;

    if ((isEditing && loadingEmployment) || loadingParticipants) return <LoadingSpinner />;

    return (
        <div className={embedded ? "p-0" : "p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto"}>
            {!embedded && (
                <Link
                    to={
                        selectedParticipantId
                            ? createPageUrl(`ParticipantDetail?id=${selectedParticipantId}`)
                            : createPageUrl("Dashboard")
                    }
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            )}

            {!embedded && (
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
                    {isEditing ? "Edit Employment" : "New Employment Placement"}
                </h1>
            )}

            {/* ✅ Industry "Other" dialog */}
            <Dialog open={industryOtherOpen} onOpenChange={setIndustryOtherOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-white">Industry type (Other)</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 mt-2">
                        <div>
                            <Label className="text-slate-300">Enter industry</Label>
                            <Input
                                value={industryOtherDraft}
                                onChange={(e) => setIndustryOtherDraft(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="e.g., Security Services"
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                This will be saved on the employment record.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-700"
                                onClick={() => {
                                    setIndustryOtherOpen(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={saveIndustryOther}
                                disabled={!String(industryOtherDraft || "").trim()}
                            >
                                Save
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    saveMutation.mutate(formData);
                }}
                className={embedded ? "space-y-6 p-4" : "space-y-6"}
            >
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            Employer Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Employer Name *</Label>
                                <Input
                                    value={formData.employer_name}
                                    onChange={(e) => updateField("employer_name", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    required
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">ABN</Label>
                                <Input
                                    value={formData.abn}
                                    onChange={(e) => updateField("abn", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Briefcase className="h-5 w-5" />
                            Position Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-1">
                                <Label className="text-slate-300">Job Title *</Label>
                                <Input
                                    value={formData.job_title}
                                    onChange={(e) => updateField("job_title", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    required
                                />
                            </div>

                            <div className="md:col-span-1">
                                <Label className="text-slate-300">Employment Type</Label>
                                <Select
                                    value={formData.employment_type}
                                    onValueChange={(v) => updateField("employment_type", v)}
                                >
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Casual", "Part Time", "Full Time", "Contract", "Other"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* ✅ Industry Type: pulled from SystemSettings */}
                            <div className="md:col-span-1">
                                <Label className="text-slate-300">Industry Type</Label>
                                <Select
                                    value={formData.industry_type === "Other" ? "__OTHER__" : (formData.industry_type || "")}
                                    onValueChange={handleIndustryChange}
                                >
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select industry" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {industryOptions.map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                        <SelectItem value="__OTHER__" className="text-white">
                                            Other…
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                {formData.industry_type === "Other" && (
                                    <p className="text-xs text-slate-500 mt-2">
                                        {formData.industry_type_other
                                            ? `Other: ${formData.industry_type_other}`
                                            : "Other selected (enter a value)."}
                                        <button
                                            type="button"
                                            className="ml-2 underline text-slate-300 hover:text-white"
                                            onClick={() => {
                                                setIndustryOtherDraft(formData.industry_type_other || "");
                                                setIndustryOtherOpen(true);
                                            }}
                                        >
                                            Edit
                                        </button>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-slate-300">Hours/Week</Label>
                                <Input
                                    type="number"
                                    value={formData.hours_per_week}
                                    onChange={(e) => updateField("hours_per_week", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Hourly Rate ($)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.wage_rate}
                                    onChange={(e) => updateField("wage_rate", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Status</Label>
                                <Select value={formData.status} onValueChange={(v) => updateField("status", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Pending", "Started", "Sustained", "Finished", "Lost"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Start Date *</Label>
                                <Input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => updateField("start_date", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    required
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">End Date</Label>
                                <Input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => updateField("end_date", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {isEditing && (
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white">Milestones</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {[
                                { key: "week_4_milestone", title: "4 Week Milestone", desc: "Participant reached 4 weeks of employment" },
                                { key: "week_13_milestone", title: "13 Week Milestone", desc: "Participant reached 13 weeks of employment" },
                                { key: "week_26_milestone", title: "26 Week Milestone", desc: "Participant reached 26 weeks of employment" },
                            ].map((item) => (
                                <div key={item.key} className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-white">{item.title}</Label>
                                        <p className="text-sm text-slate-400">{item.desc}</p>
                                    </div>
                                    <Switch
                                        checked={!!formData[item.key]}
                                        onCheckedChange={(checked) => updateField(item.key, checked)}
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {showParticipantPicker && (
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Participants
                            </CardTitle>
                        </CardHeader>

                        <CardContent>
                            <div className="relative mb-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <Input
                                    placeholder="Search participants..."
                                    value={participantSearch}
                                    onChange={(e) => setParticipantSearch(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white pl-10"
                                />
                            </div>

                            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-800">
                                {activeParticipants.map((p) => {
                                    const checked = selectedParticipantIds.includes(p.id);
                                    return (
                                        <label
                                            key={p.id}
                                            className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40 cursor-pointer"
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() => {
                                                    setSelectedParticipantIds((prev) =>
                                                        checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                                                    );
                                                }}
                                            />
                                            <div className="min-w-0">
                                                <div className="text-white truncate">{safeName(p)}</div>
                                                {p?.status ? (
                                                    <div className="text-xs text-slate-500">{String(p.status)}</div>
                                                ) : null}
                                            </div>
                                        </label>
                                    );
                                })}

                                {activeParticipants.length === 0 ? (
                                    <div className="p-3 text-sm text-slate-400">No participants match your search.</div>
                                ) : null}
                            </div>

                            <div className="mt-3 text-sm text-slate-400">
                                Selected: <span className="text-white">{selectedParticipantIds.length}</span>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="flex justify-end gap-3">
                    {embedded ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="border-slate-700"
                            onClick={() => onClose?.()}
                        >
                            Cancel
                        </Button>
                    ) : (
                        <Link
                            to={
                                selectedParticipantId
                                    ? createPageUrl(`ParticipantDetail?id=${selectedParticipantId}`)
                                    : createPageUrl("Dashboard")
                            }
                        >
                            <Button type="button" variant="outline" className="border-slate-700">
                                Cancel
                            </Button>
                        </Link>
                    )}

                    <Button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={
                            saveMutation.isPending ||
                            (!isEditing && selectedParticipantIds.length === 0) ||
                            (formData.industry_type === "Other" && !String(formData.industry_type_other || "").trim())
                        }
                        title={
                            formData.industry_type === "Other" && !String(formData.industry_type_other || "").trim()
                                ? "Please enter an industry for Other"
                                : undefined
                        }
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saveMutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"} Employment
                    </Button>
                </div>
            </form>
        </div>
    );
}
