// File: src/businessUnits/RTO/pages/campaigns/CampaignBuilder.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    query,
    where,
    getDocs,
    serverTimestamp,
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

import { generateQrDataUrlPng } from "@/lib/rto/qr";
import { getActiveEntity } from "@/lib/activeEntity";

function uid() {
    return auth?.currentUser?.uid || null;
}

const UNASSIGNED = "__unassigned__";

function validateCampaign(c) {
    const errs = [];
    if (!c?.name) errs.push("Campaign name is required.");
    if (!c?.intakeId) errs.push("An intake is required.");
    return errs;
}

function displayName(u) {
    return (
        u?.displayName ||
        u?.name ||
        [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
        u?.email ||
        u?.id ||
        "Unknown"
    );
}

function hasEntityAccess(userDoc, entityId) {
    if (!userDoc || !entityId) return false;
    const ea = userDoc.entity_access || {};
    return !!ea?.[entityId];
}

export default function CampaignBuilder() {
    const qc = useQueryClient();
    const activeEntity = getActiveEntity();
    const entityId = activeEntity?.id;

    const [campaignId, setCampaignId] = useState("");
    const [campaign, setCampaign] = useState({
        name: "",
        intakeId: "",
        state: "ACTIVE",
        budgetAmount: 0,
        attributionDefaults: { sourceChannel: "social" },
    });

    const [linkDraft, setLinkDraft] = useState({
        label: "",
        sourceChannel: "social",
        bdUserId: UNASSIGNED, // sentinel for Select stability
        qrVariant: "",
        utm_source: "",
        utm_medium: "",
        utm_campaign: "",
        utm_content: "",
        utm_term: "",
    });

    const [error, setError] = useState("");
    const [qrPreview, setQrPreview] = useState(null);

    const intakesQuery = useQuery({
        queryKey: ["rto-intakes-open", entityId],
        enabled: !!entityId,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoCourseIntakes"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO"),
                where("state", "==", "OPEN")
            );
            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => {
                const au =
                    a?.updatedAt?.toMillis?.() ||
                    a?.updatedAt ||
                    a?.createdAt?.toMillis?.() ||
                    a?.createdAt ||
                    0;
                const bu =
                    b?.updatedAt?.toMillis?.() ||
                    b?.updatedAt ||
                    b?.createdAt?.toMillis?.() ||
                    b?.createdAt ||
                    0;
                return bu - au;
            });
            return rows;
        },
    });

    const campaignsQuery = useQuery({
        queryKey: ["rto-campaigns", entityId],
        enabled: !!entityId,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoCampaigns"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO")
            );
            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => {
                const au =
                    a?.updatedAt?.toMillis?.() ||
                    a?.updatedAt ||
                    a?.createdAt?.toMillis?.() ||
                    a?.createdAt ||
                    0;
                const bu =
                    b?.updatedAt?.toMillis?.() ||
                    b?.updatedAt ||
                    b?.createdAt?.toMillis?.() ||
                    b?.createdAt ||
                    0;
                return bu - au;
            });
            return rows;
        },
    });

    const linksQuery = useQuery({
        queryKey: ["rto-campaign-links", entityId, campaignId],
        enabled: !!entityId && !!campaignId,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoCampaignLinks"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO"),
                where("campaignId", "==", campaignId)
            );
            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => {
                const au = a?.createdAt?.toMillis?.() || a?.createdAt || 0;
                const bu = b?.createdAt?.toMillis?.() || b?.createdAt || 0;
                return bu - au;
            });
            return rows;
        },
    });

    const bdUsersQuery = useQuery({
        queryKey: ["rto-entity-users", entityId],
        enabled: !!entityId,
        queryFn: async () => {
            const snap = await getDocs(collection(db, "User"));
            const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

            const scoped = users
                .filter((u) => hasEntityAccess(u, entityId))
                .map((u) => ({ ...u, id: u.id || u.uid || u.userId }))
                .filter((u) => !!u.id);

            const withRole = scoped.map((u) => {
                const role = u?.entity_access?.[entityId]?.role || u?.role || "";
                return { ...u, _role: role };
            });

            withRole.sort((a, b) => displayName(a).localeCompare(displayName(b)));
            return withRole;
        },
    });

    const selectedCampaign = useMemo(() => {
        if (!campaignId) return null;
        return (campaignsQuery.data || []).find((c) => c.id === campaignId) || null;
    }, [campaignId, campaignsQuery.data]);

    useEffect(() => {
        if (selectedCampaign) {
            setCampaign({
                name: selectedCampaign.name || "",
                intakeId: selectedCampaign.intakeId || "",
                state: selectedCampaign.state || "ACTIVE",
                budgetAmount: Number(selectedCampaign.budget?.amount || 0),
                attributionDefaults:
                    selectedCampaign.attributionDefaults || { sourceChannel: "social" },
            });
        }
    }, [selectedCampaign]);

    const saveCampaignMutation = useMutation({
        mutationFn: async () => {
            const userId = uid();
            if (!userId) throw new Error("Not authenticated.");
            if (!entityId) throw new Error("Missing entityId.");

            const payload = {
                entityId,
                businessUnit: "RTO",
                intakeId: campaign.intakeId,
                name: campaign.name,
                state: campaign.state,
                budget: {
                    amount: Number(campaign.budgetAmount || 0),
                    currency: "AUD",
                    notes: "",
                },
                attributionDefaults:
                    campaign.attributionDefaults || { sourceChannel: "social" },
                updatedAt: serverTimestamp(),
                updatedBy: userId,
            };

            const errs = validateCampaign(payload);
            if (errs.length) throw new Error(errs.join(" "));

            if (campaignId) {
                await updateDoc(doc(db, "RtoCampaigns", campaignId), payload);
                return campaignId;
            }

            const ref = await addDoc(collection(db, "RtoCampaigns"), {
                ...payload,
                createdAt: serverTimestamp(),
                createdBy: userId,
            });
            return ref.id;
        },
        onSuccess: async (id) => {
            await qc.invalidateQueries({ queryKey: ["rto-campaigns", entityId] });
            setCampaignId(id);
            setError("");
        },
        onError: (e) => setError(e?.message || "Failed to save campaign."),
    });

    const createLinkMutation = useMutation({
        mutationFn: async () => {
            const userId = uid();
            if (!userId) throw new Error("Not authenticated.");
            if (!entityId) throw new Error("Missing entityId.");
            if (!campaignId) throw new Error("Save/select a campaign first.");

            const callable = httpsCallable(functions, "rtoCreateCampaignLink");

            const bd =
                linkDraft.bdUserId && linkDraft.bdUserId !== UNASSIGNED
                    ? linkDraft.bdUserId
                    : null;

            const res = await callable({
                entityId,
                campaignId,
                intakeId: campaign.intakeId,
                label: linkDraft.label,
                sourceChannel: linkDraft.sourceChannel,
                bdUserId: bd,
                qrVariant: linkDraft.qrVariant || null,
                utmDefaults: {
                    utm_source: linkDraft.utm_source || "",
                    utm_medium: linkDraft.utm_medium || "",
                    utm_campaign: linkDraft.utm_campaign || "",
                    utm_content: linkDraft.utm_content || "",
                    utm_term: linkDraft.utm_term || "",
                },
            });

            return res.data;
        },
        onSuccess: async () => {
            await qc.invalidateQueries({
                queryKey: ["rto-campaign-links", entityId, campaignId],
            });
            setLinkDraft({
                label: "",
                sourceChannel: "social",
                bdUserId: UNASSIGNED,
                qrVariant: "",
                utm_source: "",
                utm_medium: "",
                utm_campaign: "",
                utm_content: "",
                utm_term: "",
            });
            setError("");
        },
        onError: (e) => setError(e?.message || "Failed to create link."),
    });

    async function previewQrForCode(code) {
        try {
            setQrPreview(null);
            const url = `${window.location.origin}/r/${encodeURIComponent(code)}`;
            const dataUrl = await generateQrDataUrlPng(url, { width: 256 });
            setQrPreview({ code, dataUrl, url });
        } catch (e) {
            setError(e?.message || "Failed to generate QR.");
        }
    }

    if (!entityId) {
        return (
            <div className="p-6">
                <PageHeader
                    title="RTO Campaigns"
                    subtitle="Select a business entity to manage campaigns."
                />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <PageHeader
                title="RTO Campaign Builder"
                subtitle="Create campaigns and generate tracked links and QR codes."
            />

            {error ? (
                <div className="p-3 border rounded text-sm text-red-600">{error}</div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="border rounded p-4 space-y-3">
                    <div className="font-semibold">Select Campaign</div>

                    {campaignsQuery.isLoading ? (
                        <LoadingSpinner />
                    ) : (
                        <Select value={campaignId} onValueChange={setCampaignId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose a campaign" />
                            </SelectTrigger>
                            <SelectContent>
                                {(campaignsQuery.data || []).map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <Button
                        variant="outline"
                        onClick={() => {
                            setCampaignId("");
                            setCampaign({
                                name: "",
                                intakeId: "",
                                state: "ACTIVE",
                                budgetAmount: 0,
                                attributionDefaults: { sourceChannel: "social" },
                            });
                            setQrPreview(null);
                            setError("");
                        }}
                    >
                        New Campaign
                    </Button>
                </div>

                <div className="border rounded p-4 space-y-3 lg:col-span-2">
                    <div className="font-semibold">Campaign Details</div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <div className="text-xs font-medium mb-1">Campaign name</div>
                            <Input
                                value={campaign.name}
                                onChange={(e) =>
                                    setCampaign((p) => ({ ...p, name: e.target.value }))
                                }
                            />
                        </div>

                        <div>
                            <div className="text-xs font-medium mb-1">Intake</div>
                            {intakesQuery.isLoading ? (
                                <div className="text-sm text-muted-foreground">
                                    Loading intakes...
                                </div>
                            ) : (
                                <Select
                                    value={campaign.intakeId}
                                    onValueChange={(v) =>
                                        setCampaign((p) => ({ ...p, intakeId: v }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select intake" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(intakesQuery.data || []).map((i) => (
                                            <SelectItem key={i.id} value={i.id}>
                                                {i.course?.code} - {i.course?.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        <div>
                            <div className="text-xs font-medium mb-1">State</div>
                            <Select
                                value={campaign.state}
                                onValueChange={(v) =>
                                    setCampaign((p) => ({ ...p, state: v }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                                    <SelectItem value="PAUSED">PAUSED</SelectItem>
                                    <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <div className="text-xs font-medium mb-1">Default channel</div>
                            <Select
                                value={campaign.attributionDefaults?.sourceChannel || "social"}
                                onValueChange={(v) =>
                                    setCampaign((p) => ({
                                        ...p,
                                        attributionDefaults: {
                                            ...(p.attributionDefaults || {}),
                                            sourceChannel: v,
                                        },
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
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
                            <div className="text-xs font-medium mb-1">Budget (AUD)</div>
                            <Input
                                type="number"
                                value={campaign.budgetAmount}
                                onChange={(e) =>
                                    setCampaign((p) => ({ ...p, budgetAmount: e.target.value }))
                                }
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            onClick={() => saveCampaignMutation.mutate()}
                            disabled={saveCampaignMutation.isPending}
                        >
                            {saveCampaignMutation.isPending ? "Saving..." : "Save Campaign"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="border rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="font-semibold">Link Variants and QR Codes</div>
                    {campaignId ? (
                        <Badge variant="secondary">Campaign selected</Badge>
                    ) : (
                        <Badge variant="secondary">Save/select a campaign</Badge>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="border rounded p-3 space-y-2">
                        <div className="font-medium">Create link variant</div>

                        <div>
                            <div className="text-xs font-medium mb-1">Label</div>
                            <Input
                                value={linkDraft.label}
                                onChange={(e) =>
                                    setLinkDraft((p) => ({ ...p, label: e.target.value }))
                                }
                                placeholder="Meta - Flyer A - BD Josh"
                            />
                        </div>

                        <div>
                            <div className="text-xs font-medium mb-1">Source channel</div>
                            <Select
                                value={linkDraft.sourceChannel}
                                onValueChange={(v) =>
                                    setLinkDraft((p) => ({ ...p, sourceChannel: v }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
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
                            <div className="text-xs font-medium mb-1">BD (optional)</div>
                            {bdUsersQuery.isLoading ? (
                                <div className="text-sm text-muted-foreground">
                                    Loading users...
                                </div>
                            ) : (
                                <Select
                                    value={linkDraft.bdUserId || UNASSIGNED}
                                    onValueChange={(v) =>
                                        setLinkDraft((p) => ({ ...p, bdUserId: v || UNASSIGNED }))
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Unassigned" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                                        {(bdUsersQuery.data || []).map((u) => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {displayName(u)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        <div>
                            <div className="text-xs font-medium mb-1">QR variant (optional)</div>
                            <Input
                                value={linkDraft.qrVariant}
                                onChange={(e) =>
                                    setLinkDraft((p) => ({ ...p, qrVariant: e.target.value }))
                                }
                                placeholder="flyer_a"
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <div className="text-xs font-medium">UTM defaults</div>
                            <Input
                                value={linkDraft.utm_source}
                                onChange={(e) =>
                                    setLinkDraft((p) => ({ ...p, utm_source: e.target.value }))
                                }
                                placeholder="utm_source"
                            />
                            <Input
                                value={linkDraft.utm_medium}
                                onChange={(e) =>
                                    setLinkDraft((p) => ({ ...p, utm_medium: e.target.value }))
                                }
                                placeholder="utm_medium"
                            />
                            <Input
                                value={linkDraft.utm_campaign}
                                onChange={(e) =>
                                    setLinkDraft((p) => ({ ...p, utm_campaign: e.target.value }))
                                }
                                placeholder="utm_campaign"
                            />
                            <Input
                                value={linkDraft.utm_content}
                                onChange={(e) =>
                                    setLinkDraft((p) => ({ ...p, utm_content: e.target.value }))
                                }
                                placeholder="utm_content"
                            />
                            <Input
                                value={linkDraft.utm_term}
                                onChange={(e) =>
                                    setLinkDraft((p) => ({ ...p, utm_term: e.target.value }))
                                }
                                placeholder="utm_term"
                            />
                        </div>

                        <Button
                            onClick={() => createLinkMutation.mutate()}
                            disabled={createLinkMutation.isPending || !campaignId}
                        >
                            {createLinkMutation.isPending ? "Creating..." : "Create Link Variant"}
                        </Button>

                        <div className="text-xs text-muted-foreground">
                            General in-person QR should link to /enquiry (general mode). Campaign links should always go via /r/:code.
                        </div>
                    </div>

                    <div className="lg:col-span-2 border rounded p-3 space-y-2">
                        <div className="font-medium">Existing variants</div>

                        {linksQuery.isLoading ? (
                            <LoadingSpinner />
                        ) : linksQuery.isError ? (
                            <div className="text-sm">
                                Failed to load links: {String(linksQuery.error?.message || "")}
                            </div>
                        ) : (linksQuery.data || []).length === 0 ? (
                            <div className="text-sm text-muted-foreground">No links yet.</div>
                        ) : (
                            <div className="border rounded overflow-hidden">
                                <div className="grid grid-cols-12 bg-muted/50 px-3 py-2 text-xs font-medium">
                                    <div className="col-span-4">Label</div>
                                    <div className="col-span-2">Channel</div>
                                    <div className="col-span-2">BD</div>
                                    <div className="col-span-2">Code</div>
                                    <div className="col-span-2">Actions</div>
                                </div>

                                {(linksQuery.data || []).map((l) => (
                                    <div
                                        key={l.id}
                                        className="grid grid-cols-12 px-3 py-2 border-t items-center text-sm"
                                    >
                                        <div className="col-span-4">
                                            <div className="font-medium">{l.label || "-"}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {l.qrVariant ? `qr:${l.qrVariant}` : ""}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <Badge variant="secondary">{l.sourceChannel}</Badge>
                                        </div>
                                        <div className="col-span-2 text-xs">{l.bdUserId || "-"}</div>
                                        <div className="col-span-2 font-mono text-xs">{l.code}</div>
                                        <div className="col-span-2 flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => previewQrForCode(l.code)}
                                            >
                                                QR
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    navigator.clipboard.writeText(
                                                        `${window.location.origin}/r/${l.code}`
                                                    )
                                                }
                                            >
                                                Copy
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {qrPreview ? (
                            <div className="border rounded p-3 flex flex-col sm:flex-row gap-4 items-start">
                                <div>
                                    <div className="text-xs font-medium mb-1">
                                        QR Preview ({qrPreview.code})
                                    </div>
                                    <img
                                        src={qrPreview.dataUrl}
                                        alt="QR"
                                        className="w-48 h-48 border rounded"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs font-medium">Short link</div>
                                    <div className="font-mono text-xs break-all">{qrPreview.url}</div>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            const a = document.createElement("a");
                                            a.href = qrPreview.dataUrl;
                                            a.download = `qr_${qrPreview.code}.png`;
                                            a.click();
                                        }}
                                    >
                                        Download PNG
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
