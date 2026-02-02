import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, DollarSign, Users, FolderKanban, AlertCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

// helpers
function isActiveParticipant(p) {
    const s = (p?.status || "").toString().trim().toLowerCase();
    if (!s) return true;
    return s === "active";
}
function safeName(p) {
    const fn = (p?.first_name || "").toString().trim();
    const ln = (p?.last_name || "").toString().trim();
    const full = `${fn} ${ln}`.trim();
    return full || p?.full_name || "Unnamed";
}

export default function FundingForm({
    embedded = false,
    participantId: embeddedParticipantId = "",
    fundingId: embeddedFundingId = "",
    onClose,
    onSaved,
} = {}) {
    const urlParams = new URLSearchParams(window.location.search);
    const fundingId = embedded ? embeddedFundingId : urlParams.get("id");
    const preselectedParticipantId = embedded ? embeddedParticipantId : urlParams.get("participant_id");
    const preselectedProgramId = urlParams.get("program_id"); // fine in embedded too
    const isEditing = !!fundingId;

    const queryClient = useQueryClient();
    const [participantSearch, setParticipantSearch] = useState("");
    const [programSearch, setProgramSearch] = useState("");

    const [quoteFile, setQuoteFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    const [formData, setFormData] = useState({
        record_type: "Expense",
        linked_program_ids: preselectedProgramId ? [preselectedProgramId] : [],
        linked_participant_ids: preselectedParticipantId ? [preselectedParticipantId] : [],
        funding_source_name: "",
        category: "Other",
        amount: "",
        funding_date: new Date().toISOString().split("T")[0],
        invoice_number: "",
        description: "",
        dex_reporting_flag: false,
        supplier_name: "",
        supplier_is_indigenous: "Unknown", // Yes | No | Unknown
        quote_file_url: "",
    });

    // embedded => force single participant
    useEffect(() => {
        if (!embedded) return;
        if (embeddedParticipantId) {
            setFormData((prev) => ({ ...prev, linked_participant_ids: [embeddedParticipantId] }));
        }
    }, [embedded, embeddedParticipantId]);

    const updateField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

    const toggleIdInArray = (field, id) => {
        setFormData((prev) => {
            const arr = prev[field] || [];
            const exists = arr.includes(id);
            return { ...prev, [field]: exists ? arr.filter((x) => x !== id) : [...arr, id] };
        });
    };

    const { data: existingFunding, isLoading: loadingFunding } = useQuery({
        queryKey: ["fundingRecord", fundingId],
        queryFn: () => base44.entities.FundingRecord.get(fundingId),
        enabled: isEditing,
    });

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 5000),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 2000),
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (!existingFunding) return;

        setFormData((prev) => ({
            ...prev,
            record_type: existingFunding.record_type || "Expense",
            linked_program_ids:
                existingFunding.linked_program_ids || (existingFunding.program_id ? [existingFunding.program_id] : []),
            linked_participant_ids:
                embedded && embeddedParticipantId
                    ? [embeddedParticipantId]
                    : existingFunding.linked_participant_ids || [],
            funding_source_name: existingFunding.funding_source_name || "",
            category: existingFunding.category || "Other",
            amount: existingFunding.amount ?? "",
            funding_date: existingFunding.funding_date || "",
            invoice_number: existingFunding.invoice_number || "",
            description: existingFunding.description || "",
            dex_reporting_flag: !!existingFunding.dex_reporting_flag,
            supplier_name: existingFunding.supplier_name || "",
            supplier_is_indigenous:
                existingFunding.supplier_is_indigenous === true ? "Yes"
                    : existingFunding.supplier_is_indigenous === false ? "No"
                        : "Unknown",
            quote_file_url: existingFunding.quote_file_url || "",
        }));
    }, [existingFunding, embedded, embeddedParticipantId]);

    const activeParticipants = useMemo(() => {
        const s = participantSearch.trim().toLowerCase();
        return (participants || [])
            .filter(isActiveParticipant)
            .filter((p) => (!s ? true : safeName(p).toLowerCase().includes(s)))
            .sort((a, b) => safeName(a).localeCompare(safeName(b)));
    }, [participants, participantSearch]);

    const activePrograms = useMemo(() => {
        const s = programSearch.trim().toLowerCase();
        return (programs || [])
            .filter((p) => {
                const st = (p?.status || "").toString().trim().toLowerCase();
                if (!st) return true;
                return st === "active";
            })
            .filter((p) => {
                if (!s) return true;
                const hay = `${p.program_name || ""} ${p.contract_code || p.contractCode || ""}`.toLowerCase();
                return hay.includes(s);
            })
            .sort((a, b) => (a.program_name || "").localeCompare(b.program_name || ""));
    }, [programs, programSearch]);

    const linkedProgramIds = formData.linked_program_ids || [];
    const hasLinkedProgram = linkedProgramIds.length > 0;
    const isSingleProgram = linkedProgramIds.length === 1;
    const singleProgramId = isSingleProgram ? linkedProgramIds[0] : null;

    const selectedProgram = useMemo(() => {
        if (!singleProgramId) return null;
        return (programs || []).find((p) => p.id === singleProgramId) || null;
    }, [programs, singleProgramId]);

    const categoryOptions = useMemo(() => {
        const fallback = ["Travel", "Training", "Support", "Wages Subsidy", "Equipment", "Materials", "Other"];
        const cats = selectedProgram?.budget_categories;
        if (!Array.isArray(cats) || cats.length === 0) return fallback;

        const programCats = cats
            .map((c) => (c?.category || "").toString().trim())
            .filter(Boolean);

        const unique = [];
        for (const c of programCats) if (!unique.includes(c)) unique.push(c);
        if (!unique.includes("Other")) unique.push("Other");
        return unique.length > 0 ? unique : fallback;
    }, [selectedProgram]);

    const categoryInvalid = hasLinkedProgram && (!formData.category || !String(formData.category).trim());

    const selectedCount = (formData.linked_participant_ids || []).length;
    const amountPerParticipant = selectedCount > 0 && formData.amount ? Number(formData.amount).toFixed(2) : 0;

    const backHref = preselectedParticipantId
        ? createPageUrl(`ParticipantDetail?id=${preselectedParticipantId}`)
        : preselectedProgramId
            ? createPageUrl(`ProgramDetail?id=${preselectedProgramId}`)
            : createPageUrl("Dashboard");

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            const user = await base44.auth.me().catch(() => null);

            const linkedProgramsNow = data.linked_program_ids || [];
            const linkedToProgramNow = linkedProgramsNow.length > 0;
            const categoryNow = (data.category || "").toString().trim();

            if (linkedToProgramNow && !categoryNow) {
                throw new Error("Category is required when this record is linked to a program.");
            }

            let quoteUrl = data.quote_file_url || "";
            if (quoteFile) {
                setUploading(true);
                try {
                    const { file_url } = await base44.integrations.Core.UploadFile({ file: quoteFile });
                    quoteUrl = file_url || "";
                } finally {
                    setUploading(false);
                }
            }

            const supplierIsIndigenous =
                data.supplier_is_indigenous === "Yes" ? true
                    : data.supplier_is_indigenous === "No" ? false
                        : null;

            const normalizedProgramId =
                Array.isArray(linkedProgramsNow) && linkedProgramsNow.length === 1
                    ? linkedProgramsNow[0]
                    : null;

            const payload = {
                record_type: data.record_type,
                linked_program_ids: linkedProgramsNow,
                linked_participant_ids: data.linked_participant_ids || [],
                program_id: normalizedProgramId, // compatibility
                funding_source_name: data.funding_source_name || "",
                category: categoryNow || "Other",
                amount: data.amount ? Number(data.amount) : 0,
                funding_date: data.funding_date || new Date().toISOString().split("T")[0],
                invoice_number: data.invoice_number || "",
                description: data.description || "",
                dex_reporting_flag: !!data.dex_reporting_flag,
                supplier_name: data.supplier_name || "",
                supplier_is_indigenous: supplierIsIndigenous,
                quote_file_url: quoteUrl,
            };

            if (isEditing) {
                await base44.entities.FundingRecord.update(fundingId, payload);
                return { id: fundingId };
            }

            const requestData = {
                request_type: "FundingRequest",
                status: "Pending",
                submitted_by_id: user?.id || null,
                submitted_by_name: user?.full_name || user?.display_name || "Unknown",
                submitted_by_email: user?.email || null,
                funding_data: payload,
                attached_file_urls: quoteUrl ? [quoteUrl] : [],
            };

            const req = await base44.entities.WorkflowRequest.create(requestData);
            return { id: req?.id };
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["fundingRecords"] });
            queryClient.invalidateQueries({ queryKey: ["workflowRequests"] });

            onSaved?.(res);

            // Close after save
            if (embedded) {
                onClose?.();
                return;
            }

            if (!isEditing) alert("Funding request submitted for approval.");

            if (preselectedParticipantId) {
                window.location.href = createPageUrl(`ParticipantDetail?id=${preselectedParticipantId}`);
            } else if (preselectedProgramId) {
                window.location.href = createPageUrl(`ProgramDetail?id=${preselectedProgramId}`);
            } else {
                window.location.href = createPageUrl("Dashboard");
            }
        },
    });

    if ((isEditing && loadingFunding) || loadingParticipants || loadingPrograms) return <LoadingSpinner />;

    const showParticipantPicker = !embedded && !preselectedParticipantId;

    return (
        <div className={embedded ? "p-0" : "p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto"}>
            {!embedded && (
                <Link
                    to={backHref}
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            )}

            {!embedded && (
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
                    {isEditing ? "Edit Funding Record" : "New Funding Record"}
                </h1>
            )}

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
                            <DollarSign className="h-5 w-5" />
                            Record Details
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {categoryInvalid && (
                            <Alert className="bg-red-500/10 border-red-500/20">
                                <AlertCircle className="h-4 w-4 text-red-400" />
                                <AlertDescription className="text-red-300">
                                    Category is required when this record is linked to a program.
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Record Type *</Label>
                                <Select value={formData.record_type} onValueChange={(v) => updateField("record_type", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        <SelectItem value="Expense" className="text-white">Expense</SelectItem>
                                        <SelectItem value="FundingAllocation" className="text-white">Funding Allocation</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Category *</Label>
                                <Select value={formData.category} onValueChange={(v) => updateField("category", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {categoryOptions.map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                        {formData.category && !categoryOptions.includes(formData.category) && (
                                            <SelectItem value={formData.category} className="text-white">
                                                {formData.category}
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-slate-300">Total Amount ($) *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.amount}
                                    onChange={(e) => updateField("amount", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="e.g., 500.00"
                                    required
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Date</Label>
                                <Input
                                    type="date"
                                    value={formData.funding_date}
                                    onChange={(e) => updateField("funding_date", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Invoice #</Label>
                                <Input
                                    value={formData.invoice_number}
                                    onChange={(e) => updateField("invoice_number", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="INV-001"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300">Funding Source</Label>
                            <Input
                                value={formData.funding_source_name}
                                onChange={(e) => updateField("funding_source_name", e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Supplier Name</Label>
                            <Input
                                value={formData.supplier_name}
                                onChange={(e) => updateField("supplier_name", e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Is the business Indigenous?</Label>
                            <Select
                                value={formData.supplier_is_indigenous}
                                onValueChange={(v) => updateField("supplier_is_indigenous", v)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    <SelectItem value="Unknown" className="text-white">Unknown</SelectItem>
                                    <SelectItem value="Yes" className="text-white">Yes</SelectItem>
                                    <SelectItem value="No" className="text-white">No</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="text-slate-300">Quote (optional)</Label>
                            <Input
                                type="file"
                                onChange={(e) => setQuoteFile(e.target.files?.[0] || null)}
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                            {uploading ? <p className="text-xs text-slate-400 mt-2">Uploading quote...</p> : null}
                            {formData.quote_file_url ? <p className="text-xs text-slate-500 mt-2">Quote attached</p> : null}
                        </div>

                        <div>
                            <Label className="text-slate-300">Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => updateField("description", e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={3}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Link Programs */}
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <FolderKanban className="h-5 w-5" />
                            Link to Program
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search programs..."
                                value={programSearch}
                                onChange={(e) => setProgramSearch(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white pl-10"
                            />
                        </div>

                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {activePrograms.map((program) => (
                                <label
                                    key={program.id}
                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={(formData.linked_program_ids || []).includes(program.id)}
                                        onCheckedChange={() => toggleIdInArray("linked_program_ids", program.id)}
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-white">{program.program_name}</span>
                                        {(program.contract_code || program.contractCode) ? (
                                            <span className="text-xs text-slate-400">
                                                {program.contract_code || program.contractCode}
                                            </span>
                                        ) : null}
                                    </div>
                                </label>
                            ))}
                        </div>

                        {formData.linked_program_ids.length > 0 ? (
                            <p className="text-sm text-slate-400 mt-3">
                                {formData.linked_program_ids.length} program(s) selected
                            </p>
                        ) : null}
                    </CardContent>
                </Card>

                {/* Link Participants */}
                {showParticipantPicker && (
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Link Participants
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
                                {activeParticipants.map((participant) => (
                                    <label
                                        key={participant.id}
                                        className="flex items-center gap-3 p-3 hover:bg-slate-800/50 cursor-pointer"
                                    >
                                        <Checkbox
                                            checked={formData.linked_participant_ids.includes(participant.id)}
                                            onCheckedChange={() => toggleIdInArray("linked_participant_ids", participant.id)}
                                        />
                                        <span className="text-white">{safeName(participant)}</span>
                                    </label>
                                ))}
                            </div>

                            {formData.linked_participant_ids.length > 0 && (
                                <p className="text-sm text-slate-400 mt-3">
                                    {formData.linked_participant_ids.length} participant(s) selected
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Embedded participant always linked */}
                {embedded && embeddedParticipantId ? null : null}

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white">Reporting</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-white">DEX Reportable</Label>
                                <p className="text-sm text-slate-400">Include in DEX reporting exports</p>
                            </div>
                            <Switch
                                checked={formData.dex_reporting_flag}
                                onCheckedChange={(checked) => updateField("dex_reporting_flag", checked)}
                            />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                    {embedded ? (
                        <Button type="button" variant="outline" className="border-slate-700" onClick={() => onClose?.()}>
                            Cancel
                        </Button>
                    ) : (
                        <Link to={backHref}>
                            <Button type="button" variant="outline" className="border-slate-700">
                                Cancel
                            </Button>
                        </Link>
                    )}

                    <Button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={saveMutation.isPending || uploading || categoryInvalid}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saveMutation.isPending ? "Saving..." : isEditing ? "Update" : "Create"} Record
                    </Button>
                </div>
            </form>
        </div>
    );
}
