// src/pages/ParticipantRequest.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    ArrowLeft,
    Save,
    User,
    Phone,
    Upload,
    FileText,
    X,
    FolderKanban,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

async function uploadFilesViaBase44(files) {
    const urls = [];
    for (const file of files) {
        const res = await base44.integrations.Core.UploadFile({ file });
        if (res?.file_url) urls.push(res.file_url);
        else if (res?.url) urls.push(res.url);
    }
    return urls;
}

// Fetch PdfFormInstances by workflow_request_id robustly (fallback-friendly)
async function listPdfFormInstancesByWorkflowRequest(workflowRequestId) {
    const tryList = async (args) => {
        const rows = await base44.entities.PdfFormInstance.list(...args).catch(() => null);
        return Array.isArray(rows) ? rows : null;
    };

    const a = await tryList(["-created_date", 500]);
    const b = a || (await tryList(["-createdAt", 500]));
    const c = b || (await tryList([]));

    const all = Array.isArray(c) ? c : [];
    return all.filter((x) => x.workflow_request_id === workflowRequestId);
}

function safeTrim(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
}

export default function ParticipantRequest() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        first_name: "",
        last_name: "",
        date_of_birth: "",
        gender: "",
        indigenous_status: "",
        contact_email: "",
        contact_phone: "",
        address_line1: "",
        suburb: "",
        state: "",
        postcode: "",
    });

    const [selectedProgramIds, setSelectedProgramIds] = useState([]);
    const [selectedIntakeId, setSelectedIntakeId] = useState("");
    const [attachedFiles, setAttachedFiles] = useState([]);

    const updateField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

    const { data: user, isLoading: loadingUser } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list(),
    });

    const { data: intakes = [], isLoading: loadingIntakes } = useQuery({
        queryKey: ["programIntakes"],
        queryFn: () => base44.entities.ProgramIntake.list("-start_date", 100),
    });

    const { data: allUsers = [], isLoading: loadingAllUsers } = useQuery({
        queryKey: ["allUsers"],
        queryFn: () => base44.entities.User.list(),
    });

    const activePrograms = useMemo(
        () => (programs || []).filter((p) => p.status === "Active"),
        [programs]
    );

    const filteredIntakes = useMemo(() => {
        if (!selectedProgramIds.length) return [];
        return (intakes || []).filter(
            (i) =>
                selectedProgramIds.includes(i.program_id) &&
                (i.status === "Open" || i.status === "Upcoming")
        );
    }, [intakes, selectedProgramIds]);

    const submitMutation = useMutation({
        mutationFn: async (data) => {
            if (!user?.id) throw new Error("You must be logged in to submit a request.");
            if (!selectedProgramIds.length) throw new Error("Select at least 1 program.");

            const firstName = safeTrim(data.first_name);
            const lastName = safeTrim(data.last_name);
            if (!firstName || !lastName) throw new Error("First name and last name are required.");

            const fileUrls = attachedFiles.length ? await uploadFilesViaBase44(attachedFiles) : [];

            // Create WorkflowRequest (pre-approval, participant not created yet)
            const requestPayload = {
                request_type: "ParticipantRequest",
                status: "Pending",

                submitted_by_id: user.id,
                submitted_by_name: user.full_name || user.displayName || "Unknown",
                submitted_by_email: user.email || null,

                participant_data: data, // keep existing field for your workflow

                attached_file_urls: fileUrls,
                requested_program_ids: selectedProgramIds,
                requested_intake_id: selectedIntakeId || null,
            };

            const created = await base44.entities.WorkflowRequest.create(requestPayload);
            const workflowRequestId = created?.id;
            if (!workflowRequestId) throw new Error("Workflow request created but no ID returned.");

            // Allocate PDF forms for this workflow request.
            // IMPORTANT: This must match your Cloud Function name + parameter names.
            // Per your functions/index.js earlier: allocatePdfForms({ workflowRequestId, trigger, programIds })
            const allocateRes = await base44.functions.allocatePdfForms({
                workflowRequestId,
                trigger: "participant_submit_for_approval",
                programIds: selectedProgramIds,
            });

            // Resolve created instances
            let instances = [];

            // If function returns instance ids, prefer that.
            const returnedIds = Array.isArray(allocateRes?.instanceIds)
                ? allocateRes.instanceIds
                : Array.isArray(allocateRes?.createdInstanceIds)
                    ? allocateRes.createdInstanceIds
                    : null;

            if (returnedIds && returnedIds.length) {
                // Load all returned instances (so we can write snapshot)
                instances = await Promise.all(
                    returnedIds.map((id) => base44.entities.PdfFormInstance.get(id).catch(() => null))
                );
                instances = instances.filter(Boolean);
            } else {
                // Fallback - list from DB and filter
                instances = await listPdfFormInstancesByWorkflowRequest(workflowRequestId);
            }

            // If no instances, fail loudly (this is the critical correctness check)
            if (!instances.length) {
                throw new Error(
                    "PDF allocation ran, but no PdfFormInstance records were found. Ensure allocatePdfForms is creating PdfFormInstance documents with workflow_request_id."
                );
            }

            // Ensure prefill works pre-approval:
            // PdfFormFill.jsx will use instance.participant_snapshot if Participant doc does not exist yet.
            // We stamp participant_snapshot into every allocated instance.
            const participantSnapshot = {
                ...data,
                // Optional friendly computed fields your resolver may use later:
                full_name: `${firstName} ${lastName}`.trim(),
            };

            await Promise.all(
                instances.map((inst) =>
                    base44.entities.PdfFormInstance.update(inst.id, {
                        participant_snapshot: participantSnapshot,
                        // helps signature role logic in PdfFormFill:
                        actor_role: "caseworker",
                    }).catch(() => null)
                )
            );

            // Optional: notify approvers (best-effort)
            const approvers = (allUsers || []).filter(
                (u) =>
                    u.app_role === "SystemAdmin" ||
                    u.app_role === "Manager" ||
                    u.app_role === "ContractsAdmin"
            );

            const approverEmails = approvers.map((u) => u.email).filter(Boolean);
            const fullName = `${firstName} ${lastName}`.trim() || "a participant";

            if (approverEmails.length) {
                await Promise.all(
                    approverEmails.map((email) =>
                        base44.integrations.Core.SendEmail({
                            to: email,
                            subject: "New Participant Request Pending Approval",
                            body: `A new participant request for ${fullName} was submitted by ${requestPayload.submitted_by_name} and requires approval.`,
                        }).catch(() => null)
                    )
                );
            }

            if (user.email) {
                await base44.integrations.Core.SendEmail({
                    to: user.email,
                    subject: "Participant Request Submitted",
                    body: `Your participant request for ${fullName} has been submitted for approval. PDF forms are now ready to complete.`,
                }).catch(() => null);
            }

            // Redirect target: FIRST PDF fill page so case worker can complete now
            const firstInstanceId = instances[0]?.id;
            return { workflowRequestId, firstInstanceId };
        },

        onSuccess: ({ workflowRequestId, firstInstanceId }) => {
            if (firstInstanceId) {
                // Use SPA navigation (preferred), fallback to window.location if needed
                navigate(createPageUrl(`PdfFormFill?id=${encodeURIComponent(firstInstanceId)}`));
                return;
            }
            navigate(createPageUrl(`WorkflowRequestForms?id=${encodeURIComponent(workflowRequestId)}`));
        },
    });

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setAttachedFiles((prev) => [...prev, ...files]);
        e.target.value = "";
    };

    const removeFile = (index) => {
        setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const toggleProgram = (programId, checked) => {
        setSelectedProgramIds((prev) => {
            if (checked) return prev.includes(programId) ? prev : [...prev, programId];
            return prev.filter((id) => id !== programId);
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        submitMutation.mutate(formData);
    };

    if (loadingUser || loadingPrograms || loadingIntakes || loadingAllUsers) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
            <Link
                to={createPageUrl("Dashboard")}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back
            </Link>

            <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
                Request New Participant
            </h1>

            <Alert className="mb-6 bg-blue-500/10 border-blue-500/20">
                <AlertDescription className="text-blue-300">
                    This request will be submitted for approval before the participant is created. After submit, you will be taken to the PDF form fill screen.
                </AlertDescription>
            </Alert>

            {submitMutation.isError ? (
                <Alert className="mb-6 bg-red-500/10 border-red-500/20">
                    <AlertDescription className="text-red-300">
                        {String(submitMutation.error?.message || "Failed to submit request.")}
                    </AlertDescription>
                </Alert>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        </div>

                        <div>
                            <Label className="text-slate-300">Indigenous Status</Label>
                            <Select
                                value={formData.indigenous_status}
                                onValueChange={(v) => updateField("indigenous_status", v)}
                            >
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
                            <Label className="text-slate-300">Address</Label>
                            <Input
                                value={formData.address_line1}
                                onChange={(e) => updateField("address_line1", e.target.value)}
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
                            <FolderKanban className="h-5 w-5" />
                            Program and Intake
                        </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-slate-300">Programs to Enroll *</Label>
                            <div className="max-h-40 overflow-y-auto space-y-2 mt-2 p-3 bg-slate-800/50 rounded-lg">
                                {activePrograms.map((program) => (
                                    <label key={program.id} className="flex items-center gap-3 cursor-pointer">
                                        <Checkbox
                                            checked={selectedProgramIds.includes(program.id)}
                                            onCheckedChange={(checked) => toggleProgram(program.id, !!checked)}
                                        />
                                        <span className="text-white">{program.program_name}</span>
                                    </label>
                                ))}
                            </div>

                            {selectedProgramIds.length > 0 ? (
                                <p className="text-sm text-slate-400 mt-2">{selectedProgramIds.length} program(s) selected</p>
                            ) : (
                                <p className="text-sm text-amber-300 mt-2">Select at least 1 program to submit.</p>
                            )}
                        </div>

                        {selectedProgramIds.length > 0 ? (
                            <div>
                                <Label className="text-slate-300">Intake (optional)</Label>
                                <Select value={selectedIntakeId} onValueChange={setSelectedIntakeId}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select intake" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {filteredIntakes.map((intake) => (
                                            <SelectItem key={intake.id} value={intake.id} className="text-white">
                                                {intake.intake_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Upload className="h-5 w-5" />
                            Attachments
                        </CardTitle>
                    </CardHeader>

                    <CardContent>
                        <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center">
                            <input type="file" multiple onChange={handleFileUpload} className="hidden" id="file-upload" />
                            <label htmlFor="file-upload" className="cursor-pointer">
                                <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                                <p className="text-slate-400">Click to upload files</p>
                                <p className="text-sm text-slate-500">ID, consent forms, or other documents</p>
                            </label>
                        </div>

                        {attachedFiles.length > 0 ? (
                            <div className="mt-4 space-y-2">
                                {attachedFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-slate-400" />
                                            <span className="text-white text-sm">{file.name}</span>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeFile(idx)}
                                            className="text-slate-400 hover:text-red-400"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                    <Link to={createPageUrl("Dashboard")}>
                        <Button type="button" variant="outline" className="border-slate-700">
                            Cancel
                        </Button>
                    </Link>

                    <Button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={submitMutation.isPending || selectedProgramIds.length === 0}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {submitMutation.isPending ? "Submitting..." : "Submit Request"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
