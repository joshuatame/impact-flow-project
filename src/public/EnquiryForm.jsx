import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref as storageRef, uploadBytes } from "firebase/storage";

import { db, functions, storage } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import PageHeader from "@/components/ui/PageHeader.jsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { parseAttributionFromUrl } from "@/lib/rto/tracking";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function normalizeEmail(v) {
    return String(v || "").trim().toLowerCase();
}

function normalizePhoneAU(v) {
    // Minimal normalization for AU - store E.164 if already provided.
    const raw = String(v || "").trim();
    if (!raw) return "";
    if (raw.startsWith("+")) return raw;
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.startsWith("0")) return `+61${digits.slice(1)}`;
    if (digits.startsWith("61")) return `+${digits}`;
    return raw;
}

function validDob(v) {
    if (!v) return false;
    const d = new Date(`${v}T00:00:00`);
    return !Number.isNaN(d.getTime());
}

export default function EnquiryForm() {
    const attribution = useMemo(() => parseAttributionFromUrl(window.location.href), []);
    const isCampaignMode = !!attribution.code;

    const [form, setForm] = useState({
        intakeId: "",
        firstName: "",
        lastName: "",
        dob: "",
        email: "",
        phone: "",
        consentToContact: true,
        marketingConsent: false,
        notes: "",
    });

    const [files, setFiles] = useState([]);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(null);

    const openIntakesQuery = useQuery({
        queryKey: ["public-open-intakes"],
        queryFn: async () => {
            // Public form cannot know entityId; we show all OPEN intakes.
            // If you want to scope public form to a specific entity domain, filter by entityId inferred from hostname.
            const qRef = query(
                collection(db, "RtoCourseIntakes"),
                where("businessUnit", "==", "RTO"),
                where("state", "==", "OPEN"),
                orderBy("updatedAt", "desc")
            );
            const snap = await getDocs(qRef);
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        },
    });

    const intakeOptions = openIntakesQuery.data || [];

    useEffect(() => {
        // Campaign mode may include preselected intakeId from redirect query params
        if (attribution.intakeId) {
            setForm((p) => ({ ...p, intakeId: attribution.intakeId }));
        }
    }, [attribution.intakeId]);

    function onFilePick(e) {
        const picked = Array.from(e.target.files || []);
        const safe = [];
        for (const f of picked) {
            if (!ALLOWED_TYPES.includes(f.type)) {
                setError(`File type not allowed: ${f.name}`);
                continue;
            }
            if (f.size > MAX_FILE_BYTES) {
                setError(`File too large (max 10MB): ${f.name}`);
                continue;
            }
            safe.push(f);
        }
        setFiles((prev) => [...prev, ...safe].slice(0, 5));
    }

    function removeFile(i) {
        setFiles((prev) => prev.filter((_, idx) => idx !== i));
    }

    const submitMutation = useMutation({
        mutationFn: async () => {
            setError("");

            const firstName = String(form.firstName || "").trim();
            const lastName = String(form.lastName || "").trim();
            const email = normalizeEmail(form.email);
            const phone = normalizePhoneAU(form.phone);

            if (!form.intakeId) throw new Error("Please select an intake.");
            if (!firstName) throw new Error("First name is required.");
            if (!lastName) throw new Error("Last name is required.");
            if (!validDob(form.dob)) throw new Error("DOB is required (YYYY-MM-DD).");
            if (!email && !phone) throw new Error("Email or phone is required.");
            if (!form.consentToContact) throw new Error("Consent to contact is required.");

            // Resolve person + create lead via callable to enforce dedupe and audit.
            const callable = httpsCallable(functions, "rtoResolvePersonAndCreateLead");

            const res = await callable({
                intakeId: form.intakeId,
                person: {
                    firstName,
                    lastName,
                    dob: form.dob,
                    email: email || null,
                    phone: phone || null,
                    marketingConsent: !!form.marketingConsent,
                    consentToContact: !!form.consentToContact,
                },
                enquiry: {
                    notes: String(form.notes || "").trim(),
                },
                attribution: attribution,
            });

            const { leadId, personId, entityId } = res.data || {};
            if (!leadId || !personId || !entityId) throw new Error("Submission failed. Missing lead reference.");

            // Upload documents (optional)
            const uploads = [];
            for (const f of files) {
                const fileId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
                const path = `rto/enquiries/${entityId}/${leadId}/id/${fileId}`;
                const r = storageRef(storage, path);

                const metadata = {
                    contentType: f.type,
                    customMetadata: {
                        leadId,
                        personId,
                        entityId,
                        businessUnit: "RTO",
                        kind: "id_document",
                    },
                };

                await uploadBytes(r, f, metadata);
                uploads.push({ fileId, path, contentType: f.type, size: f.size });
            }

            // If there were uploads, register them server-side for audit (callable keeps rules simple).
            if (uploads.length) {
                const regCallable = httpsCallable(functions, "rtoRegisterLeadUploads");
                await regCallable({ leadId, entityId, uploads });
            }

            return { leadId, personId };
        },
        onSuccess: (data) => {
            setSubmitted(data);
            setFiles([]);
        },
        onError: (e) => setError(e?.message || "Submission failed."),
    });

    if (submitted) {
        return (
            <div className="p-6 max-w-2xl mx-auto space-y-3">
                <PageHeader title="Enquiry submitted" subtitle="Thanks - a team member will contact you shortly." />
                <div className="border rounded p-4 text-sm">
                    Reference: <span className="font-mono">{submitted.leadId}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-4">
            <PageHeader
                title="Course enquiry"
                subtitle={isCampaignMode ? "Your details are pre-linked to the campaign for tracking." : "Select an intake and submit your enquiry."}
            />

            {error ? <div className="p-3 border rounded text-sm text-red-600">{error}</div> : null}

            {openIntakesQuery.isLoading ? (
                <LoadingSpinner />
            ) : openIntakesQuery.isError ? (
                <div className="p-3 border rounded text-sm">Failed to load intakes.</div>
            ) : (
                <div>
                    <div className="text-xs font-medium mb-1">Select intake</div>
                    <Select value={form.intakeId} onValueChange={(v) => setForm((p) => ({ ...p, intakeId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Choose an intake" /></SelectTrigger>
                        <SelectContent>
                            {intakeOptions.map((i) => (
                                <SelectItem key={i.id} value={i.id}>
                                    {i.course?.code} - {i.course?.name} {i.course?.location ? `(${i.course.location})` : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <div className="text-xs font-medium mb-1">First name</div>
                    <Input value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div>
                    <div className="text-xs font-medium mb-1">Last name</div>
                    <Input value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
                </div>

                <div>
                    <div className="text-xs font-medium mb-1">Date of birth</div>
                    <Input type="date" value={form.dob} onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))} />
                </div>
                <div>
                    <div className="text-xs font-medium mb-1">Phone</div>
                    <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+614..." />
                </div>

                <div className="sm:col-span-2">
                    <div className="text-xs font-medium mb-1">Email</div>
                    <Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="name@example.com" />
                </div>

                <div className="sm:col-span-2">
                    <div className="text-xs font-medium mb-1">Notes (optional)</div>
                    <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Any questions or preferred contact time" />
                </div>
            </div>

            <div className="border rounded p-3 space-y-2">
                <div className="font-medium">ID uploads (optional)</div>
                <div className="text-xs text-muted-foreground">
                    Accepted: JPG, PNG, PDF. Max 10MB each. Up to 5 files.
                </div>
                <Input type="file" multiple onChange={onFilePick} />
                {files.length ? (
                    <div className="space-y-2">
                        {files.map((f, idx) => (
                            <div key={`${f.name}_${idx}`} className="flex items-center justify-between border rounded p-2 text-sm">
                                <div className="truncate">{f.name}</div>
                                <Button size="sm" variant="outline" onClick={() => removeFile(idx)}>Remove</Button>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className="border rounded p-3 space-y-2">
                <div className="font-medium">Consent</div>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={form.consentToContact}
                        onChange={(e) => setForm((p) => ({ ...p, consentToContact: e.target.checked }))}
                    />
                    I consent to be contacted about this enquiry.
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={form.marketingConsent}
                        onChange={(e) => setForm((p) => ({ ...p, marketingConsent: e.target.checked }))}
                    />
                    I agree to receive updates about future courses.
                </label>
            </div>

            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? "Submitting..." : "Submit enquiry"}
            </Button>

            {isCampaignMode ? (
                <div className="text-xs text-muted-foreground">
                    Tracking: code {attribution.code} {attribution.sourceChannel ? `- ${attribution.sourceChannel}` : ""} {attribution.bdUserId ? `- bd:${attribution.bdUserId}` : ""}
                </div>
            ) : null}
        </div>
    );
}
