// src/pages/JobBlast.jsx
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Briefcase,
    Send,
    Users,
    FileText,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Mail,
    Link as LinkIcon,
    Share2,
    Download,
    User,
    ExternalLink,
    Settings,
    Save,
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";

import { db } from "@/firebase";
import {
    addDoc,
    collection,
    doc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    where,
} from "firebase/firestore";

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function isValidEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

function getParticipantEmail(p) {
    const candidates = [
        p?.email,
        p?.email_address,
        p?.participant_email,
        p?.contact_email,
        p?.personal_email,
        p?.work_email,
        p?.primary_email,
    ]
        .map((x) => safeText(x).trim())
        .filter(Boolean);

    return candidates[0] || "";
}

function formatName(p) {
    const fn = safeText(p?.first_name).trim();
    const ln = safeText(p?.last_name).trim();
    const full = `${fn} ${ln}`.trim();
    return full || safeText(p?.full_name) || safeText(p?.name) || "Unnamed";
}

function formatApplicantName(a) {
    const fn = safeText(a?.firstName).trim();
    const ln = safeText(a?.lastName).trim();
    const full = `${fn} ${ln}`.trim();
    return full || safeText(a?.name).trim() || "Applicant";
}

function uniqBy(arr, keyFn) {
    const seen = new Set();
    const out = [];
    for (const it of arr || []) {
        const k = keyFn(it);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(it);
    }
    return out;
}

function sortByTimestampDesc(items, field) {
    const toMs = (v) => {
        if (!v) return 0;
        if (typeof v?.seconds === "number") return v.seconds * 1000;
        const d = new Date(v);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    };
    return [...(items || [])].sort((a, b) => toMs(b?.[field]) - toMs(a?.[field]));
}

function timestampToDisplay(ts) {
    try {
        if (!ts) return "";
        const d = typeof ts?.seconds === "number" ? new Date(ts.seconds * 1000) : new Date(ts);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleString();
    } catch {
        return "";
    }
}

function splitEmails(s) {
    return safeText(s)
        .split(/[,\n;]/g)
        .map((x) => x.trim())
        .filter(Boolean);
}

function toCsvValue(v) {
    const s = safeText(v).replace(/\r?\n/g, " ").trim();
    const escaped = s.replace(/"/g, '""');
    return `"${escaped}"`;
}

function buildApplicationsCsv(apps) {
    const header = [
        "SubmittedAt",
        "FirstName",
        "LastName",
        "Email",
        "Mobile",
        "FirstNation",
        "ResumeUrl",
        "CoverLetterUrl",
        "CoverLetterText",
    ];
    const lines = [header.map(toCsvValue).join(",")];

    for (const a of apps || []) {
        lines.push(
            [
                timestampToDisplay(a.createdAt),
                safeText(a.firstName),
                safeText(a.lastName),
                safeText(a.email),
                safeText(a.mobile),
                safeText(a.firstNation),
                safeText(a?.resume?.url),
                safeText(a?.coverLetter?.url),
                safeText(a.coverLetterText),
            ]
                .map(toCsvValue)
                .join(",")
        );
    }

    return lines.join("\n");
}

function downloadTextFile(filename, content, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// EMAIL defaults + public apply URL base
const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || "https://impact-central.com.au";

function buildReplyTo(me) {
    const email = safeText(me?.email).trim();
    const name = safeText(me?.full_name || me?.display_name).trim();
    if (email && isValidEmail(email)) return name ? `${name} <${email}>` : email;
    return "";
}

function normalizeEmail(v) {
    return String(v || "")
        .trim()
        .replace(/^mailto:/i, "")
        .toLowerCase();
}

export default function JobBlast() {
    const [creating, setCreating] = useState(false);
    const [selectedBlast, setSelectedBlast] = useState(null);

    // create form
    const [businessName, setBusinessName] = useState("");
    const [abn, setAbn] = useState("");
    const [title, setTitle] = useState("");
    const [intro, setIntro] = useState("");
    const [roleDetails, setRoleDetails] = useState("");
    const [applyInstructions, setApplyInstructions] = useState("");

    // ✅ pick modes: all | program | individual | mailing_list
    const [pickMode, setPickMode] = useState("all");
    const [selectedProgramId, setSelectedProgramId] = useState("");
    const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);

    // ✅ mailing list selection for create
    const [selectedMailingListEmails, setSelectedMailingListEmails] = useState([]);

    // resend + share selections
    const [selectedApplicantEmails, setSelectedApplicantEmails] = useState([]);

    // collapse state for send history
    const [historyOpen, setHistoryOpen] = useState(false);

    // applicant viewer dialog
    const [viewApplicantOpen, setViewApplicantOpen] = useState(false);
    const [viewApplicant, setViewApplicant] = useState(null);

    // share applications
    const [shareOpen, setShareOpen] = useState(false);
    const [shareTo, setShareTo] = useState("");
    const [shareSubject, setShareSubject] = useState("");
    const [shareNote, setShareNote] = useState("");
    const [shareSending, setShareSending] = useState(false);

    // manage recipients (edit after send)
    const [manageRecipientsOpen, setManageRecipientsOpen] = useState(false);
    const [editPickMode, setEditPickMode] = useState("all");
    const [editSelectedProgramId, setEditSelectedProgramId] = useState("");
    const [editRecipientIds, setEditRecipientIds] = useState([]);
    const [savingRecipients, setSavingRecipients] = useState(false);

    // ✅ manage recipients: mailing list edit
    const [editMailingListEmails, setEditMailingListEmails] = useState([]);

    // ---------- user + base44 data ----------
    const { data: me, isLoading: loadingMe } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ["programs"],
        queryFn: () => base44.entities.Program.list("-created_date", 500),
    });

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ["participants"],
        queryFn: () => base44.entities.Participant.list("-created_date", 5000),
    });

    const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
        queryKey: ["enrollmentsForProgram", selectedProgramId],
        queryFn: () =>
            selectedProgramId
                ? base44.entities.ParticipantProgramEnrollment.filter({ program_id: selectedProgramId }, undefined, 10000)
                : Promise.resolve([]),
        enabled: !!selectedProgramId,
    });

    // enrollments for edit
    const { data: editEnrollments = [], isLoading: loadingEditEnrollments } = useQuery({
        queryKey: ["enrollmentsForProgramEdit", editSelectedProgramId],
        queryFn: () =>
            editSelectedProgramId
                ? base44.entities.ParticipantProgramEnrollment.filter({ program_id: editSelectedProgramId }, undefined, 10000)
                : Promise.resolve([]),
        enabled: !!editSelectedProgramId,
    });

    const isLoading = loadingMe || loadingPrograms || loadingParticipants || loadingEnrollments || loadingEditEnrollments;

    // ---------- Firestore live lists ----------
    const [blasts, setBlasts] = useState([]);
    useEffect(() => {
        const qRef = query(collection(db, "jobBlasts"));
        const unsub = onSnapshot(qRef, (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const sorted = sortByTimestampDesc(rows, "createdAt");
            setBlasts(sorted);

            if (selectedBlast?.id) {
                const found = sorted.find((x) => x.id === selectedBlast.id);
                if (found) setSelectedBlast(found);
            }
        });
        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ Mailing list live
    const [mailingList, setMailingList] = useState([]);
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "mailingList"), (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            items.sort((a, b) => {
                const an = safeText(a.name).toLowerCase();
                const bn = safeText(b.name).toLowerCase();
                if (an !== bn) return an.localeCompare(bn);
                return safeText(a.email).toLowerCase().localeCompare(safeText(b.email).toLowerCase());
            });
            setMailingList(items);
        });
        return () => unsub();
    }, []);

    // Applications for selected blast
    const [applications, setApplications] = useState([]);
    useEffect(() => {
        if (!selectedBlast?.id) {
            setApplications([]);
            return;
        }
        const qRef = query(collection(db, "jobBlastApplications"), where("blastId", "==", selectedBlast.id));
        const unsub = onSnapshot(qRef, (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setApplications(sortByTimestampDesc(rows, "createdAt"));
        });
        return () => unsub();
    }, [selectedBlast?.id]);

    // Counts for all blasts (for list view)
    const [applicationCounts, setApplicationCounts] = useState({});
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "jobBlastApplications"), (snap) => {
            const counts = {};
            snap.docs.forEach((d) => {
                const data = d.data() || {};
                const bid = safeText(data.blastId).trim();
                if (!bid) return;
                counts[bid] = (counts[bid] || 0) + 1;
            });
            setApplicationCounts(counts);
        });
        return () => unsub();
    }, []);

    // Send history for selected blast
    const [sendHistory, setSendHistory] = useState([]);
    useEffect(() => {
        if (!selectedBlast?.id) {
            setSendHistory([]);
            return;
        }
        const qRef = query(collection(db, "jobBlastSends"), where("blastId", "==", selectedBlast.id));
        const unsub = onSnapshot(qRef, (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setSendHistory(sortByTimestampDesc(rows, "sentAt"));
        });
        return () => unsub();
    }, [selectedBlast?.id]);

    // ---------- derived lists ----------
    const programList = useMemo(() => (Array.isArray(programs) ? programs : []), [programs]);
    const participantList = useMemo(() => (Array.isArray(participants) ? participants : []), [participants]);

    // For create: participants eligible list (mode all/program/individual)
    const eligibleParticipants = useMemo(() => {
        const list = participantList;

        if (pickMode === "all") return list;

        if (pickMode === "program") {
            const ids = new Set((enrollments || []).map((e) => e.participant_id).filter(Boolean));
            return list.filter((p) => ids.has(p.id));
        }

        // individual
        return list;
    }, [participantList, pickMode, enrollments]);

    const selectedParticipants = useMemo(() => {
        const set = new Set(selectedParticipantIds);
        return (eligibleParticipants || []).filter((p) => set.has(p.id));
    }, [eligibleParticipants, selectedParticipantIds]);

    // ✅ For create: mailing list eligible
    const mailingEligible = useMemo(() => {
        // show all, but sending will only target ACTIVE
        return Array.isArray(mailingList) ? mailingList : [];
    }, [mailingList]);

    const selectedMailingRecipients = useMemo(() => {
        const sel = new Set((selectedMailingListEmails || []).map((e) => normalizeEmail(e)));
        return (mailingEligible || [])
            .filter((m) => sel.has(normalizeEmail(m.email || m.id)))
            .map((m) => ({
                email: normalizeEmail(m.email || m.id),
                name: safeText(m.name).trim(),
                is_active: m.is_active !== false,
            }));
    }, [mailingEligible, selectedMailingListEmails]);

    // edit eligible list (participants)
    const editEligibleParticipants = useMemo(() => {
        const list = participantList;

        if (editPickMode === "all") return list;

        if (editPickMode === "program") {
            const ids = new Set((editEnrollments || []).map((e) => e.participant_id).filter(Boolean));
            return list.filter((p) => ids.has(p.id));
        }

        return list;
    }, [participantList, editPickMode, editEnrollments]);

    // IMPORTANT: use public route for apply page (not localhost / staff origin)
    const applyUrl = selectedBlast?.id ? `${PUBLIC_BASE_URL}/job-apply?blastId=${selectedBlast.id}` : "";

    // auto-select behavior (participants)
    useEffect(() => {
        if (!creating) return;
        if (pickMode === "all") {
            setSelectedParticipantIds((eligibleParticipants || []).map((p) => p.id));
        }
    }, [creating, pickMode, eligibleParticipants]);

    useEffect(() => {
        if (!creating) return;
        if (pickMode !== "program") return;
        if (!selectedProgramId) return;
        setSelectedParticipantIds((eligibleParticipants || []).map((p) => p.id));
    }, [creating, pickMode, selectedProgramId, eligibleParticipants]);

    // ✅ helpful auto-select for mailing list: default to ALL ACTIVE when switching
    useEffect(() => {
        if (!creating) return;
        if (pickMode !== "mailing_list") return;
        const activeEmails = (mailingEligible || [])
            .filter((m) => m.is_active !== false)
            .map((m) => normalizeEmail(m.email || m.id))
            .filter(Boolean);
        setSelectedMailingListEmails(activeEmails);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creating, pickMode]);

    // ---------- create blast ----------
    const toggleParticipant = (id) => {
        setSelectedParticipantIds((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id);
            else s.add(id);
            return Array.from(s);
        });
    };

    const toggleMailingEmail = (email) => {
        const e = normalizeEmail(email);
        if (!e) return;
        setSelectedMailingListEmails((prev) => {
            const s = new Set(prev.map(normalizeEmail));
            if (s.has(e)) s.delete(e);
            else s.add(e);
            return Array.from(s);
        });
    };

    const selectAllEligibleParticipants = () => setSelectedParticipantIds((eligibleParticipants || []).map((p) => p.id));
    const clearParticipantSelection = () => setSelectedParticipantIds([]);

    const selectAllMailing = () =>
        setSelectedMailingListEmails((mailingEligible || []).map((m) => normalizeEmail(m.email || m.id)).filter(Boolean));
    const selectActiveMailingOnly = () =>
        setSelectedMailingListEmails(
            (mailingEligible || [])
                .filter((m) => m.is_active !== false)
                .map((m) => normalizeEmail(m.email || m.id))
                .filter(Boolean)
        );
    const clearMailingSelection = () => setSelectedMailingListEmails([]);

    const resetCreateForm = () => {
        setBusinessName("");
        setAbn("");
        setTitle("");
        setIntro("");
        setRoleDetails("");
        setApplyInstructions("");
        setPickMode("all");
        setSelectedProgramId("");
        setSelectedParticipantIds([]);
        setSelectedMailingListEmails([]);
    };

    const createBlast = async () => {
        if (!businessName.trim()) return alert("Business Name is required");
        if (!title.trim()) return alert("Role / Title is required");
        if (!me?.id) return alert("Not logged in");

        // validate recipients by mode
        if (pickMode === "mailing_list") {
            if (!selectedMailingRecipients.length) return alert("Select at least 1 mailing list recipient");
        } else {
            const recipients = selectedParticipants;
            if (!recipients.length) return alert("Select at least 1 participant recipient");
        }

        const recipientParticipantIds =
            pickMode === "mailing_list" ? [] : selectedParticipants.map((p) => p.id);

        const recipientMailingListEmails =
            pickMode === "mailing_list"
                ? selectedMailingRecipients.map((m) => normalizeEmail(m.email)).filter(Boolean)
                : [];

        await addDoc(collection(db, "jobBlasts"), {
            businessName: businessName.trim(),
            abn: abn.trim(),
            title: title.trim(),
            intro: intro.trim(),
            roleDetails: roleDetails.trim(),
            applyInstructions: applyInstructions.trim(),

            pickMode,
            selectedProgramId: pickMode === "program" ? selectedProgramId : null,

            // participants
            recipientParticipantIds,

            // ✅ mailing list
            recipientMailingListEmails,

            createdById: me.id,
            createdByName: me?.full_name || me?.display_name || me?.email || "Unknown",
            createdByEmail: me?.email || null,
            createdAt: serverTimestamp(),

            status: "Draft",
            lastSentAt: null,
            lastSentCount: 0,
        });

        resetCreateForm();
        setCreating(false);
        alert("Job Blast created (Draft). Select it and click Send.");
    };

    // ---------- sending emails (writes to jobBlastSends; backend sends) ----------
    async function createJobBlastSendRecord(blast, recipients, recipientType) {
        const list = Array.isArray(recipients) ? recipients : [];
        const unique = Array.from(
            new Map(
                list
                    .map((r) => ({
                        email: safeText(r?.email).trim().toLowerCase(),
                        name: safeText(r?.name).trim(),
                    }))
                    .filter((r) => r.email && isValidEmail(r.email))
                    .map((r) => [r.email, r])
            ).values()
        );

        if (!unique.length) return 0;

        const blastId = safeText(blast?.id).trim();
        const replyTo = buildReplyTo(me);
        const publicApplyUrl = blastId ? `${PUBLIC_BASE_URL}/job-apply?blastId=${blastId}` : "";

        await addDoc(collection(db, "jobBlastSends"), {
            blastId,
            recipientType: recipientType || "participant",
            recipients: unique.map((r) => ({ email: r.email, name: r.name || "" })),
            publicApplyUrl,
            replyTo: replyTo || null,
            sentAt: serverTimestamp(),
            sentById: me?.id || null,
            sentByName: me?.full_name || me?.display_name || me?.email || "Unknown",
            sentByEmail: me?.email || null,
        });

        return unique.length;
    }

    async function sendToParticipants(blast) {
        const ids = Array.isArray(blast.recipientParticipantIds) ? blast.recipientParticipantIds : [];
        if (!ids.length) return alert("This blast has no participant recipients.");

        const map = new Map(participantList.map((p) => [p.id, p]));

        // Exclude recipients already sent to (participant sends only)
        const alreadySent = new Set(
            (sendHistory || [])
                .filter((h) => String(h.recipientType || "") === "participant")
                .flatMap((h) => (Array.isArray(h.recipients) ? h.recipients : []))
                .map((r) => safeText(r?.email).toLowerCase())
                .filter(Boolean)
        );

        const recip = ids
            .map((id) => map.get(id))
            .filter(Boolean)
            .map((p) => ({
                email: getParticipantEmail(p),
                name: formatName(p),
            }))
            .filter((r) => !!r.email && isValidEmail(r.email) && !alreadySent.has(r.email.toLowerCase()));

        if (!recip.length) return alert("No new participant recipients to send to (everyone already received it).");

        try {
            const n = await createJobBlastSendRecord(blast, recip, "participant");
            alert(`Queued ${n} participant email(s).`);
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to send.");
        }
    }

    // ✅ NEW: send to mailing list
    async function sendToMailingList(blast) {
        const emails = Array.isArray(blast.recipientMailingListEmails) ? blast.recipientMailingListEmails : [];
        if (!emails.length) return alert("This blast has no mailing list recipients.");

        // pull current mailing list docs (from state) to get name + is_active
        const mlMap = new Map(
            (mailingList || []).map((m) => [normalizeEmail(m.email || m.id), m])
        );

        // Exclude recipients already sent to (mailing list sends only)
        const alreadySent = new Set(
            (sendHistory || [])
                .filter((h) => String(h.recipientType || "") === "mailing_list")
                .flatMap((h) => (Array.isArray(h.recipients) ? h.recipients : []))
                .map((r) => safeText(r?.email).toLowerCase())
                .filter(Boolean)
        );

        const recip = emails
            .map((e) => normalizeEmail(e))
            .filter((e) => e && isValidEmail(e))
            .map((e) => {
                const doc = mlMap.get(e);
                return {
                    email: e,
                    name: safeText(doc?.name).trim(),
                    is_active: doc?.is_active !== false,
                };
            })
            // ✅ only active get sent
            .filter((r) => r.is_active)
            // ✅ new only
            .filter((r) => !alreadySent.has(r.email.toLowerCase()));

        if (!recip.length) {
            return alert("No new ACTIVE mailing list recipients to send to (or they already received it).");
        }

        try {
            const n = await createJobBlastSendRecord(blast, recip, "mailing_list");
            alert(`Queued ${n} mailing list email(s).`);
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to send.");
        }
    }

    // Applicant helpers (your existing resend logic)
    function getApplicantEmail(a) {
        return a?.email || a?.applicantEmail || a?.applicant?.email || a?.userEmail || a?.profile?.email || "";
    }

    function getApplicantName(a) {
        if (typeof formatApplicantName === "function") return formatApplicantName(a);
        const fn = a?.firstName || a?.first_name || a?.applicant?.firstName || "";
        const ln = a?.lastName || a?.last_name || a?.applicant?.lastName || "";
        return [fn, ln].map((x) => String(x || "").trim()).filter(Boolean).join(" ") || "Applicant";
    }

    async function resendToApplicants(blast, onlySelected = false) {
        const apps = Array.isArray(applications) ? applications : [];

        const candidates = apps
            .map((a) => {
                const email = normalizeEmail(getApplicantEmail(a));
                return { email, name: getApplicantName(a), _raw: a };
            })
            .filter((x) => !!x.email && isValidEmail(x.email));

        let recip = candidates;

        if (onlySelected) {
            const sel = new Set((selectedApplicantEmails || []).map((e) => normalizeEmail(e)));
            recip = candidates.filter((x) => sel.has(x.email));
            if (!recip.length) return alert("Select at least 1 applicant (with a valid email).");
        } else {
            if (!apps.length) return alert("No applications found for this blast.");
            if (!candidates.length) {
                const sampleBad = apps.slice(0, 5).map((a) => ({
                    email: String(getApplicantEmail(a) || ""),
                    keys: Object.keys(a || {}),
                }));
                console.warn("No valid applicant emails found. Samples:", sampleBad);
                return alert("No applicants with a valid email were found. Check console for sample application shapes/fields.");
            }
        }

        try {
            const n = await createJobBlastSendRecord(blast, recip, "applicant");
            alert(`Queued ${n} applicant email(s).`);
            setSelectedApplicantEmails([]);
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to resend.");
        }
    }

    // Share selected applications to employer
    async function shareSelectedApplications(blast) {
        const toList = splitEmails(shareTo).filter(isValidEmail);
        if (!toList.length) return alert("Enter at least 1 valid email address to share to.");

        const sel = new Set((selectedApplicantEmails || []).map((e) => e.toLowerCase()));
        const selectedApps = (applications || []).filter((a) => sel.has(safeText(a.email).trim().toLowerCase()));

        if (!selectedApps.length) return alert("Select at least 1 applicant to share.");

        setShareSending(true);
        try {
            const subject =
                safeText(shareSubject).trim() ||
                `${safeText(blast.businessName || "Job")} - ${safeText(blast.title || "Applications")}`;

            const note = safeText(shareNote).trim();
            const replyTo = buildReplyTo(me);

            const applicantsPayload = selectedApps.map((a) => ({
                email: safeText(a.email).trim(),
                name: formatApplicantName(a),
                mobile: safeText(a.mobile).trim(),
                firstNation: safeText(a.firstNation).trim(),
                submittedAt: timestampToDisplay(a.createdAt),
                resumeUrl: safeText(a?.resume?.url).trim(),
                coverLetterUrl: safeText(a?.coverLetter?.url).trim(),
                coverLetterText: safeText(a?.coverLetterText).trim(),
            }));

            await addDoc(collection(db, "jobBlastShares"), {
                blastId: blast.id,
                subject,
                sharedTo: toList,
                applicants: applicantsPayload,
                note: note || "",
                replyTo: replyTo || null,
                sharedAt: serverTimestamp(),
                sharedById: me?.id || null,
                sharedByName: me?.full_name || me?.display_name || me?.email || "Unknown",
                sharedByEmail: me?.email || null,
            });

            alert(`Queued share email(s) to ${toList.length} recipient(s).`);
            setShareOpen(false);
            setShareTo("");
            setShareNote("");
            setShareSubject("");
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to share.");
        } finally {
            setShareSending(false);
        }
    }

    const sentToSummary = useMemo(() => {
        const all = [];
        for (const batch of sendHistory || []) {
            const rec = Array.isArray(batch?.recipients) ? batch.recipients : [];
            for (const r of rec) all.push({ ...r, recipientType: batch.recipientType || "unknown" });
        }
        const dedup = uniqBy(all, (x) => safeText(x.email).toLowerCase());
        dedup.sort((a, b) => safeText(a.email).localeCompare(safeText(b.email)));
        return { totalUnique: dedup.length, list: dedup };
    }, [sendHistory]);

    const openApplicant = (app) => {
        setViewApplicant(app);
        setViewApplicantOpen(true);
    };

    // ---- manage recipients (edit after send) ----
    const openManageRecipients = () => {
        if (!selectedBlast) return;

        const mode = selectedBlast.pickMode || "all";
        setEditPickMode(mode);
        setEditSelectedProgramId(selectedBlast.selectedProgramId || "");
        setEditRecipientIds(Array.isArray(selectedBlast.recipientParticipantIds) ? selectedBlast.recipientParticipantIds : []);
        setEditMailingListEmails(
            Array.isArray(selectedBlast.recipientMailingListEmails) ? selectedBlast.recipientMailingListEmails : []
        );

        setManageRecipientsOpen(true);
    };

    const toggleEditRecipient = (id) => {
        setEditRecipientIds((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id);
            else s.add(id);
            return Array.from(s);
        });
    };

    const toggleEditMailingEmail = (email) => {
        const e = normalizeEmail(email);
        if (!e) return;
        setEditMailingListEmails((prev) => {
            const s = new Set((prev || []).map(normalizeEmail));
            if (s.has(e)) s.delete(e);
            else s.add(e);
            return Array.from(s);
        });
    };

    const saveRecipients = async () => {
        if (!selectedBlast?.id) return;
        const blastId = selectedBlast.id;

        setSavingRecipients(true);
        try {
            // participants final ids
            let finalParticipantIds = editRecipientIds;

            if (editPickMode === "all") {
                finalParticipantIds = (participantList || []).map((p) => p.id);
            } else if (editPickMode === "program") {
                if (!editSelectedProgramId) return alert("Select a program.");
                const ids = new Set((editEnrollments || []).map((e) => e.participant_id).filter(Boolean));
                finalParticipantIds = (participantList || []).filter((p) => ids.has(p.id)).map((p) => p.id);
            } else if (editPickMode === "individual") {
                if (!finalParticipantIds.length) return alert("Select at least 1 participant.");
            }

            // mailing list final emails
            let finalMailingEmails = editMailingListEmails.map(normalizeEmail).filter(Boolean);
            if (editPickMode === "mailing_list" && !finalMailingEmails.length) {
                return alert("Select at least 1 mailing list email.");
            }

            await setDoc(
                doc(db, "jobBlasts", blastId),
                {
                    pickMode: editPickMode,
                    selectedProgramId: editPickMode === "program" ? editSelectedProgramId : null,

                    // participants
                    recipientParticipantIds: editPickMode === "mailing_list" ? [] : finalParticipantIds,

                    // mailing list
                    recipientMailingListEmails: editPickMode === "mailing_list" ? finalMailingEmails : [],

                    updatedAt: serverTimestamp(),
                    updatedById: me?.id || null,
                    updatedByName: me?.full_name || me?.display_name || me?.email || "Unknown",
                    updatedByEmail: me?.email || null,
                },
                { merge: true }
            );

            setManageRecipientsOpen(false);
            alert("Recipients updated. Sending will only email NEW recipients who haven’t received it yet.");
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to update recipients.");
        } finally {
            setSavingRecipients(false);
        }
    };

    // recipients count for list view
    const blastRecipientCount = (b) => {
        const mode = safeText(b?.pickMode || "").trim();
        if (mode === "mailing_list") return Array.isArray(b?.recipientMailingListEmails) ? b.recipientMailingListEmails.length : 0;
        return Array.isArray(b?.recipientParticipantIds) ? b.recipientParticipantIds.length : 0;
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="Job Blast"
                subtitle="Create and send job advertisements. View applications, share documents, resend to applicants, and track activity."
            />

            <div className="flex items-center justify-between gap-3 mb-6">
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setCreating(true)} type="button">
                    Create Job Blast
                </Button>
                <div className="text-sm text-slate-400">
                    {blasts.length} blast{blasts.length === 1 ? "" : "s"}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* List */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Blasts
                    </h3>

                    {blasts.length === 0 ? (
                        <EmptyState icon={Briefcase} title="No Job Blasts" description="Create your first blast to send job opportunities." />
                    ) : (
                        <div className="space-y-2">
                            {blasts.map((b) => {
                                const active = selectedBlast?.id === b.id;
                                const display = `${safeText(b.businessName || "Business")} - ${safeText(b.title || "Role")}`;
                                const appCount = applicationCounts?.[b.id] || 0;

                                return (
                                    <button
                                        key={b.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedBlast(b);
                                            setSelectedApplicantEmails([]);
                                            setHistoryOpen(false);
                                        }}
                                        className={[
                                            "w-full text-left p-3 rounded-xl border transition-colors",
                                            active ? "bg-slate-900 border-blue-500/40" : "bg-slate-950/30 border-slate-800 hover:bg-slate-900/40",
                                        ].join(" ")}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-white font-medium truncate">{display}</div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Recipients: {blastRecipientCount(b)}
                                                    {b?.lastSentCount ? ` | Last sent: ${b.lastSentCount}` : ""}
                                                    {` | Applications: ${appCount}`}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Created by: {safeText(b.createdByName || "Unknown")}
                                                </div>
                                                {safeText(b.pickMode) === "mailing_list" ? (
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        Mode: Mailing List
                                                    </div>
                                                ) : null}
                                            </div>

                                            <Badge className="bg-slate-700/50 text-slate-200">{safeText(b.status || "Draft")}</Badge>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Detail */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Details
                    </h3>

                    {!selectedBlast ? (
                        <div className="text-sm text-slate-500">Select a blast to view applications, share, resend, and see send history.</div>
                    ) : (
                        <div className="space-y-4">
                            {/* Blast summary */}
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                                <div className="text-white font-semibold text-lg">
                                    {safeText(selectedBlast.businessName || "Business")} - {safeText(selectedBlast.title || "Role")}
                                </div>

                                <div className="text-xs text-slate-400 mt-1">
                                    Created by: {safeText(selectedBlast.createdByName || "Unknown")}
                                    {selectedBlast.createdByEmail ? ` (${safeText(selectedBlast.createdByEmail)})` : ""}
                                </div>

                                {selectedBlast.abn ? <div className="text-xs text-slate-400 mt-1">ABN: {safeText(selectedBlast.abn)}</div> : null}

                                {selectedBlast.intro ? <div className="text-sm text-slate-300 whitespace-pre-wrap mt-2">{safeText(selectedBlast.intro)}</div> : null}

                                {selectedBlast.roleDetails ? <div className="text-sm text-slate-300 whitespace-pre-wrap mt-3">{safeText(selectedBlast.roleDetails)}</div> : null}

                                {selectedBlast.applyInstructions ? (
                                    <div className="text-sm text-slate-300 whitespace-pre-wrap mt-3">{safeText(selectedBlast.applyInstructions)}</div>
                                ) : null}

                                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                                    <div className="flex items-center gap-2 text-sm text-slate-200 font-medium">
                                        <LinkIcon className="h-4 w-4" />
                                        Apply link (public)
                                    </div>
                                    <div className="text-xs text-slate-400 break-all mt-1">{applyUrl}</div>
                                </div>

                                {/* send actions */}
                                <div className="flex flex-wrap gap-2 mt-4">
                                    <Button
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => sendToParticipants(selectedBlast)}
                                        type="button"
                                        title="Sends to NEW participant recipients only"
                                        disabled={(selectedBlast.pickMode || "") === "mailing_list"}
                                    >
                                        <Send className="h-4 w-4 mr-2" />
                                        Send to Participants (new only)
                                    </Button>

                                    <Button
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => sendToMailingList(selectedBlast)}
                                        type="button"
                                        title="Sends to NEW ACTIVE mailing list recipients only"
                                        disabled={(selectedBlast.pickMode || "") !== "mailing_list"}
                                    >
                                        <Send className="h-4 w-4 mr-2" />
                                        Send to Mailing List (new only)
                                    </Button>

                                    <Button
                                        variant="outline"
                                        className="border-slate-700"
                                        onClick={() => resendToApplicants(selectedBlast, false)}
                                        type="button"
                                        title="Resend to all applicants"
                                    >
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Resend to All Applicants
                                    </Button>

                                    <Button
                                        variant="outline"
                                        className="border-slate-700"
                                        onClick={openManageRecipients}
                                        type="button"
                                        title="Edit recipients"
                                    >
                                        <Settings className="h-4 w-4 mr-2" />
                                        Manage Recipients
                                    </Button>
                                </div>

                                {/* Collapsible history */}
                                <div className="mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setHistoryOpen((v) => !v)}
                                        className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-2 hover:bg-slate-900/40"
                                    >
                                        <div className="flex items-center gap-2 text-sm text-slate-200">
                                            <Users className="h-4 w-4" />
                                            Sent to ({sentToSummary.totalUnique})
                                        </div>
                                        {historyOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                                    </button>

                                    {historyOpen ? (
                                        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                                            {sentToSummary.list.length === 0 ? (
                                                <div className="text-sm text-slate-500">No send history yet.</div>
                                            ) : (
                                                <div className="max-h-52 overflow-y-auto space-y-2">
                                                    {sentToSummary.list.map((r) => (
                                                        <div key={r.email} className="flex items-center justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className="text-sm text-white truncate">{safeText(r.email)}</div>
                                                                {r.name ? <div className="text-xs text-slate-500 truncate">{safeText(r.name)}</div> : null}
                                                            </div>
                                                            <Badge className="bg-slate-700/50 text-slate-200">{safeText(r.recipientType)}</Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Applicants list + resend + share + export */}
                            <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="text-white font-semibold flex items-center gap-2">
                                        <Mail className="h-4 w-4" />
                                        Applicants ({applications.length})
                                    </div>

                                    <div className="flex gap-2 flex-wrap">
                                        <Button
                                            className="bg-blue-600 hover:bg-blue-700"
                                            onClick={() => resendToApplicants(selectedBlast, true)}
                                            type="button"
                                            disabled={selectedApplicantEmails.length === 0}
                                            title="Resend to selected applicants"
                                        >
                                            <RefreshCw className="h-4 w-4 mr-2" />
                                            Resend Selected
                                        </Button>

                                        <Button
                                            variant="outline"
                                            className="border-slate-700"
                                            onClick={() => {
                                                const subjectDefault = `${safeText(selectedBlast.businessName || "Job")} - ${safeText(selectedBlast.title || "Applications")}`;
                                                setShareSubject(subjectDefault);
                                                setShareOpen(true);
                                            }}
                                            type="button"
                                            disabled={selectedApplicantEmails.length === 0}
                                            title="Share selected applications to employer email(s)"
                                        >
                                            <Share2 className="h-4 w-4 mr-2" />
                                            Share Selected
                                        </Button>

                                        <Button
                                            variant="outline"
                                            className="border-slate-700"
                                            type="button"
                                            onClick={() => {
                                                const csv = buildApplicationsCsv(applications || []);
                                                const safeName = `${safeText(selectedBlast.title || "blast").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_")}`;
                                                downloadTextFile(`applications_${safeName}.csv`, csv, "text/csv");
                                            }}
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Export CSV
                                        </Button>
                                    </div>
                                </div>

                                <div className="text-xs text-slate-500 mt-1">
                                    Click an applicant to view their details and documents. Use the checkbox to select for resend/share.
                                </div>

                                <div className="mt-3 max-h-96 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40">
                                    {applications.length === 0 ? (
                                        <div className="p-3 text-sm text-slate-500">No applications yet.</div>
                                    ) : (
                                        applications.map((a) => {
                                            const email = safeText(a.email).trim();
                                            const checked = !!email && selectedApplicantEmails.includes(email);

                                            const name = formatApplicantName(a);
                                            const submitted = timestampToDisplay(a.createdAt);

                                            const resumeUrl = safeText(a?.resume?.url).trim();
                                            const coverUrl = safeText(a?.coverLetter?.url).trim();

                                            return (
                                                <div
                                                    key={a.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => openApplicant(a)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") openApplicant(a);
                                                    }}
                                                    className="px-3 py-3 border-b border-slate-800 last:border-b-0 hover:bg-slate-900/40 cursor-pointer"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                disabled={!email}
                                                                checked={checked}
                                                                onChange={() => {
                                                                    if (!email) return;
                                                                    setSelectedApplicantEmails((prev) => {
                                                                        const s = new Set(prev);
                                                                        if (s.has(email)) s.delete(email);
                                                                        else s.add(email);
                                                                        return Array.from(s);
                                                                    });
                                                                }}
                                                            />
                                                        </div>

                                                        <div className="min-w-0 w-full">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0">
                                                                    <div className="text-sm text-white font-medium truncate">{name}</div>
                                                                    <div className="text-xs text-slate-500 truncate">
                                                                        {email || "No email provided"}
                                                                        {safeText(a.mobile).trim() ? ` | ${safeText(a.mobile).trim()}` : ""}
                                                                        {submitted ? ` | ${submitted}` : ""}
                                                                    </div>
                                                                    {safeText(a.firstNation).trim() ? (
                                                                        <div className="text-xs text-slate-500 mt-1">First Nation: {safeText(a.firstNation).trim()}</div>
                                                                    ) : null}
                                                                </div>

                                                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                                                    {resumeUrl ? (
                                                                        <span className="text-xs px-2 py-1 rounded-md border border-slate-700 text-slate-200">Resume</span>
                                                                    ) : (
                                                                        <span className="text-xs text-slate-500">No resume</span>
                                                                    )}
                                                                    {coverUrl ? (
                                                                        <span className="text-xs px-2 py-1 rounded-md border border-slate-700 text-slate-200">Cover letter</span>
                                                                    ) : null}
                                                                </div>
                                                            </div>

                                                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                                                <User className="h-3.5 w-3.5" />
                                                                View details
                                                                <ExternalLink className="h-3.5 w-3.5" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Applicant view dialog */}
            <Dialog open={viewApplicantOpen} onOpenChange={setViewApplicantOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-5xl p-0">
                    <div className="flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-slate-800">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <User className="h-5 w-5 text-blue-400" />
                                    Applicant
                                </DialogTitle>
                            </DialogHeader>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {!viewApplicant ? (
                                <div className="text-slate-300">No applicant selected.</div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                        <div className="text-lg font-semibold text-white">{formatApplicantName(viewApplicant)}</div>
                                        <div className="text-sm text-slate-300 mt-2 space-y-1">
                                            <div>
                                                <span className="text-slate-400">Email:</span> {safeText(viewApplicant.email)}
                                            </div>
                                            <div>
                                                <span className="text-slate-400">Mobile:</span> {safeText(viewApplicant.mobile)}
                                            </div>
                                            <div>
                                                <span className="text-slate-400">First Nation:</span> {safeText(viewApplicant.firstNation)}
                                            </div>
                                            <div>
                                                <span className="text-slate-400">Submitted:</span> {timestampToDisplay(viewApplicant.createdAt)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        {/* Resume */}
                                        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-white font-semibold">Resume</div>
                                                {safeText(viewApplicant?.resume?.url).trim() ? (
                                                    <a
                                                        href={safeText(viewApplicant.resume.url).trim()}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs px-2 py-1 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                                                    >
                                                        Open
                                                    </a>
                                                ) : null}
                                            </div>

                                            {safeText(viewApplicant?.resume?.url).trim() ? (
                                                <iframe
                                                    title="Resume preview"
                                                    src={safeText(viewApplicant.resume.url).trim()}
                                                    className="w-full h-[520px] mt-3 rounded-xl border border-slate-800 bg-slate-950"
                                                />
                                            ) : (
                                                <div className="text-sm text-slate-500 mt-3">No resume uploaded.</div>
                                            )}
                                        </div>

                                        {/* Cover letter */}
                                        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-white font-semibold">Cover letter</div>
                                                {safeText(viewApplicant?.coverLetter?.url).trim() ? (
                                                    <a
                                                        href={safeText(viewApplicant.coverLetter.url).trim()}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-xs px-2 py-1 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
                                                    >
                                                        Open file
                                                    </a>
                                                ) : null}
                                            </div>

                                            {safeText(viewApplicant?.coverLetter?.url).trim() ? (
                                                <iframe
                                                    title="Cover letter preview"
                                                    src={safeText(viewApplicant.coverLetter.url).trim()}
                                                    className="w-full h-[320px] mt-3 rounded-xl border border-slate-800 bg-slate-950"
                                                />
                                            ) : null}

                                            {safeText(viewApplicant?.coverLetterText).trim() ? (
                                                <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                                                    <div className="text-xs text-slate-400 mb-2">Cover letter text</div>
                                                    <div className="text-sm text-slate-200 whitespace-pre-wrap">{safeText(viewApplicant.coverLetterText).trim()}</div>
                                                </div>
                                            ) : (
                                                <div className="text-sm text-slate-500 mt-3">No cover letter text provided.</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-2">
                                        <Button variant="outline" className="border-slate-700 hover:bg-slate-800" onClick={() => setViewApplicantOpen(false)} type="button">
                                            Close
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Share dialog */}
            <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-white">Share selected applications</DialogTitle>
                    </DialogHeader>

                    {!selectedBlast ? (
                        <div className="text-sm text-slate-400">Select a blast first.</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="text-sm text-slate-300">
                                This sends an email with links to resumes and cover letters for the selected applicants.
                            </div>

                            <div>
                                <Label className="text-slate-300">To (comma or new line separated)</Label>
                                <Textarea
                                    value={shareTo}
                                    onChange={(e) => setShareTo(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white min-h-20"
                                    placeholder="e.g. hiring@business.com, manager@business.com"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Subject</Label>
                                <Input value={shareSubject} onChange={(e) => setShareSubject(e.target.value)} className="bg-slate-800 border-slate-700 text-white" />
                            </div>

                            <div>
                                <Label className="text-slate-300">Note (optional)</Label>
                                <Textarea
                                    value={shareNote}
                                    onChange={(e) => setShareNote(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-white min-h-20"
                                    placeholder="Add context for the employer (optional)."
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" className="border-slate-700" type="button" onClick={() => setShareOpen(false)} disabled={shareSending}>
                                    Cancel
                                </Button>
                                <Button className="bg-blue-600 hover:bg-blue-700" type="button" onClick={() => shareSelectedApplications(selectedBlast)} disabled={shareSending}>
                                    {shareSending ? "Sending..." : "Send share email"}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Manage Recipients dialog */}
            <Dialog open={manageRecipientsOpen} onOpenChange={setManageRecipientsOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white">Manage recipients</DialogTitle>
                    </DialogHeader>

                    {!selectedBlast ? (
                        <div className="text-sm text-slate-400">Select a blast first.</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="text-sm text-slate-300">
                                Update recipients for this blast. Sending will email <b>new</b> recipients who haven’t received it yet.
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-slate-300">Recipients mode</Label>
                                    <Select value={editPickMode} onValueChange={setEditPickMode}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-800 border-slate-700">
                                            <SelectItem value="all" className="text-white">All Participants</SelectItem>
                                            <SelectItem value="program" className="text-white">Program-based</SelectItem>
                                            <SelectItem value="individual" className="text-white">Individual selection</SelectItem>
                                            <SelectItem value="mailing_list" className="text-white">Mailing List</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {editPickMode === "program" && (
                                    <div>
                                        <Label className="text-slate-300">Program</Label>
                                        <Select value={editSelectedProgramId} onValueChange={setEditSelectedProgramId}>
                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                                <SelectValue placeholder="Select program" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                {programList.map((p) => (
                                                    <SelectItem key={p.id} value={p.id} className="text-white">
                                                        {safeText(p.program_name)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>

                            {/* Participants selection */}
                            {editPickMode === "individual" ? (
                                <div>
                                    <Label className="text-slate-300">Select participants</Label>
                                    <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/30 p-2 mt-2">
                                        {editEligibleParticipants.map((p) => {
                                            const checked = editRecipientIds.includes(p.id);
                                            const email = getParticipantEmail(p);

                                            return (
                                                <label key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900/40 cursor-pointer">
                                                    <input type="checkbox" checked={checked} onChange={() => toggleEditRecipient(p.id)} />
                                                    <div className="min-w-0">
                                                        <div className="text-sm text-slate-200 truncate">{formatName(p)}</div>
                                                        <div className="text-xs text-slate-500 truncate">{email || "No email found"}</div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-2">Selected: {editRecipientIds.length}</div>
                                </div>
                            ) : null}

                            {/* ✅ Mailing List selection */}
                            {editPickMode === "mailing_list" ? (
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <Label className="text-slate-300">Select mailing list recipients</Label>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                className="border-slate-700"
                                                type="button"
                                                onClick={() => setEditMailingListEmails((mailingList || []).map((m) => normalizeEmail(m.email || m.id)).filter(Boolean))}
                                            >
                                                Select all
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="border-slate-700"
                                                type="button"
                                                onClick={() => setEditMailingListEmails((mailingList || []).filter((m) => m.is_active !== false).map((m) => normalizeEmail(m.email || m.id)).filter(Boolean))}
                                            >
                                                Active only
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="border-slate-700"
                                                type="button"
                                                onClick={() => setEditMailingListEmails([])}
                                            >
                                                Clear
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/30 p-2 mt-2">
                                        {(mailingList || []).map((m) => {
                                            const email = normalizeEmail(m.email || m.id);
                                            const checked = editMailingListEmails.map(normalizeEmail).includes(email);
                                            const active = m.is_active !== false;

                                            return (
                                                <label key={email} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900/40 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleEditMailingEmail(email)}
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="text-sm text-slate-200 truncate">
                                                            {safeText(m.name).trim() || "—"}
                                                        </div>
                                                        <div className="text-xs text-slate-500 truncate">{email}</div>
                                                    </div>
                                                    <div className="ml-auto">
                                                        <Badge className={active ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700/40 text-slate-300"}>
                                                            {active ? "Active" : "Not Active"}
                                                        </Badge>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                        {(mailingList || []).length === 0 ? (
                                            <div className="text-sm text-slate-500 p-2">No mailing list contacts found (Admin → Emails).</div>
                                        ) : null}
                                    </div>

                                    <div className="text-xs text-slate-500 mt-2">Selected: {editMailingListEmails.length}</div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Note: sending emails will only go to <b>Active</b> contacts.
                                    </div>
                                </div>
                            ) : null}

                            {editPickMode !== "individual" && editPickMode !== "mailing_list" ? (
                                <div className="text-xs text-slate-500">
                                    For <b>{editPickMode}</b> mode, recipients are derived automatically when you save.
                                </div>
                            ) : null}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <Button variant="outline" className="border-slate-700" type="button" onClick={() => setManageRecipientsOpen(false)} disabled={savingRecipients}>
                                    Cancel
                                </Button>
                                <Button className="bg-blue-600 hover:bg-blue-700" type="button" onClick={saveRecipients} disabled={savingRecipients}>
                                    <Save className="h-4 w-4 mr-2" />
                                    {savingRecipients ? "Saving..." : "Save recipients"}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create dialog (scrollable) */}
            <Dialog open={creating} onOpenChange={setCreating}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white">Create Job Blast</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div>
                            <Label className="text-slate-300">Business Name *</Label>
                            <Input
                                className="bg-slate-800 border-slate-700 text-white"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="e.g. ABC Hospitality Pty Ltd"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">ABN</Label>
                            <Input className="bg-slate-800 border-slate-700 text-white" value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="e.g. 12 345 678 901" />
                        </div>

                        <div className="md:col-span-2">
                            <Label className="text-slate-300">Role / Title *</Label>
                            <Input className="bg-slate-800 border-slate-700 text-white" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kitchen Hand" />
                        </div>

                        <div className="md:col-span-2">
                            <Label className="text-slate-300">Intro</Label>
                            <Textarea className="bg-slate-800 border-slate-700 text-white" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
                        </div>

                        <div className="md:col-span-2">
                            <Label className="text-slate-300">Role details</Label>
                            <Textarea className="bg-slate-800 border-slate-700 text-white" rows={6} value={roleDetails} onChange={(e) => setRoleDetails(e.target.value)} />
                        </div>

                        <div className="md:col-span-2">
                            <Label className="text-slate-300">Apply instructions</Label>
                            <Textarea className="bg-slate-800 border-slate-700 text-white" rows={3} value={applyInstructions} onChange={(e) => setApplyInstructions(e.target.value)} />
                        </div>

                        <div>
                            <Label className="text-slate-300">Recipients mode</Label>
                            <Select
                                value={pickMode}
                                onValueChange={(v) => {
                                    setPickMode(v);
                                    // reset selection per mode when switching
                                    if (v === "mailing_list") {
                                        setSelectedParticipantIds([]);
                                        setSelectedProgramId("");
                                    } else {
                                        setSelectedMailingListEmails([]);
                                    }
                                }}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    <SelectItem value="all" className="text-white">All Participants</SelectItem>
                                    <SelectItem value="program" className="text-white">Program-based</SelectItem>
                                    <SelectItem value="individual" className="text-white">Individual selection</SelectItem>
                                    <SelectItem value="mailing_list" className="text-white">Mailing List</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {pickMode === "program" && (
                            <div>
                                <Label className="text-slate-300">Program</Label>
                                <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue placeholder="Select program" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {programList.map((p) => (
                                            <SelectItem key={p.id} value={p.id} className="text-white">
                                                {safeText(p.program_name)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* Participants picker */}
                        {pickMode !== "mailing_list" ? (
                            <div className="md:col-span-2">
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-slate-300">Select participants</Label>
                                    <div className="flex gap-2">
                                        <Button variant="outline" className="border-slate-700" onClick={selectAllEligibleParticipants} type="button">
                                            Select all
                                        </Button>
                                        <Button variant="outline" className="border-slate-700" onClick={clearParticipantSelection} type="button">
                                            Clear
                                        </Button>
                                    </div>
                                </div>

                                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/30 p-2">
                                    {eligibleParticipants.map((p) => {
                                        const checked = selectedParticipantIds.includes(p.id);
                                        const email = getParticipantEmail(p);

                                        return (
                                            <label key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900/40 cursor-pointer">
                                                <input type="checkbox" checked={checked} onChange={() => toggleParticipant(p.id)} />
                                                <div className="min-w-0">
                                                    <div className="text-sm text-slate-200 truncate">{formatName(p)}</div>
                                                    <div className="text-xs text-slate-500 truncate">{email || "No email found"}</div>
                                                </div>
                                            </label>
                                        );
                                    })}

                                    {eligibleParticipants.length === 0 && <div className="text-sm text-slate-500 p-2">No eligible participants for this mode.</div>}
                                </div>

                                <div className="text-xs text-slate-500 mt-2">Selected: {selectedParticipantIds.length}</div>
                            </div>
                        ) : null}

                        {/* ✅ Mailing List picker */}
                        {pickMode === "mailing_list" ? (
                            <div className="md:col-span-2">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <Label className="text-slate-300">Select mailing list recipients</Label>
                                    <div className="flex gap-2 flex-wrap justify-end">
                                        <Button variant="outline" className="border-slate-700" onClick={selectAllMailing} type="button">
                                            Select all
                                        </Button>
                                        <Button variant="outline" className="border-slate-700" onClick={selectActiveMailingOnly} type="button">
                                            Active only
                                        </Button>
                                        <Button variant="outline" className="border-slate-700" onClick={clearMailingSelection} type="button">
                                            Clear
                                        </Button>
                                    </div>
                                </div>

                                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/30 p-2">
                                    {(mailingEligible || []).map((m) => {
                                        const email = normalizeEmail(m.email || m.id);
                                        const checked = (selectedMailingListEmails || []).map(normalizeEmail).includes(email);
                                        const active = m.is_active !== false;

                                        return (
                                            <label key={email} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900/40 cursor-pointer">
                                                <input type="checkbox" checked={checked} onChange={() => toggleMailingEmail(email)} />
                                                <div className="min-w-0">
                                                    <div className="text-sm text-slate-200 truncate">{safeText(m.name).trim() || "—"}</div>
                                                    <div className="text-xs text-slate-500 truncate">{email}</div>
                                                </div>
                                                <div className="ml-auto">
                                                    <Badge className={active ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700/40 text-slate-300"}>
                                                        {active ? "Active" : "Not Active"}
                                                    </Badge>
                                                </div>
                                            </label>
                                        );
                                    })}

                                    {(mailingEligible || []).length === 0 ? (
                                        <div className="text-sm text-slate-500 p-2">
                                            No mailing list contacts found (Admin → Emails).
                                        </div>
                                    ) : null}
                                </div>

                                <div className="text-xs text-slate-500 mt-2">Selected: {selectedMailingListEmails.length}</div>
                                <div className="text-xs text-slate-500 mt-1">
                                    Note: sending will only go to <b>Active</b> contacts.
                                </div>
                            </div>
                        ) : null}

                        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                className="border-slate-700"
                                onClick={() => {
                                    setCreating(false);
                                    resetCreateForm();
                                }}
                                type="button"
                            >
                                Cancel
                            </Button>
                            <Button className="bg-blue-600 hover:bg-blue-700" onClick={createBlast} type="button">
                                Create (Draft)
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
