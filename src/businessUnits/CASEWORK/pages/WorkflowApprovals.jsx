// src/pages/WorkflowApprovals.jsx
import React, { useMemo, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { db } from "@/firebase";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    CheckCircle,
    XCircle,
    Clock,
    User,
    DollarSign,
    FileText,
    Eye,
    AlertCircle,
    Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createPageUrl } from "@/utils";

async function safeListWorkflowRequests() {
    try {
        const a = await base44.entities.WorkflowRequest.list("-created_date", 200);
        if (Array.isArray(a)) return a;
    } catch (_) { }

    try {
        const b = await base44.entities.WorkflowRequest.list("-createdAt", 200);
        if (Array.isArray(b)) return b;
    } catch (_) { }

    const c = await base44.entities.WorkflowRequest.list();
    return Array.isArray(c) ? c : [];
}

async function safeListFundingRecords() {
    try {
        const a = await base44.entities.FundingRecord.list("-funding_date", 2000);
        return Array.isArray(a) ? a : [];
    } catch (_) {
        const b = await base44.entities.FundingRecord.list();
        return Array.isArray(b) ? b : [];
    }
}

function sumAmounts(rows) {
    return rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
}

function normalizeFundingPayloadForProgramBudget(fundingData) {
    const data = fundingData || {};
    const linkedProgramIds = Array.isArray(data.linked_program_ids) ? data.linked_program_ids : [];

    const normalizedProgramId =
        linkedProgramIds.length === 1 ? linkedProgramIds[0] : (data.program_id || null);

    const category = (data.category || "").toString().trim();
    const supplierName = (data.supplier_name || "").toString().trim();

    return {
        ...data,
        linked_program_ids: linkedProgramIds,
        program_id: normalizedProgramId,
        category: category || (linkedProgramIds.length > 0 ? "" : "Other"),
        supplier_name: supplierName,
        // optional pass-through if you add it to FundingForm/requests:
        budget_line_id: data.budget_line_id || null,
    };
}

function isApproverRole(role) {
    return role === "SystemAdmin" || role === "ContractsAdmin" || role === "Manager";
}

    const DEFAULT_ONBOARDING_TASKS = [
    {
        "title": "Complete Intake Survey",
        "task_type": "Survey",
        "priority": "High",
        "due_days": 1
    },
    {
        "title": "Confirm Consent & Privacy",
        "task_type": "Consent",
        "priority": "High",
        "due_days": 1
    },
    {
        "title": "Add Emergency Contact Details",
        "task_type": "Emergency Contact",
        "priority": "High",
        "due_days": 2
    },
    {
        "title": "Upload ID Documents",
        "task_type": "Document Upload",
        "priority": "High",
        "due_days": 3
    },
    {
        "title": "Create Initial Action Plan",
        "task_type": "Action Plan",
        "priority": "Medium",
        "due_days": 7
    },
    {
        "title": "Schedule First Appointment",
        "task_type": "Appointment",
        "priority": "Medium",
        "due_days": 7
    },
    {
        "title": "Record Baseline Employment Status",
        "task_type": "Employment Baseline",
        "priority": "Medium",
        "due_days": 7
    },
    {
        "title": "Set Participant Goals",
        "task_type": "Goals",
        "priority": "Medium",
        "due_days": 7
    },
    {
        "title": "Initial Case Note",
        "task_type": "Case Note",
        "priority": "Medium",
        "due_days": 7
    }
];


    const ALLOWED_TASK_PRIORITIES = new Set(['Low', 'Medium', 'High']);

function sanitizeOnboardingTasks(value) {
        if (!Array.isArray(value)) return null;
        const out = value
            .filter((t) => t && typeof t === "object")
            .map((t) => {
                const title = String(t.title || "").trim();
                const task_type = String(t.task_type || "").trim();
                let priority = String(t.priority || "").trim() || "Medium";
                if (!ALLOWED_TASK_PRIORITIES.has(priority)) priority = "Medium";
                const due_days_raw = t.due_days;
                const due_days = Number.isFinite(Number(due_days_raw)) ? Math.max(0, Math.floor(Number(due_days_raw))) : null;
                return { title, task_type, priority, due_days };
            })
            .filter((t) => t.title && t.task_type);
        return out.length ? out : null;
    }

export default function WorkflowApprovals() {
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [reviewNotes, setReviewNotes] = useState("");
    const [actionError, setActionError] = useState("");
    const queryClient = useQueryClient();

    // Filter state (pending funding only)
    const [pendingFundingCategoryFilter, setPendingFundingCategoryFilter] = useState("All");
    const [pendingFundingSearch, setPendingFundingSearch] = useState("");

    // PDF forms gating UI (ParticipantRequest only)
    const [pdfGate, setPdfGate] = useState(null); // { total, completed, allCompleted }

    const { data: currentUser, isLoading: loadingUser } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
});

const caseWorkers = useMemo(() => {
    return (users || []).filter((u) => u?.app_role === "ClientCaseWorker" && u?.is_active !== false);
}, [users]);


    const { data: systemSettings = [] } = useQuery({
        queryKey: ["systemSettings"],
        queryFn: async () => {
            const rows = await base44.entities.SystemSettings.list("-created_date");
            return Array.isArray(rows) ? rows : [];
        },
    });

    const onboardingTasksSetting = (systemSettings || []).find(
        (s) => s?.setting_key === "onboarding_tasks" || s?.id === "onboarding_tasks"
    );

    const realRole = currentUser?.app_role;
    const isApprover = isApproverRole(realRole);

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ["workflowRequests"],
        queryFn: safeListWorkflowRequests,
        enabled: true,
        staleTime: 2000,
        refetchInterval: 4000,
        refetchOnWindowFocus: true,
    });

    const pendingRequests = requests.filter((r) => r.status === "Pending" || r.status === "SubmittedForManagerApproval");
    const processedRequests = requests.filter((r) => r.status !== "Pending");

    const pendingFundingRequests = useMemo(() => {
        return pendingRequests.filter((r) => r.request_type === "FundingRequest");
    }, [pendingRequests]);

    const pendingParticipantRequests = useMemo(() => {
        return pendingRequests.filter((r) => r.request_type === "ParticipantRequest");
    }, [pendingRequests]);

    // Build category options from pending funding
    const pendingFundingCategories = useMemo(() => {
        const set = new Set();
        for (const r of pendingFundingRequests) {
            const normalized = normalizeFundingPayloadForProgramBudget(r.funding_data);
            const cat = (normalized.category || "Uncategorised").toString().trim() || "Uncategorised";
            set.add(cat);
        }
        return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
    }, [pendingFundingRequests]);

    const filteredPendingFundingRequests = useMemo(() => {
        const catFilter = pendingFundingCategoryFilter;
        const q = pendingFundingSearch.trim().toLowerCase();

        return pendingFundingRequests.filter((r) => {
            const normalized = normalizeFundingPayloadForProgramBudget(r.funding_data);
            const cat = (normalized.category || "Uncategorised").toString().trim() || "Uncategorised";

            if (catFilter !== "All" && cat !== catFilter) return false;

            if (!q) return true;
            const hay = [
                normalized.description,
                normalized.supplier_name,
                normalized.funding_source_name,
                normalized.invoice_number,
                cat,
                String(normalized.amount ?? ""),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(q);
        });
    }, [pendingFundingRequests, pendingFundingCategoryFilter, pendingFundingSearch]);

    const filteredPendingFundingTotal = useMemo(() => {
        return sumAmounts(
            filteredPendingFundingRequests.map((r) => ({
                amount: normalizeFundingPayloadForProgramBudget(r.funding_data)?.amount,
            }))
        );
    }, [filteredPendingFundingRequests]);

    // Spend snapshot for review dialog (approved records only)
    const spendContext = useMemo(() => {
        if (!selectedRequest) return { participantIds: [], programId: null };
        if (selectedRequest.request_type !== "FundingRequest") return { participantIds: [], programId: null };

        const fd = normalizeFundingPayloadForProgramBudget(selectedRequest.funding_data);
        const participantIds = fd.linked_participant_ids || [];
        const programId = fd.program_id || null;

        return { participantIds, programId };
    }, [selectedRequest]);

    const { data: spendTotals } = useQuery({
        queryKey: ["workflowSpendSnapshot", selectedRequest?.id],
        enabled: !!selectedRequest && selectedRequest.request_type === "FundingRequest",
        queryFn: async () => {
            const all = await safeListFundingRecords();

            const approved = all.filter((r) => {
                const status = String(r.approval_status || "Approved");
                return status.toLowerCase() === "approved";
            });

            const participantRelevant =
                spendContext.participantIds.length > 0
                    ? approved.filter((r) =>
                        (r.linked_participant_ids || []).some((id) =>
                            spendContext.participantIds.includes(id)
                        )
                    )
                    : [];

            const programRelevant = spendContext.programId
                ? approved.filter((r) => {
                    if (r.program_id && r.program_id === spendContext.programId) return true;
                    if (Array.isArray(r.linked_program_ids) && r.linked_program_ids.includes(spendContext.programId))
                        return true;
                    return false;
                })
                : [];

            const participantSpent = sumAmounts(participantRelevant.filter((r) => r.record_type === "Expense"));
            const participantAllocated = sumAmounts(participantRelevant.filter((r) => r.record_type === "FundingAllocation"));

            const programSpent = sumAmounts(programRelevant.filter((r) => r.record_type === "Expense"));
            
const programAllocatedFromFunding = sumAmounts(programRelevant.filter((r) => r.record_type === "FundingAllocation"));

let programAllocated = programAllocatedFromFunding;
if (spendContext.programId) {
    try {
        const program = await base44.entities.Program.get(spendContext.programId);
        const budget = Number(program?.total_funding_amount || 0);
        if (budget > 0) programAllocated = budget;
    } catch (_) {
        // fallback to allocations from funding records
    }
}

            return {
                participantSpent,
                participantAllocated,
                programSpent,
                programAllocated,
            };
        },
    });

    // When opening a ParticipantRequest in the dialog, fetch PDF form completion status for UX
    useEffect(() => {
        let cancelled = false;

        async function loadGate() {
            try {
                setPdfGate(null);

                if (!selectedRequest) return;
                if (selectedRequest.request_type !== "ParticipantRequest") return;

                const res = await base44.functions.checkPdfFormsCompleteForWorkflow({
                    workflowRequestId: selectedRequest.id,
                });

                if (!cancelled) {
                    setPdfGate({
                        total: Number(res?.total || 0),
                        completed: Number(res?.completed || 0),
                        allCompleted: !!res?.allCompleted,
                    });
                }
            } catch (_) {
                if (!cancelled) {
                    // If the function is missing or errors, do not block UI display.
                    setPdfGate(null);
                }
            }
        }

        loadGate();
        return () => {
            cancelled = true;
        };
    }, [selectedRequest]);

    const approveMutation = useMutation({
        mutationFn: async ({ requestId, approved }) => {
            setActionError("");

            // Hard enforcement
            const me = await base44.auth.me();
            if (!isApproverRole(me?.app_role)) {
                throw new Error("You can view requests, but you do not have approval permissions.");
            }

            const request = requests.find((r) => r.id === requestId);
            if (!request) throw new Error("Workflow request not found");

            let createdParticipantId = null;

            if (approved && request.request_type === "ParticipantRequest") {
                // OPTION B GATE:
                // Block approval until all PDF forms for this workflow request are Completed/Migrated.
                const check = await base44.functions.checkPdfFormsCompleteForWorkflow({
                    workflowRequestId: requestId,
                });

                if (!check?.allCompleted) {
                    throw new Error(
                        `Approval blocked. ${check?.completed || 0}/${check?.total || 0} PDF forms completed. Please complete all required forms first.`
                    );
                }

const participantData = { ...(request.participant_data || {}) };

// Manager allocation: prefer explicit allocation on the workflow request.
const allocatedCaseWorkerId =
    request.allocated_case_worker_id ||
    participantData.primary_case_worker_id ||
    participantData.case_worker_id ||
    request.submitted_by_id ||
    null;

if (allocatedCaseWorkerId) {
    participantData.primary_case_worker_id = allocatedCaseWorkerId;
}

const newParticipant = await base44.entities.Participant.create(participantData);
                createdParticipantId = newParticipant.id;

                const fullName =
                    `${participantData.first_name || ""} ${participantData.last_name || ""}`.trim() || "this participant";

                if (request.attached_file_urls?.length > 0) {
                    for (const fileUrl of request.attached_file_urls) {
                        await base44.entities.Document.create({
                            file_name: fileUrl.split("/").pop(),
                            file_url: fileUrl,
                            linked_participant_id: newParticipant.id,
                            uploaded_by_user_id: me?.id,
                            uploaded_by_name: me?.full_name,
                            category: "Other",
                            description: "Attached during participant request approval",
                        });
                    }
                }

                if (request.requested_program_ids?.length > 0) {
                    for (const programId of request.requested_program_ids) {
                        await base44.entities.ParticipantProgramEnrollment.create({
                            participant_id: newParticipant.id,
                            program_id: programId,
                            intake_date: new Date().toISOString().split("T")[0],
                            current_phase: "Pre Employment Support",
                            intake_id: request.requested_intake_id || null,
                        });
                    }
                }

                // Permanently store completed PDFs under participant Documents and tick completion matrix.
                // This creates Document records with category = template.document_category.
                await base44.functions.migratePdfForms({
                    workflowRequestId: requestId,
                    participantId: newParticipant.id,
                }).catch(() => { });

                const onboardingTasks = sanitizeOnboardingTasks(onboardingTasksSetting?.value) || DEFAULT_ONBOARDING_TASKS;
                const primaryCaseWorkerId =
                    request.allocated_case_worker_id || participantData.primary_case_worker_id || participantData.case_worker_id || request.submitted_by_id || null;

                let primaryCaseWorkerName = request.submitted_by_name || "Unknown";
                if (primaryCaseWorkerId) {
                    try {
                        const cw = await base44.entities.User.get(primaryCaseWorkerId);
                        primaryCaseWorkerName = cw?.full_name || cw?.display_name || primaryCaseWorkerName;
                    } catch (_) { }
                }

                for (const task of onboardingTasks) {

const base = new Date();
const days = Number.isFinite(Number(task.due_days)) ? Number(task.due_days) : 7;
const due = new Date(base);
due.setDate(base.getDate() + days);
const dueDateStr = due.toISOString().split("T")[0];

                    await base44.entities.Task.create({
                        ...task,
                        description: `Complete onboarding step for ${fullName}`,
                        linked_participant_id: newParticipant.id,
                        assigned_to_id: primaryCaseWorkerId,
                        assigned_to_name: primaryCaseWorkerName,
                        assigned_by_id: me?.id,
                        assigned_by_name: me?.full_name,
                        status: "Pending",
                        auto_generated: true,
                        requires_confirmation: true,
                        due_date: dueDateStr,
                    });
// Notify the allocated case worker about the onboarding task
if (primaryCaseWorkerId && primaryCaseWorkerId !== me?.id) {
    await base44.entities.Notification.create({
        user_id: primaryCaseWorkerId,
        notification_type: 'task_assigned',
        type: 'task_assigned',
        title: `New onboarding task: ${task.title}`,
        message: `Assigned for ${fullName}`,
        link_url: createPageUrl('Tasks'),
        is_read: false,
        linked_participant_id: newParticipant.id,
    }).catch(() => {});

    await addDoc(collection(db, 'ActivityLog'), {
        activity_type: 'task_assigned',
        message: `Onboarding task assigned: ${task.title}`,
        actor_id: me?.id || null,
        actor_name: me?.full_name || null,
        target_user_id: primaryCaseWorkerId,
        metadata: { linked_participant_id: newParticipant.id, task_title: task.title },
        createdAt: serverTimestamp(),
    }).catch(() => {});
}
                }
            }

            if (approved && request.request_type === "FundingRequest") {
                const normalized = normalizeFundingPayloadForProgramBudget(request.funding_data);

                const linkedPrograms = normalized.linked_program_ids || [];
                const categoryMissing =
                    linkedPrograms.length > 0 && (!normalized.category || !String(normalized.category).trim());
                if (categoryMissing) {
                    throw new Error("Cannot approve a program-linked funding record without a category.");
                }

                // NOTE:
                // Add source_workflow_request_id so program/participant funding screens can open the request copy.
                await base44.entities.FundingRecord.create({
                    ...normalized,
                    source_workflow_request_id: request.id,

                    approval_status: "Approved",
                    approved_by_id: me?.id || null,
                    approved_by_name: me?.full_name || null,
                    approved_date: new Date().toISOString(),
                });

                // DEX: Support Provided (only on approval) for DEX-reportable program enrollments
                try {
                    const linkedParticipantIds = Array.isArray(normalized.linked_participant_ids)
                        ? normalized.linked_participant_ids
                        : (normalized.participant_id ? [normalized.participant_id] : []);
                    const linkedProgramIds = Array.isArray(normalized.linked_program_ids)
                        ? normalized.linked_program_ids
                        : (normalized.program_id ? [normalized.program_id] : []);

                    for (const pid of linkedParticipantIds) {
                        const participant = pid ? await base44.entities.Participant.get(pid) : null;
                        const participantName =
                            participant?.full_name ||
                            `${participant?.first_name || ""} ${participant?.last_name || ""}`.trim();

                        for (const programId of linkedProgramIds) {
                            if (!programId) continue;

                            const enrollments = await base44.entities.ParticipantProgramEnrollment.filter({
                                participant_id: pid,
                                program_id: programId,
                            });

                            const ppe = (enrollments || [])[0];
                            if (!ppe?.is_dex_reportable_program) continue;

                            await base44.entities.DEXActivityRecord.create({
                                participant_id: pid,
                                participant_name: participantName || null,
                                program_id: programId,
                                case_location: ppe?.dex_case_location || null,
                                service_setting: null,
                                activity_date: new Date().toISOString().split("T")[0],
                                reference_entity_type: "FundingRecord",
                                reference_entity_id: request.id,
                                activity_type: "Support Provided",
                                details: {
                                    category: normalized.category || null,
                                    amount: normalized.amount || null,
                                    supplier_name: normalized.supplier_name || null,
                                    source_workflow_request_id: request.id,
                                },
                                recorded_by_id: me?.id || null,
                                recorded_by_name: me?.full_name || null,
                                recorded_by_email: me?.email || null,
                            });
                        }
                    }
                } catch (e) {
                    console.warn("DEX Support Provided write failed (non-blocking)", e);
                }
            }

            await base44.entities.WorkflowRequest.update(requestId, {
                status: approved ? "Approved" : "Rejected",
                reviewed_by_id: me?.id,
                reviewed_by_name: me?.full_name,
                reviewed_date: new Date().toISOString(),
                review_notes: reviewNotes,
                created_participant_id: createdParticipantId,
            });

            await base44.functions
                .invoke("workflowNotifications", {
                    type: "status_change",
                    requestId,
                    reviewerName: me?.full_name,
                    reviewNotes,
                })
                .catch(console.error);
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["workflowRequests"] }),
                queryClient.invalidateQueries({ queryKey: ["participants"] }),
                queryClient.invalidateQueries({ queryKey: ["participants-list"] }),
                queryClient.invalidateQueries({ queryKey: ["fundingRecords"] }),
                queryClient.invalidateQueries({ queryKey: ["programFunding"] }),
                queryClient.invalidateQueries({ queryKey: ["myTasks"] }),
                queryClient.invalidateQueries({ queryKey: ["tasks"] }),
                queryClient.invalidateQueries({ queryKey: ["notifications"] }),
                queryClient.invalidateQueries({ queryKey: ["documentsAll"] }),
            ]);

            await Promise.all([
                queryClient.refetchQueries({ queryKey: ["workflowRequests"] }),
                queryClient.refetchQueries({ queryKey: ["myTasks"] }),
            ]);

            setSelectedRequest(null);
            setReviewNotes("");
            setActionError("");
            setPdfGate(null);
        },
        onError: (err) => {
            setActionError(err?.message || "Approval action failed.");
        },
    });

    if (loadingUser) return <LoadingSpinner />;
    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="Workflow Approvals"
                subtitle={`${pendingRequests.length} pending approval${pendingRequests.length !== 1 ? "s" : ""}`}
            />

            {!isApprover && (
                <Alert className="mb-6 bg-blue-500/10 border-blue-500/20">
                    <Eye className="h-4 w-4 text-blue-400" />
                    <AlertDescription className="text-blue-300">
                        You have view-only access. Approvals can only be completed by Manager, ContractsAdmin, or SystemAdmin.
                    </AlertDescription>
                </Alert>
            )}

            <Tabs defaultValue="pending" className="space-y-6">
                <TabsList className="bg-slate-900/50 border border-slate-800 p-1">
                    <TabsTrigger value="pending" className="data-[state=active]:bg-slate-800">
                        <Clock className="h-4 w-4 mr-2" />
                        Pending ({pendingRequests.length})
                    </TabsTrigger>
                    <TabsTrigger value="processed" className="data-[state=active]:bg-slate-800">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Processed
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-6">
                    {/* Pending Funding quick filters */}
                    <Card className="bg-slate-900/50 border-slate-800">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center gap-2 text-white font-medium">
                                <Filter className="h-4 w-4" />
                                Pending Funding Filters
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs text-slate-400">Category</label>
                                    <Select value={pendingFundingCategoryFilter} onValueChange={setPendingFundingCategoryFilter}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue placeholder="All" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            {pendingFundingCategories.map((c) => (
                                                <SelectItem key={c} value={c} className="text-white">
                                                    {c}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="text-xs text-slate-400">Search</label>
                                    <Input
                                        value={pendingFundingSearch}
                                        onChange={(e) => setPendingFundingSearch(e.target.value)}
                                        placeholder="Search description, supplier, invoice, source..."
                                        className="bg-slate-800 border-slate-700 text-white"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">
                                    Showing {filteredPendingFundingRequests.length} of {pendingFundingRequests.length} pending funding request(s)
                                </span>
                                <span className="text-white font-semibold">
                                    Total: ${Number(filteredPendingFundingTotal || 0).toLocaleString()}
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pending list */}
                    {pendingRequests.length > 0 ? (
                        <div className="space-y-4">
                            {/* Render funding first (filtered), then participant requests */}
                            {filteredPendingFundingRequests.map((request) => {
                                const fd = normalizeFundingPayloadForProgramBudget(request.funding_data);
                                const categoryLabel = (fd.category || "Uncategorised").toString().trim() || "Uncategorised";
                                const supplierLabel = (fd.supplier_name || "").toString().trim();

                                return (
                                    <Card key={request.id} className="bg-slate-900/50 border-slate-800">
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-4">
                                                    <div className="p-2.5 rounded-xl bg-pink-500/20">
                                                        <DollarSign className="h-5 w-5 text-pink-400" />
                                                    </div>

                                                    <div className="min-w-0">
                                                        <h4 className="font-semibold text-white">
                                                            Funding Request: ${Number(fd.amount || 0).toLocaleString()}
                                                        </h4>

                                                        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-slate-400">
                                                            <span>Submitted by {request.submitted_by_name}</span>
                                                            <span>•</span>
                                                            <span>
                                                                {request.created_date
                                                                    ? format(new Date(request.created_date), "MMM d, yyyy")
                                                                    : request.createdAt
                                                                        ? format(new Date(request.createdAt), "MMM d, yyyy")
                                                                        : "No date"}
                                                            </span>
                                                            <span>•</span>
                                                            <span className="text-slate-300">
                                                                Category: <span className="text-white">{categoryLabel}</span>
                                                            </span>
                                                            {supplierLabel ? (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="text-slate-300">
                                                                        Supplier: <span className="text-white">{supplierLabel}</span>
                                                                    </span>
                                                                </>
                                                            ) : null}
                                                        </div>

                                                        {request.attached_file_urls?.length > 0 && (
                                                            <Badge className="mt-2 bg-slate-700 text-slate-300">
                                                                <FileText className="h-3 w-3 mr-1" />
                                                                {request.attached_file_urls.length} file(s) attached
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setActionError("");
                                                        setSelectedRequest(request);
                                                    }}
                                                    className="border-slate-700"
                                                >
                                                    <Eye className="h-4 w-4 mr-1" />
                                                    Review
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}

                            {pendingParticipantRequests.map((request) => (
                                <Card key={request.id} className="bg-slate-900/50 border-slate-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2.5 rounded-xl bg-blue-500/20">
                                                    <User className="h-5 w-5 text-blue-400" />
                                                </div>

                                                <div>
                                                    <h4 className="font-semibold text-white">
                                                        New Participant: {request.participant_data?.first_name} {request.participant_data?.last_name}
                                                    </h4>

                                                    <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                                                        <span>Submitted by {request.submitted_by_name}</span>
                                                        <span>•</span>
                                                        <span>
                                                            {request.created_date
                                                                ? format(new Date(request.created_date), "MMM d, yyyy")
                                                                : request.createdAt
                                                                    ? format(new Date(request.createdAt), "MMM d, yyyy")
                                                                    : "No date"}
                                                        </span>
                                                    </div>

                                                    {request.attached_file_urls?.length > 0 && (
                                                        <Badge className="mt-2 bg-slate-700 text-slate-300">
                                                            <FileText className="h-3 w-3 mr-1" />
                                                            {request.attached_file_urls.length} file(s) attached
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setActionError("");
                                                    setSelectedRequest(request);
                                                }}
                                                className="border-slate-700"
                                            >
                                                <Eye className="h-4 w-4 mr-1" />
                                                Review
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={CheckCircle} title="No pending approvals" description="All workflow requests have been processed" />
                    )}
                </TabsContent>

                <TabsContent value="processed">
                    {processedRequests.length > 0 ? (
                        <div className="space-y-3">
                            {processedRequests.map((request) => (
                                <Card key={request.id} className="bg-slate-900/50 border-slate-800">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div
                                                    className={`p-2 rounded-xl ${request.status === "Approved" ? "bg-emerald-500/20" : "bg-red-500/20"
                                                        }`}
                                                >
                                                    {request.status === "Approved" ? (
                                                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                                                    ) : (
                                                        <XCircle className="h-5 w-5 text-red-400" />
                                                    )}
                                                </div>

                                                <div>
                                                    <h4 className="font-medium text-white">
                                                        {request.request_type === "ParticipantRequest"
                                                            ? `Participant: ${request.participant_data?.first_name} ${request.participant_data?.last_name}`
                                                            : `Funding: $${request.funding_data?.amount?.toLocaleString()}`}
                                                    </h4>
                                                    <p className="text-sm text-slate-400">
                                                        {request.status} by {request.reviewed_by_name}{" "}
                                                        {request.reviewed_date && `on ${format(new Date(request.reviewed_date), "MMM d, yyyy")}`}
                                                    </p>
                                                </div>
                                            </div>

                                            <Badge
                                                className={
                                                    request.status === "Approved"
                                                        ? "bg-emerald-500/10 text-emerald-400"
                                                        : "bg-red-500/10 text-red-400"
                                                }
                                            >
                                                {request.status}
                                            </Badge>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <EmptyState icon={FileText} title="No processed requests" description="Processed requests will appear here" />
                    )}
                </TabsContent>
            </Tabs>

            {/* Review Dialog */}
            <Dialog
                open={!!selectedRequest}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedRequest(null);
                        setReviewNotes("");
                        setActionError("");
                        setPdfGate(null);
                    }
                }}
            >
                <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white">Review Request</DialogTitle>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="space-y-4 mt-4">
                            {actionError && (
                                <Alert className="bg-red-500/10 border-red-500/20">
                                    <AlertCircle className="h-4 w-4 text-red-400" />
                                    <AlertDescription className="text-red-300">{actionError}</AlertDescription>
                                </Alert>
                            )}

                            {/* Participant PDF gate status (UX only, enforcement happens in approveMutation) */}
                            {selectedRequest.request_type === "ParticipantRequest" && pdfGate && !pdfGate.allCompleted ? (
                                <Alert className="bg-amber-500/10 border-amber-500/20">
                                    <AlertCircle className="h-4 w-4 text-amber-400" />
                                    <AlertDescription className="text-amber-200">
                                        PDF forms incomplete: {pdfGate.completed}/{pdfGate.total}. Approval will be blocked until all required forms are completed.
                                        <div className="mt-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                                                onClick={() => {
                                                    window.location.href = createPageUrl(`ManagerApprovalReview?wr=${selectedRequest.id}`);
                                                }}
                                            >
                                                <FileText className="h-4 w-4 mr-2" />
                                                Review PDFs
                                            </Button>
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            ) : null}

                            <div className="bg-slate-800/50 rounded-lg p-4">
                                <h4 className="font-medium text-white mb-2">Request Details</h4>
                                {selectedRequest.request_type === "ParticipantRequest" ? (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 text-slate-200 hover:bg-slate-800"
                                            onClick={() => {
                                                window.location.href = createPageUrl(`ManagerApprovalReview?wr=${selectedRequest.id}`);
                                            }}
                                        >
                                            <FileText className="h-4 w-4 mr-2" />
                                            Review PDFs
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-slate-700 text-slate-200 hover:bg-slate-800"
                                            onClick={() => {
                                                window.location.href = createPageUrl(`PdfPacketReview?wr=${selectedRequest.id}`);
                                            }}
                                        >
                                            <FileText className="h-4 w-4 mr-2" />
                                            Open PDF Packet
                                        </Button>
                                    </div>
                                ) : null}


                                {selectedRequest.request_type === "ParticipantRequest" && (
                                    <div className="space-y-2 text-sm">
                                        <p className="text-slate-300">
                                            <span className="text-slate-500">Name:</span>{" "}
                                            {selectedRequest.participant_data?.first_name} {selectedRequest.participant_data?.last_name}
                                        </p>
                                        <p className="text-slate-300">
                                            <span className="text-slate-500">Email:</span>{" "}
                                            {selectedRequest.participant_data?.contact_email || "N/A"}
                                        </p>
                                        <p className="text-slate-300">
                                            <span className="text-slate-500">Phone:</span>{" "}
                                            {selectedRequest.participant_data?.contact_phone || "N/A"}
                                        </p>
                                        <p className="text-xs text-slate-500 pt-2 border-t border-slate-700/60">
                                            Note: Participant records are created only after approval.
                                        </p>
                                    </div>
                                )}

                                {selectedRequest.request_type === "FundingRequest" &&
                                    (() => {
                                        const normalized = normalizeFundingPayloadForProgramBudget(selectedRequest.funding_data);
                                        const categoryMissing =
                                            (normalized.linked_program_ids || []).length > 0 &&
                                            (!normalized.category || !String(normalized.category).trim());

                                        return (
                                            <div className="space-y-2 text-sm">
                                                {categoryMissing && (
                                                    <Alert className="bg-red-500/10 border-red-500/20">
                                                        <AlertCircle className="h-4 w-4 text-red-400" />
                                                        <AlertDescription className="text-red-300">
                                                            This funding request is linked to a program but has no category. It cannot be approved
                                                            until it is categorised.
                                                        </AlertDescription>
                                                    </Alert>
                                                )}

                                                <p className="text-slate-300">
                                                    <span className="text-slate-500">Amount:</span> $
                                                    {Number(normalized.amount || 0).toLocaleString()}
                                                </p>
                                                <p className="text-slate-300">
                                                    <span className="text-slate-500">Category:</span>{" "}
                                                    {normalized.category || "Uncategorised"}
                                                </p>
                                                <p className="text-slate-300">
                                                    <span className="text-slate-500">Supplier:</span>{" "}
                                                    {normalized.supplier_name || "N/A"}
                                                </p>
                                                {normalized.budget_line_id ? (
                                                    <p className="text-slate-300">
                                                        <span className="text-slate-500">Budget Line:</span>{" "}
                                                        {normalized.budget_line_id}
                                                    </p>
                                                ) : null}
                                                <p className="text-slate-300">
                                                    <span className="text-slate-500">Description:</span>{" "}
                                                    {normalized.description || "N/A"}
                                                </p>

                                                <div className="mt-3 pt-3 border-t border-slate-700/60">
                                                    <p className="text-white font-medium mb-2">Current Spend</p>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-3">
                                                            <p className="text-xs text-slate-400">Participant Allocated</p>
                                                            <p className="text-white font-semibold">
                                                                ${(spendTotals?.participantAllocated || 0).toLocaleString()}
                                                            </p>
                                                            <p className="text-xs text-slate-400 mt-1">Participant Spent</p>
                                                            <p className="text-white font-semibold">
                                                                ${(spendTotals?.participantSpent || 0).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        <div className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-3">
                                                            <p className="text-xs text-slate-400">Program Allocated</p>
                                                            <p className="text-white font-semibold">
                                                                ${(spendTotals?.programAllocated || 0).toLocaleString()}
                                                            </p>
                                                            <p className="text-xs text-slate-400 mt-1">Program Spent</p>
                                                            <p className="text-white font-semibold">
                                                                ${(spendTotals?.programSpent || 0).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-2">Snapshot includes approved funding records only.</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                            </div>

                            {selectedRequest.attached_file_urls?.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-white mb-2">Attached Files</h4>
                                    <div className="space-y-2">
                                        {selectedRequest.attached_file_urls.map((url, idx) => (
                                            <a
                                                key={idx}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 text-blue-400 hover:underline text-sm"
                                            >
                                                <FileText className="h-4 w-4" />
                                                {url.split("/").pop()}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedRequest?.request_type === "ParticipantRequest" && (
    <div>
        <label className="text-sm text-slate-300">Allocate Primary Case Worker</label>
        <Select
            value={selectedRequest?.allocated_case_worker_id || ""}
            onValueChange={async (val) => {
                try {
                    const picked = caseWorkers.find((u) => u.id === val);
                    await base44.entities.WorkflowRequest.update(selectedRequest.id, {
                        allocated_case_worker_id: val,
                        allocated_case_worker_name: picked?.full_name || picked?.display_name || null,
                    });
                    setSelectedRequest((prev) => ({
                        ...prev,
                        allocated_case_worker_id: val,
                        allocated_case_worker_name: picked?.full_name || picked?.display_name || null,
                    }));
                } catch (e) {
                    console.error("Failed to allocate case worker", e);
                }
            }}
        >
            <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                <SelectValue placeholder="Select a case worker..." />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
                {caseWorkers.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-white">
                        {u.full_name || u.display_name || u.email}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
        <p className="text-xs text-slate-500 mt-1">
            Onboarding tasks will be auto-created and assigned to this case worker.
        </p>
    </div>
)}

<div>
                                <label className="text-sm text-slate-300">Review Notes</label>
                                <Textarea
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white mt-1"
                                    placeholder="Add notes about your decision..."
                                    rows={3}
                                />
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    onClick={() => approveMutation.mutate({ requestId: selectedRequest.id, approved: false })}
                                    disabled={approveMutation.isPending || !isApprover}
                                    variant="outline"
                                    className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                                >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Reject
                                </Button>

                                <Button
                                    onClick={() => approveMutation.mutate({ requestId: selectedRequest.id, approved: true })}
                                    disabled={approveMutation.isPending || !isApprover}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                </Button>
                            </div>

                            {!isApprover && (
                                <p className="text-xs text-slate-500">Approval actions are disabled for your role.</p>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
