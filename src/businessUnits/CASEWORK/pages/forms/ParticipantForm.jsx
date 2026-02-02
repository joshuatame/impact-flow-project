// src/pages/ParticipantForm.jsx
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, User, Phone, AlertCircle } from "lucide-react";
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
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ParticipantForm() {
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(window.location.search);
    const participantId = urlParams.get("id");
    const isEditing = !!participantId;

    const preselectedProgramId = urlParams.get("program_id");
    const preselectedIntakeId = urlParams.get("intake_id");

    const queryClient = useQueryClient();

    const [formData, setFormData] = useState({
        first_name: "",
        last_name: "",
        date_of_birth: "",
        gender: "",
        indigenous_status: "",
        contact_email: "",
        contact_phone: "",
        address_line1: "",
        address_line2: "",
        suburb: "",
        state: "",
        postcode: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        primary_case_worker_id: "",
        current_phase: "Pre Employment Support",
        status: "Active",
        dex_id: "",
    });

    const { data: currentUser, isLoading: loadingUser } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    // UI-only: view_as_role must never grant permissions.
    const viewAsRole = currentUser?.view_as_role || null;
    const effectiveRole = viewAsRole || currentUser?.app_role || null;

    const canEditDexId = ["SystemAdmin", "Manager", "ContractsAdmin"].includes(effectiveRole || "");
    const isApprovedForDexId = isEditing; // Only allow DEXid edits on existing participants

    const {
        data: existingParticipant,
        isLoading: loadingParticipant,
    } = useQuery({
        queryKey: ["participant", participantId],
        queryFn: () => base44.entities.Participant.get(participantId),
        enabled: isEditing,
    });

    const { data: usersRaw = [], isLoading: loadingUsers } = useQuery({
        queryKey: ["users"],
        queryFn: () => base44.entities.User.list(),
    });

    const users = useMemo(() => {
        const arr = Array.isArray(usersRaw) ? usersRaw : [];
        if (effectiveRole === "ClientCaseWorker") {
            return arr.filter((u) => u.app_role !== "SystemAdmin");
        }
        return arr;
    }, [usersRaw, effectiveRole]);

    useEffect(() => {
        if (!existingParticipant) return;

        setFormData({
            first_name: existingParticipant.first_name || "",
            last_name: existingParticipant.last_name || "",
            date_of_birth: existingParticipant.date_of_birth || "",
            gender: existingParticipant.gender || "",
            indigenous_status: existingParticipant.indigenous_status || "",
            contact_email: existingParticipant.contact_email || "",
            contact_phone: existingParticipant.contact_phone || "",
            address_line1: existingParticipant.address_line1 || "",
            address_line2: existingParticipant.address_line2 || "",
            suburb: existingParticipant.suburb || "",
            state: existingParticipant.state || "",
            postcode: existingParticipant.postcode || "",
            emergency_contact_name: existingParticipant.emergency_contact_name || "",
            emergency_contact_phone: existingParticipant.emergency_contact_phone || "",
            primary_case_worker_id: existingParticipant.primary_case_worker_id || "",
            current_phase: existingParticipant.current_phase || "Pre Employment Support",
            status: existingParticipant.status || "Active",
            dex_id: existingParticipant.dex_id || "",
        });
    }, [existingParticipant]);

    const updateField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

    const submitMutation = useMutation({
        mutationFn: async (data) => {
            if (isEditing) {
                await base44.entities.Participant.update(participantId, data);
                return { mode: "updated", id: participantId };
            }

            const payload = {
                request_type: "ParticipantRequest",
                status: "Pending",
                submitted_by_id: currentUser?.id || null,
                submitted_by_name: currentUser?.full_name || currentUser?.display_name || "Unknown",
                submitted_by_email: currentUser?.email || null,
                participant_data: { ...data },
                requested_program_ids: preselectedProgramId ? [preselectedProgramId] : [],
                requested_intake_id: preselectedIntakeId || null,
                attached_file_urls: [],
            };

            const req = await base44.entities.WorkflowRequest.create(payload);
            return { mode: "requested", id: req?.id };
        },
        onSuccess: async (result) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["workflowRequests"] }),
                queryClient.refetchQueries({ queryKey: ["workflowRequests"] }),
            ]);

            if (result.mode === "updated") {
                navigate(createPageUrl(`ParticipantDetail?id=${result.id}`));
                return;
            }

            alert("Participant request submitted for approval.");

            try {
                await base44.functions.allocatePdfFormsForWorkflowRequest({
                    workflowRequestId: result.id,
                    eventType: "participant_submit_for_approval",
                });
            } catch (e) {
                console.warn("PDF allocation failed (continuing):", e);
            }

            navigate(createPageUrl(`PdfPacketReview?wr=${encodeURIComponent(result.id)}`));
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        submitMutation.mutate(formData);
    };

    if (loadingUser || loadingUsers) return <LoadingSpinner />;
    if (isEditing && loadingParticipant) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
            <Link
                to={isEditing ? createPageUrl(`ParticipantDetail?id=${participantId}`) : createPageUrl("Participants")}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back
            </Link>

            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {isEditing ? "Edit Participant" : "Add New Participant"}
            </h1>

            {!isEditing && (
                <Alert className="mb-6 bg-blue-500/10 border-blue-500/20">
                    <AlertCircle className="h-4 w-4 text-blue-400" />
                    <AlertDescription className="text-blue-300">
                        This will submit a Participant Request for approval. The participant will not appear in the system until approved by
                        Manager, ContractsAdmin, or SystemAdmin.
                    </AlertDescription>
                </Alert>
            )}

            {submitMutation.isError ? (
                <p className="mb-6 text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {String(submitMutation.error?.message || "Failed to save participant.")}
                </p>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Personal Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">First Name *</Label>
                                <Input
                                    value={formData.first_name}
                                    onChange={(e) => updateField("first_name", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    required
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Last Name *</Label>
                                <Input
                                    value={formData.last_name}
                                    onChange={(e) => updateField("last_name", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-slate-300">Date of Birth</Label>
                                <Input
                                    type="date"
                                    value={formData.date_of_birth}
                                    onChange={(e) => updateField("date_of_birth", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Gender</Label>
                                <Select value={formData.gender} onValueChange={(v) => updateField("gender", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Male", "Female", "Non-Binary", "Other", "Prefer not to say"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Indigenous Status</Label>
                                <Select value={formData.indigenous_status} onValueChange={(v) => updateField("indigenous_status", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Aboriginal", "Torres Strait Islander", "Both", "None"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Phone className="h-5 w-5" />
                            Contact Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Email</Label>
                                <Input
                                    type="email"
                                    value={formData.contact_email}
                                    onChange={(e) => updateField("contact_email", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Phone</Label>
                                <Input
                                    value={formData.contact_phone}
                                    onChange={(e) => updateField("contact_phone", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300">Address Line 1</Label>
                            <Input
                                value={formData.address_line1}
                                onChange={(e) => updateField("address_line1", e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Address Line 2</Label>
                            <Input
                                value={formData.address_line2}
                                onChange={(e) => updateField("address_line2", e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                            />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-slate-300">Suburb</Label>
                                <Input
                                    value={formData.suburb}
                                    onChange={(e) => updateField("suburb", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">State</Label>
                                <Select value={formData.state} onValueChange={(v) => updateField("state", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Postcode</Label>
                                <Input
                                    value={formData.postcode}
                                    onChange={(e) => updateField("postcode", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Emergency Contact
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Name</Label>
                                <Input
                                    value={formData.emergency_contact_name}
                                    onChange={(e) => updateField("emergency_contact_name", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">Phone</Label>
                                <Input
                                    value={formData.emergency_contact_phone}
                                    onChange={(e) => updateField("emergency_contact_phone", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white">Case Management</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-slate-300">Primary Case Worker</Label>
                                <Select value={formData.primary_case_worker_id} onValueChange={(v) => updateField("primary_case_worker_id", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select worker" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {users
                                            .filter((u) => u.is_active !== false)
                                            .map((u) => (
                                                <SelectItem key={u.id} value={u.id} className="text-white">
                                                    {u.full_name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Current Phase</Label>
                                <Select value={formData.current_phase} onValueChange={(v) => updateField("current_phase", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {[
                                            "Pre Employment Support",
                                            "Training",
                                            "Employment",
                                            "Mentoring",
                                            "Exit",
                                            "Withdrawn",
                                            "Disengaged",
                                            "Training Commenced",
                                            "Training Engagement",
                                            "Training Completed",
                                            "Employment Commenced",
                                            "Employment Engagement",
                                            "Employment Sustained",
                                        ].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Status</Label>
                                <Select value={formData.status} onValueChange={(v) => updateField("status", v)}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {["Active", "Inactive", "Completed", "Withdrawn"].map((opt) => (
                                            <SelectItem key={opt} value={opt} className="text-white">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">DEXid</Label>
                                <Input
                                    value={formData.dex_id || ""}
                                    onChange={(e) => updateField("dex_id", e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="DEX identifier (post approval)"
                                    disabled={!isEditing || !canEditDexId || !isApprovedForDexId}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                    <Link to={isEditing ? createPageUrl(`ParticipantDetail?id=${participantId}`) : createPageUrl("Participants")}>
                        <Button type="button" variant="outline" className="border-slate-700">
                            Cancel
                        </Button>
                    </Link>

                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={submitMutation.isPending}>
                        <Save className="h-4 w-4 mr-2" />
                        {submitMutation.isPending ? "Saving..." : isEditing ? "Update Participant" : "Submit for Approval"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
