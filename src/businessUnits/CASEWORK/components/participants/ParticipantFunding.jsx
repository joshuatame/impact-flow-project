import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, DollarSign, ArrowUpRight, ArrowDownRight, FileText, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import EmptyState from "@/components/ui/EmptyState.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import FundingForm from "@/pages/FundingForm.jsx";

const categoryColors = {
    Travel: "bg-blue-500/10 text-blue-400",
    Training: "bg-emerald-500/10 text-emerald-400",
    Support: "bg-violet-500/10 text-violet-400",
    "Wages Subsidy": "bg-amber-500/10 text-amber-400",
    Equipment: "bg-pink-500/10 text-pink-400",
    Materials: "bg-cyan-500/10 text-cyan-400",
    Other: "bg-slate-500/10 text-slate-400",
    Uncategorised: "bg-slate-500/10 text-slate-400",
};

function safeCategory(cat) {
    const v = (cat || "").toString().trim();
    return v ? v : "Uncategorised";
}

async function safeGetWorkflowRequest(id) {
    if (!id) return null;
    try {
        const doc = await base44.entities.WorkflowRequest.get(id);
        return doc || null;
    } catch (_) {
        try {
            const list = await base44.entities.WorkflowRequest.filter({ id });
            return Array.isArray(list) && list.length > 0 ? list[0] : null;
        } catch (_) {
            return null;
        }
    }
}

export default function ParticipantFunding({ participantId }) {
    const queryClient = useQueryClient();

    // record viewer dialog
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [requestDialogOpen, setRequestDialogOpen] = useState(false);

    // add/edit funding form dialog
    const [formDialogOpen, setFormDialogOpen] = useState(false);
    const [editFundingId, setEditFundingId] = useState(null);

    const { data: fundingRecordsRaw = [], isLoading } = useQuery({
        queryKey: ["fundingRecords", participantId],
        queryFn: async () => {
            const records = await base44.entities.FundingRecord.list("-funding_date", 500);
            const arr = Array.isArray(records) ? records : [];
            return arr.filter((r) => r.linked_participant_ids?.includes(participantId));
        },
        enabled: !!participantId,
    });

    const fundingRecords = useMemo(() => {
        const arr = Array.isArray(fundingRecordsRaw) ? fundingRecordsRaw : [];
        return arr.slice().sort((a, b) => {
            const da = a.funding_date ? new Date(a.funding_date).getTime() : 0;
            const db = b.funding_date ? new Date(b.funding_date).getTime() : 0;
            return db - da;
        });
    }, [fundingRecordsRaw]);

    const sourceRequestId = selectedRecord?.source_workflow_request_id || null;

    const { data: requestCopy, isLoading: loadingRequestCopy } = useQuery({
        queryKey: ["workflowRequestCopy", sourceRequestId],
        queryFn: () => safeGetWorkflowRequest(sourceRequestId),
        enabled: !!sourceRequestId && requestDialogOpen,
    });

    const openRecordDialog = (record) => {
        setSelectedRecord(record);
        setRequestDialogOpen(true);
    };

    const openCreateFunding = () => {
        setEditFundingId(null);
        setFormDialogOpen(true);
    };

    const handleSaved = () => {
        queryClient.invalidateQueries({ queryKey: ["fundingRecords", participantId] });
        queryClient.invalidateQueries({ queryKey: ["workflowRequests"] });
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Funding & Expenses</h3>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={openCreateFunding}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Record
                </Button>
            </div>

            {/* Funding form dialog */}
            <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-4xl p-0 max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="px-6 pt-6 pb-2">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-white">
                                {editFundingId ? "Edit Funding Record" : "New Funding Record"}
                            </DialogTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-400 hover:text-white"
                                onClick={() => setFormDialogOpen(false)}
                                type="button"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </DialogHeader>

                    <FundingForm
                        embedded
                        participantId={participantId}
                        fundingId={editFundingId}
                        onClose={() => setFormDialogOpen(false)}
                        onSaved={handleSaved}
                    />
                </DialogContent>
            </Dialog>

            {fundingRecords.length > 0 ? (
                <div className="space-y-3">
                    {fundingRecords.map((record) => {
                        const cat = safeCategory(record.category);
                        const supplier = (record.supplier_name || "").toString().trim();

                        return (
                            <button
                                key={record.id}
                                type="button"
                                onClick={() => openRecordDialog(record)}
                                className="w-full text-left bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700/60 hover:bg-slate-900/70 transition-colors"
                            >
                                <div className={`p-2 rounded-lg ${record.record_type === "Expense" ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                                    {record.record_type === "Expense" ? (
                                        <ArrowUpRight className="h-4 w-4 text-red-400" />
                                    ) : (
                                        <ArrowDownRight className="h-4 w-4 text-emerald-400" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge className={categoryColors[cat] || categoryColors.Uncategorised}>{cat}</Badge>
                                        {supplier && (
                                            <Badge className="bg-slate-700/40 text-slate-200 border border-slate-600/30 break-words">
                                                Supplier: {supplier}
                                            </Badge>
                                        )}
                                    </div>

                                    <p className="text-slate-400 text-sm mt-1 truncate">
                                        {record.description || record.invoice_number || "No description"}
                                    </p>
                                </div>

                                <div className="text-right">
                                    <p className={`font-semibold ${record.record_type === "Expense" ? "text-red-400" : "text-emerald-400"}`}>
                                        {record.record_type === "Expense" ? "-" : "+"}${record.amount?.toLocaleString()}
                                    </p>
                                    {record.funding_date && (
                                        <p className="text-xs text-slate-500">
                                            {format(new Date(record.funding_date), "MMM d, yyyy")}
                                        </p>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    icon={DollarSign}
                    title="No funding records"
                    description="Add funding allocations and expenses for this participant"
                    actionLabel="Add Record"
                    onAction={openCreateFunding}
                />
            )}

            {/* Record viewer dialog (your existing one) */}
            <Dialog
                open={requestDialogOpen}
                onOpenChange={(open) => {
                    setRequestDialogOpen(open);
                    if (!open) setSelectedRecord(null);
                }}
            >
                <DialogContent className="bg-slate-900 border-slate-800 max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white">Funding Record</DialogTitle>
                    </DialogHeader>

                    {selectedRecord && (
                        <div className="space-y-5 mt-2">
                            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-800 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    <Badge>{safeCategory(selectedRecord.category)}</Badge>
                                    {selectedRecord.supplier_name && (
                                        <Badge className="break-words whitespace-normal max-w-full">
                                            Supplier: {String(selectedRecord.supplier_name)}
                                        </Badge>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    <div className="break-words">
                                        <p className="text-slate-500">Type</p>
                                        <p className="text-white">{selectedRecord.record_type}</p>
                                    </div>
                                    <div className="break-words">
                                        <p className="text-slate-500">Amount</p>
                                        <p className="text-white font-semibold">
                                            ${Number(selectedRecord.amount || 0).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="break-words">
                                        <p className="text-slate-500">Date</p>
                                        <p className="text-white">
                                            {selectedRecord.funding_date
                                                ? format(new Date(selectedRecord.funding_date), "MMM d, yyyy")
                                                : "N/A"}
                                        </p>
                                    </div>
                                    <div className="break-words">
                                        <p className="text-slate-500">Invoice</p>
                                        <p className="text-white whitespace-normal break-words">
                                            {selectedRecord.invoice_number || "N/A"}
                                        </p>
                                    </div>
                                </div>

                                {selectedRecord.description && (
                                    <div>
                                        <p className="text-slate-500 text-sm">Description</p>
                                        <p className="text-white text-sm whitespace-normal break-words">
                                            {selectedRecord.description}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-800 space-y-3">
                                <h4 className="text-white font-medium">Request Copy</h4>

                                {!selectedRecord.source_workflow_request_id ? (
                                    <Alert className="bg-slate-800/40 border-slate-700">
                                        <AlertDescription className="text-slate-300">
                                            No linked request found for this record.
                                        </AlertDescription>
                                    </Alert>
                                ) : loadingRequestCopy ? (
                                    <p className="text-sm text-slate-400">Loading request copy...</p>
                                ) : requestCopy ? (
                                    <div className="space-y-2 text-sm">
                                        <p className="break-words">
                                            <span className="text-slate-500">Status:</span> {requestCopy.status}
                                        </p>
                                        <p className="break-words">
                                            <span className="text-slate-500">Submitted by:</span> {requestCopy.submitted_by_name}
                                        </p>
                                        <p className="break-words">
                                            <span className="text-slate-500">Reviewed by:</span> {requestCopy.reviewed_by_name}
                                        </p>

                                        {requestCopy.attached_file_urls?.length > 0 && (
                                            <div className="pt-2 border-t border-slate-700/60">
                                                <p className="text-slate-500 mb-2">Attachments</p>
                                                <div className="space-y-2">
                                                    {requestCopy.attached_file_urls.map((url, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-start gap-2 text-blue-400 hover:underline break-all"
                                                        >
                                                            <FileText className="h-4 w-4 mt-0.5" />
                                                            <span className="break-all whitespace-normal">{url.split("/").pop()}</span>
                                                            <ExternalLink className="h-3.5 w-3.5 opacity-70 mt-0.5" />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Alert className="bg-slate-800/40 border-slate-700">
                                        <AlertDescription className="text-slate-300">
                                            Request could not be loaded.
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
