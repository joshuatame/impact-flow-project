import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    limit,
    doc,
    getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { db, auth, functions } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import PageHeader from "@/components/ui/PageHeader.jsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { getActiveEntity } from "@/lib/activeEntity";

const STAGES = ["ENQUIRY", "QUALIFIED", "OFFERED", "ENROLLED", "COMMENCED", "COMPLETED", "DROPPED", "PROGRAM_REFERRED"];

function uid() {
    return auth?.currentUser?.uid || null;
}

async function loadPerson(personId) {
    const ref = doc(db, "Persons", personId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
}

export default function LeadsDashboard() {
    const qc = useQueryClient();
    const activeEntity = getActiveEntity();
    const entityId = activeEntity?.id;

    const [filters, setFilters] = useState({
        stage: "ENQUIRY",
        assignedToUserId: "",
        sourceChannel: "all",
        campaignId: "",
        intakeId: "",
        search: "",
    });

    const [selectedLead, setSelectedLead] = useState(null);
    const [selectedPerson, setSelectedPerson] = useState(null);
    const [detailError, setDetailError] = useState("");

    const intakesQuery = useQuery({
        queryKey: ["rto-intakes-all", entityId],
        enabled: !!entityId,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoCourseIntakes"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO"),
                orderBy("updatedAt", "desc")
            );
            const snap = await getDocs(qRef);
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
    });

    const campaignsQuery = useQuery({
        queryKey: ["rto-campaigns-all", entityId],
        enabled: !!entityId,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoCampaigns"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO"),
                orderBy("updatedAt", "desc")
            );
            const snap = await getDocs(qRef);
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
    });

    const leadsQuery = useQuery({
        queryKey: ["rto-leads", entityId, filters.stage, filters.assignedToUserId, filters.sourceChannel, filters.campaignId, filters.intakeId],
        enabled: !!entityId,
        queryFn: async () => {
            let qRef = query(
                collection(db, "RtoLeads"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO"),
                where("stage", "==", filters.stage),
                orderBy("stageUpdatedAt", "desc"),
                limit(200)
            );

            // Firestore cannot conditionally add where based on empty string without separate queries.
            // Keep the base query tight by stage, then filter in-memory by the optional filters.
            const snap = await getDocs(qRef);
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
    });

    const leadsFiltered = useMemo(() => {
        const list = leadsQuery.data || [];
        return list.filter((l) => {
            if (filters.assignedToUserId && l.assignedToUserId !== filters.assignedToUserId) return false;
            if (filters.sourceChannel !== "all" && l.sourceChannel !== filters.sourceChannel) return false;
            if (filters.campaignId && l.campaignId !== filters.campaignId) return false;
            if (filters.intakeId && l.intakeId !== filters.intakeId) return false;

            const s = String(filters.search || "").trim().toLowerCase();
            if (!s) return true;

            const hay = [
                l?.personId,
                l?.utm?.utm_source,
                l?.utm?.utm_campaign,
                l?.sourceChannel,
                l?.bdUserId,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(s);
        });
    }, [leadsQuery.data, filters]);

    const stageMutation = useMutation({
        mutationFn: async ({ leadId, toStage, reason, note }) => {
            const userId = uid();
            if (!userId) throw new Error("Not authenticated.");
            const callable = httpsCallable(functions, "rtoUpdateLeadStage");
            const res = await callable({ leadId, entityId, toStage, reason: reason || null, note: note || null });
            return res.data;
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["rto-leads", entityId] });
            setDetailError("");
        },
        onError: (e) => setDetailError(e?.message || "Failed to update stage."),
    });

    const eventsQuery = useQuery({
        queryKey: ["rto-lead-events", entityId, selectedLead?.id],
        enabled: !!entityId && !!selectedLead?.id,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoLeadEvents"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO"),
                where("leadId", "==", selectedLead.id),
                orderBy("at", "desc"),
                limit(200)
            );
            const snap = await getDocs(qRef);
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
    });

    async function openLead(lead) {
        try {
            setSelectedLead(lead);
            setSelectedPerson(null);
            setDetailError("");
            const p = await loadPerson(lead.personId);
            setSelectedPerson(p);
        } catch (e) {
            setDetailError(e?.message || "Failed to load lead details.");
        }
    }

    if (!entityId) {
        return (
            <div className="p-6">
                <PageHeader title="RTO Leads" subtitle="Select a business entity to manage leads." />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <PageHeader title="RTO Lead Pipeline" subtitle="Track enquiries through qualification, enrolment, and completion." />

            <div className="border rounded p-3 grid grid-cols-1 lg:grid-cols-5 gap-3">
                <div>
                    <div className="text-xs font-medium mb-1">Stage</div>
                    <Select value={filters.stage} onValueChange={(v) => setFilters((p) => ({ ...p, stage: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {STAGES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <div className="text-xs font-medium mb-1">Source channel</div>
                    <Select value={filters.sourceChannel} onValueChange={(v) => setFilters((p) => ({ ...p, sourceChannel: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">all</SelectItem>
                            <SelectItem value="social">social</SelectItem>
                            <SelectItem value="google_ads">google_ads</SelectItem>
                            <SelectItem value="website">website</SelectItem>
                            <SelectItem value="flyer">flyer</SelectItem>
                            <SelectItem value="referral">referral</SelectItem>
                            <SelectItem value="bd_in_person">bd_in_person</SelectItem>
                            <SelectItem value="other">other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <div className="text-xs font-medium mb-1">Campaign</div>
                    <Select value={filters.campaignId} onValueChange={(v) => setFilters((p) => ({ ...p, campaignId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">Any</SelectItem>
                            {(campaignsQuery.data || []).map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <div className="text-xs font-medium mb-1">Intake</div>
                    <Select value={filters.intakeId} onValueChange={(v) => setFilters((p) => ({ ...p, intakeId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">Any</SelectItem>
                            {(intakesQuery.data || []).map((i) => (
                                <SelectItem key={i.id} value={i.id}>
                                    {i.course?.code} - {i.course?.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <div className="text-xs font-medium mb-1">Search</div>
                    <Input
                        value={filters.search}
                        onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                        placeholder="personId, utm, bdUserId..."
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="border rounded overflow-hidden lg:col-span-2">
                    <div className="bg-muted/50 px-3 py-2 text-xs font-medium">Leads ({leadsFiltered.length})</div>
                    {leadsQuery.isLoading ? (
                        <div className="p-6"><LoadingSpinner /></div>
                    ) : leadsQuery.isError ? (
                        <div className="p-6 text-sm">Failed to load leads: {String(leadsQuery.error?.message || "")}</div>
                    ) : leadsFiltered.length === 0 ? (
                        <div className="p-6 text-sm text-muted-foreground">No leads in this stage.</div>
                    ) : (
                        leadsFiltered.map((l) => (
                            <button
                                key={l.id}
                                className="w-full text-left px-3 py-3 border-t hover:bg-muted/30"
                                onClick={() => openLead(l)}
                                type="button"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-medium">Lead {l.id.slice(0, 8)}</div>
                                    <Badge variant="secondary">{l.sourceChannel || "unknown"}</Badge>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    personId: {l.personId} {l.campaignId ? `- camp:${l.campaignId.slice(0, 6)}` : ""} {l.bdUserId ? `- bd:${l.bdUserId}` : ""}
                                </div>
                            </button>
                        ))
                    )}
                </div>

                <div className="border rounded p-3">
                    <div className="font-semibold">Lead detail</div>

                    {!selectedLead ? (
                        <div className="text-sm text-muted-foreground mt-2">Select a lead to view details.</div>
                    ) : (
                        <div className="space-y-3 mt-2">
                            {detailError ? <div className="p-2 border rounded text-sm text-red-600">{detailError}</div> : null}

                            <div className="text-sm">
                                <div className="font-medium">Person</div>
                                {selectedPerson ? (
                                    <div className="text-xs text-muted-foreground">
                                        {selectedPerson.firstName} {selectedPerson.lastName} - {selectedPerson.normalized?.email || selectedPerson.email || "no email"} - {selectedPerson.normalized?.phoneE164 || selectedPerson.phone || "no phone"}
                                    </div>
                                ) : (
                                    <div className="text-xs text-muted-foreground">Loading person...</div>
                                )}
                            </div>

                            <div className="text-sm">
                                <div className="font-medium">Attribution</div>
                                <div className="text-xs text-muted-foreground">
                                    channel: {selectedLead.sourceChannel || "-"}<br />
                                    campaign: {selectedLead.campaignId || "-"}<br />
                                    link: {selectedLead.campaignLinkId || "-"}<br />
                                    bd: {selectedLead.bdUserId || "-"}<br />
                                    utm: {selectedLead.utm?.utm_source || "-"} / {selectedLead.utm?.utm_campaign || "-"}
                                </div>
                            </div>

                            <div className="text-sm">
                                <div className="font-medium">Stage</div>
                                <div className="flex gap-2 items-center">
                                    <Badge>{selectedLead.stage}</Badge>
                                    <Select
                                        value={selectedLead.stage}
                                        onValueChange={(v) => stageMutation.mutate({ leadId: selectedLead.id, toStage: v })}
                                    >
                                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {STAGES.map((s) => (
                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Changing stage logs an audit event and updates analytics.
                                </div>
                            </div>

                            <div className="text-sm">
                                <div className="font-medium">Timeline</div>
                                {eventsQuery.isLoading ? (
                                    <div className="py-2"><LoadingSpinner /></div>
                                ) : (eventsQuery.data || []).length === 0 ? (
                                    <div className="text-xs text-muted-foreground py-2">No events.</div>
                                ) : (
                                    <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                                        {(eventsQuery.data || []).map((ev) => (
                                            <div key={ev.id} className="border rounded p-2">
                                                <div className="text-xs font-medium">{ev.type}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {ev.at?.toDate ? ev.at.toDate().toLocaleString() : ""} {ev.byUserId ? `- by ${ev.byUserId}` : ""}
                                                </div>
                                                {ev.data ? (
                                                    <pre className="text-[11px] mt-1 whitespace-pre-wrap">{JSON.stringify(ev.data, null, 2)}</pre>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button
                                variant="outline"
                                onClick={() => { setSelectedLead(null); setSelectedPerson(null); }}
                            >
                                Close
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
