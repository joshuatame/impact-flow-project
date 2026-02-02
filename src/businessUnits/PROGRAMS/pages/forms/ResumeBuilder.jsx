// PART 1/2 - src/pages/ResumeBuilder.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { FileText, Sparkles, Download, Save, ArrowLeft, Briefcase, Pencil } from "lucide-react";
import { jsPDF } from "jspdf";

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function safeList(v) {
    return Array.isArray(v) ? v : [];
}

function todayIso() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function toFileFromBlob(blob, filename) {
    try {
        return new File([blob], filename, { type: "application/pdf" });
    } catch {
        blob.name = filename;
        return blob;
    }
}

function normalizeIndustryValue(v) {
    const s = safeText(v).trim();
    return s || "General";
}

function buildResumeSchema() {
    return {
        type: "object",
        additionalProperties: false,
        properties: {
            fullName: { type: "string" },
            headline: { type: "string" },
            summary: { type: "string" },
            contact: {
                type: "object",
                additionalProperties: false,
                properties: {
                    email: { type: "string" },
                    phone: { type: "string" },
                    suburb: { type: "string" },
                    state: { type: "string" },
                },
                required: ["email", "phone", "suburb", "state"],
            },
            coreSkills: { type: "array", items: { type: "string" } },
            experience: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        role: { type: "string" },
                        employer: { type: "string" },
                        location: { type: "string" },
                        start: { type: "string" },
                        end: { type: "string" },
                        bullets: { type: "array", items: { type: "string" } },
                    },
                    required: ["role", "employer", "location", "start", "end", "bullets"],
                },
            },
            education: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        qualification: { type: "string" },
                        provider: { type: "string" },
                        year: { type: "string" },
                    },
                    required: ["qualification", "provider", "year"],
                },
            },
            certifications: { type: "array", items: { type: "string" } },
            licences: { type: "array", items: { type: "string" } },
            referees: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        name: { type: "string" },
                        relationship: { type: "string" },
                        phone: { type: "string" },
                        email: { type: "string" },
                    },
                    required: ["name", "relationship", "phone", "email"],
                },
            },
        },
        required: [
            "fullName",
            "headline",
            "summary",
            "contact",
            "coreSkills",
            "experience",
            "education",
            "certifications",
            "licences",
            "referees",
        ],
    };
}

function defaultResumeFromParticipant(p) {
    const fn = safeText(p?.first_name).trim();
    const ln = safeText(p?.last_name).trim();
    const fullName = [fn, ln].filter(Boolean).join(" ").trim() || "Participant";

    return {
        fullName,
        headline: "Motivated candidate seeking employment opportunities",
        summary:
            "Reliable and committed individual bringing a strong work ethic, willingness to learn, and a positive attitude. Seeking an opportunity to build skills and contribute to a team environment.",
        contact: {
            email: safeText(p?.contact_email || p?.email || "").trim(),
            phone: safeText(p?.contact_phone || p?.phone || "").trim(),
            suburb: safeText(p?.suburb || "").trim(),
            state: safeText(p?.state || "").trim(),
        },
        coreSkills: [],
        experience: [],
        education: [],
        certifications: [],
        licences: [],
        referees: [],
    };
}

function sanitizeForPdf(input) {
    const s = safeText(input);

    const replaced = s
        .replace(/\u2022/g, "-")
        .replace(/\u00A0/g, " ")
        .replace(/[\u200B-\u200D\uFEFF]/g, "");

    return replaced.normalize("NFKD").replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function renderResumePdf(resume) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 48;
    const right = pageWidth - 48;
    const maxWidth = right - left;

    let y = 54;

    const h1 = 18;
    const h2 = 12;
    const body = 10;

    const addWrapped = (text, fontSize, bold = false, gap = 10) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(fontSize);

        const clean = sanitizeForPdf(text);
        const lines = doc.splitTextToSize(clean, maxWidth);

        for (const line of lines) {
            if (y > 790) {
                doc.addPage();
                y = 54;
            }
            doc.text(line, left, y);
            y += fontSize + 4;
        }
        y += gap;
    };

    addWrapped(resume.fullName || "", h1, true, 6);

    const c = resume.contact || {};
    const contactLine = [
        safeText(c.phone).trim(),
        safeText(c.email).trim(),
        [safeText(c.suburb).trim(), safeText(c.state).trim()].filter(Boolean).join(", "),
    ]
        .filter(Boolean)
        .join("  |  ");
    if (contactLine) addWrapped(contactLine, body, false, 14);

    if (safeText(resume.headline).trim()) addWrapped(resume.headline, h2, true, 10);

    addWrapped("Professional Summary", h2, true, 6);
    addWrapped(resume.summary || "", body, false, 10);

    const skills = safeList(resume.coreSkills).filter(Boolean);
    if (skills.length) {
        addWrapped("Core Skills", h2, true, 6);
        addWrapped(skills.join("  |  "), body, false, 10);
    }

    const exp = safeList(resume.experience);
    if (exp.length) {
        addWrapped("Employment History", h2, true, 6);
        for (const item of exp) {
            const title = `${safeText(item.role).trim()} - ${safeText(item.employer).trim()}`.trim();
            const meta = [
                safeText(item.location).trim(),
                `${safeText(item.start).trim()} to ${safeText(item.end).trim()}`.trim(),
            ]
                .filter(Boolean)
                .join("  |  ");

            addWrapped(title, body, true, 2);
            if (meta) addWrapped(meta, body, false, 4);

            const bullets = safeList(item.bullets).filter(Boolean);
            for (const b of bullets) addWrapped(`- ${b}`, body, false, 0);

            y += 10;
        }
    }

    const edu = safeList(resume.education);
    if (edu.length) {
        addWrapped("Education and Training", h2, true, 6);
        for (const e of edu) {
            const line = `${safeText(e.qualification).trim()} - ${safeText(e.provider).trim()} (${safeText(e.year).trim()})`.trim();
            addWrapped(line, body, false, 4);
        }
        y += 6;
    }

    const certs = safeList(resume.certifications).filter(Boolean);
    if (certs.length) {
        addWrapped("Certificates", h2, true, 6);
        for (const c2 of certs) addWrapped(`- ${c2}`, body, false, 0);
        y += 10;
    }

    const lic = safeList(resume.licences).filter(Boolean);
    if (lic.length) {
        addWrapped("Licences", h2, true, 6);
        for (const l2 of lic) addWrapped(`- ${l2}`, body, false, 0);
        y += 10;
    }

    const refs = safeList(resume.referees);
    if (refs.length) {
        addWrapped("Referees", h2, true, 6);
        for (const r of refs) {
            const line = `${safeText(r.name).trim()} - ${safeText(r.relationship).trim()}  |  ${safeText(r.phone).trim()}  |  ${safeText(r.email).trim()}`.trim();
            addWrapped(line, body, false, 4);
        }
    }

    return doc;
}

function cloneResume(r) {
    const base = r || {};
    return {
        fullName: safeText(base.fullName),
        headline: safeText(base.headline),
        summary: safeText(base.summary),
        contact: {
            email: safeText(base.contact?.email),
            phone: safeText(base.contact?.phone),
            suburb: safeText(base.contact?.suburb),
            state: safeText(base.contact?.state),
        },
        coreSkills: safeList(base.coreSkills).map((x) => safeText(x)).filter(Boolean),
        experience: safeList(base.experience).map((e) => ({
            role: safeText(e?.role),
            employer: safeText(e?.employer),
            location: safeText(e?.location),
            start: safeText(e?.start),
            end: safeText(e?.end),
            bullets: safeList(e?.bullets).map((b) => safeText(b)).filter(Boolean),
        })),
        education: safeList(base.education).map((e) => ({
            qualification: safeText(e?.qualification),
            provider: safeText(e?.provider),
            year: safeText(e?.year),
        })),
        certifications: safeList(base.certifications).map((x) => safeText(x)).filter(Boolean),
        licences: safeList(base.licences).map((x) => safeText(x)).filter(Boolean),
        referees: safeList(base.referees).map((x) => ({
            name: safeText(x?.name),
            relationship: safeText(x?.relationship),
            phone: safeText(x?.phone),
            email: safeText(x?.email),
        })),
    };
}

function listToCommaString(list) {
    return safeList(list).map((x) => safeText(x).trim()).filter(Boolean).join(", ");
}

function commaStringToList(s) {
    return safeText(s)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
}

function linesToList(s) {
    return safeText(s)
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
}

function listToLines(list) {
    return safeList(list).map((x) => safeText(x).trim()).filter(Boolean).join("\n");
}

function expToEditorText(expList) {
    const blocks = safeList(expList).map((e) => {
        const bullets = listToLines(e?.bullets || []);
        return [
            `Role: ${safeText(e?.role)}`,
            `Employer: ${safeText(e?.employer)}`,
            `Location: ${safeText(e?.location)}`,
            `Start: ${safeText(e?.start)}`,
            `End: ${safeText(e?.end)}`,
            `Bullets:`,
            bullets ? bullets : "",
        ].join("\n");
    });
    return blocks.join("\n\n---\n\n");
}

function editorTextToExp(text) {
    const rawBlocks = safeText(text).split("\n---\n").map((b) => b.trim()).filter(Boolean);

    const items = rawBlocks.map((block) => {
        const lines = block.split("\n");
        const getValue = (prefix) => {
            const line = lines.find((l) => l.startsWith(prefix));
            return line ? line.slice(prefix.length).trim() : "";
        };

        const role = getValue("Role:");
        const employer = getValue("Employer:");
        const location = getValue("Location:");
        const start = getValue("Start:");
        const end = getValue("End:");

        const bulletsIndex = lines.findIndex((l) => l.trim() === "Bullets:");
        const bulletLines = bulletsIndex >= 0 ? lines.slice(bulletsIndex + 1) : [];
        const bullets = bulletLines.map((x) => x.trim()).filter(Boolean);

        // Ignore empty blocks
        const hasContent = [role, employer, location, start, end, ...bullets].some((x) => safeText(x).trim());
        if (!hasContent) return null;

        return {
            role,
            employer,
            location,
            start,
            end,
            bullets,
        };
    });

    return items.filter(Boolean);
}

function eduToEditorText(eduList) {
    const blocks = safeList(eduList).map((e) => {
        return [
            `Qualification: ${safeText(e?.qualification)}`,
            `Provider: ${safeText(e?.provider)}`,
            `Year: ${safeText(e?.year)}`,
        ].join("\n");
    });
    return blocks.join("\n\n---\n\n");
}

function editorTextToEdu(text) {
    const rawBlocks = safeText(text).split("\n---\n").map((b) => b.trim()).filter(Boolean);

    const items = rawBlocks.map((block) => {
        const lines = block.split("\n");
        const getValue = (prefix) => {
            const line = lines.find((l) => l.startsWith(prefix));
            return line ? line.slice(prefix.length).trim() : "";
        };

        const qualification = getValue("Qualification:");
        const provider = getValue("Provider:");
        const year = getValue("Year:");

        const hasContent = [qualification, provider, year].some((x) => safeText(x).trim());
        if (!hasContent) return null;

        return { qualification, provider, year };
    });

    return items.filter(Boolean);
}

function refsToEditorText(refs) {
    const blocks = safeList(refs).map((r) => {
        return [
            `Name: ${safeText(r?.name)}`,
            `Relationship: ${safeText(r?.relationship)}`,
            `Phone: ${safeText(r?.phone)}`,
            `Email: ${safeText(r?.email)}`,
        ].join("\n");
    });
    return blocks.join("\n\n---\n\n");
}

function editorTextToRefs(text) {
    const rawBlocks = safeText(text).split("\n---\n").map((b) => b.trim()).filter(Boolean);

    const items = rawBlocks.map((block) => {
        const lines = block.split("\n");
        const getValue = (prefix) => {
            const line = lines.find((l) => l.startsWith(prefix));
            return line ? line.slice(prefix.length).trim() : "";
        };

        const name = getValue("Name:");
        const relationship = getValue("Relationship:");
        const phone = getValue("Phone:");
        const email = getValue("Email:");

        const hasContent = [name, relationship, phone, email].some((x) => safeText(x).trim());
        if (!hasContent) return null;

        return { name, relationship, phone, email };
    });

    return items.filter(Boolean);
}

export default function ResumeBuilder() {
    const params = new URLSearchParams(window.location.search);
    const participantId = params.get("participant_id") || params.get("id") || "";

    const queryClient = useQueryClient();

    const { data: participant, isLoading } = useQuery({
        queryKey: ["participant", participantId],
        queryFn: () => base44.entities.Participant.get(participantId),
        enabled: !!participantId,
        staleTime: 60 * 1000,
        placeholderData: () => queryClient.getQueryData(["participant", participantId]) || null,
    });

    const [industry, setIndustry] = useState("General");

    const [dialogOpen, setDialogOpen] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [saveBusy, setSaveBusy] = useState(false);

    const [editOpen, setEditOpen] = useState(false);

    const [targetRole, setTargetRole] = useState("");
    const [workHistoryNotes, setWorkHistoryNotes] = useState("");
    const [trainingNotes, setTrainingNotes] = useState("");
    const [skillsNotes, setSkillsNotes] = useState("");
    const [achievementsNotes, setAchievementsNotes] = useState("");
    const [barriersNotes, setBarriersNotes] = useState("");

    const [resume, setResume] = useState(null);
    const [pdfUrl, setPdfUrl] = useState("");

    const baseResume = useMemo(() => {
        if (!participant) return null;
        return defaultResumeFromParticipant(participant);
    }, [participant]);

    const canGenerate = Boolean(participantId && participant);

    const [editDraft, setEditDraft] = useState(null);
    const [editSkillsText, setEditSkillsText] = useState("");
    const [editCertsText, setEditCertsText] = useState("");
    const [editLicencesText, setEditLicencesText] = useState("");
    const [editExpText, setEditExpText] = useState("");
    const [editEduText, setEditEduText] = useState("");
    const [editRefsText, setEditRefsText] = useState("");

    const openEditDialog = () => {
        if (!resume) return;
        const draft = cloneResume(resume);
        setEditDraft(draft);
        setEditSkillsText(listToCommaString(draft.coreSkills));
        setEditCertsText(listToLines(draft.certifications));
        setEditLicencesText(listToLines(draft.licences));
        setEditExpText(expToEditorText(draft.experience));
        setEditEduText(eduToEditorText(draft.education));
        setEditRefsText(refsToEditorText(draft.referees));
        setEditOpen(true);
    };

    const applyEdits = () => {
        if (!editDraft) return;

        const updated = {
            ...cloneResume(editDraft),
            coreSkills: commaStringToList(editSkillsText),
            certifications: linesToList(editCertsText),
            licences: linesToList(editLicencesText),
            experience: editorTextToExp(editExpText),
            education: editorTextToEdu(editEduText),
            referees: editorTextToRefs(editRefsText),
        };

        setResume(updated);
        setEditOpen(false);
    };

    const buildPrompt = () => {
        const p = participant || {};
        const fullName = [safeText(p.first_name).trim(), safeText(p.last_name).trim()].filter(Boolean).join(" ").trim();

        return `
You are a professional resume writer for Australia.
Write a one page resume in a clean, factual style. No exaggeration. No sensitive personal details.
Optimise for the target industry and role.

Target industry: ${normalizeIndustryValue(industry)}
Target role: ${safeText(targetRole).trim() || "Not specified"}

Participant profile (from system):
- Name: ${fullName || "Participant"}
- Email: ${safeText(p.contact_email || p.email || "").trim()}
- Phone: ${safeText(p.contact_phone || p.phone || "").trim()}
- Location: ${[safeText(p.suburb).trim(), safeText(p.state).trim()].filter(Boolean).join(", ")}
- Current stage: ${safeText(p.current_phase).trim()}
- Notes: ${safeText(p.notes).trim()}

Caseworker provided notes:
- Work history: ${safeText(workHistoryNotes).trim()}
- Training and education: ${safeText(trainingNotes).trim()}
- Skills: ${safeText(skillsNotes).trim()}
- Achievements: ${safeText(achievementsNotes).trim()}
- Barriers addressed and supports: ${safeText(barriersNotes).trim()}

Return ONLY JSON matching the provided schema.
        `.trim();
    };

    const generateWithAI = async () => {
        if (!canGenerate) return;

        setAiBusy(true);
        setPdfUrl("");
        try {
            const schema = buildResumeSchema();

            const out = await base44.functions.invokeLLM({
                prompt: buildPrompt(),
                response_json_schema: schema,
                model: "gpt-4.1-mini",
            });

            const merged = {
                ...(baseResume || {}),
                ...(out || {}),
                contact: {
                    ...(baseResume?.contact || {}),
                    ...(out?.contact || {}),
                },
                coreSkills: safeList(out?.coreSkills),
                experience: safeList(out?.experience),
                education: safeList(out?.education),
                certifications: safeList(out?.certifications),
                licences: safeList(out?.licences),
                referees: safeList(out?.referees),
            };

            setResume(cloneResume(merged));
        } catch (e) {
            alert(`AI resume generation failed: ${e?.message || "Unknown error"}`);
        } finally {
            setAiBusy(false);
        }
    };

    const downloadPdf = () => {
        if (!resume) return;
        const doc = renderResumePdf(resume);
        const nameSafe = safeText(resume.fullName || "resume")
            .replace(/[^\w.\-() ]+/g, "_")
            .replace(/\s+/g, "_");
        doc.save(`${nameSafe}_Resume.pdf`);
    };

    const invalidateDocuments = () => {
        queryClient.invalidateQueries({ queryKey: ["participantDocuments", participantId] });
        queryClient.invalidateQueries({ queryKey: ["documents", participantId] });
        queryClient.invalidateQueries({ queryKey: ["Document", participantId] });
        queryClient.invalidateQueries({ queryKey: ["Document"] });
    };

    const savePdfToParticipant = async () => {
        if (!resume) return;
        if (!participantId) return;

        setSaveBusy(true);
        try {
            const docPdf = renderResumePdf(resume);
            const blob = docPdf.output("blob");

            const nameSafe = safeText(resume.fullName || "resume")
                .replace(/[^\w.\-() ]+/g, "_")
                .replace(/\s+/g, "_");
            const filename = `${nameSafe}_Resume_${todayIso()}.pdf`;

            const file = toFileFromBlob(blob, filename);

            const upload = await base44.integrations.Core.UploadFile({
                file,
                pathPrefix: `participant_documents/${participantId}/resumes`,
            });

            const url = upload?.file_url || upload?.url || "";
            if (!url) throw new Error("Upload succeeded but no URL returned");

            setPdfUrl(url);

            const category = "Resume";

            await base44.entities.Document.create({
                linked_participant_id: participantId,
                category,
                file_name: filename,
                file_type: "application/pdf",
                file_url: url,
                storage_path: upload?.storage_path || "",

                document_category: category,
                document_type: category,
                document_name: filename,
                name: filename,
                content_type: "application/pdf",
                size: upload?.size || 0,
                source: "ResumeBuilder",
                tags: ["resume", normalizeIndustryValue(industry)],
            });

            invalidateDocuments();

            alert("Resume saved to participant Documents.");
        } catch (e) {
            alert(`Save failed: ${e?.message || "Unknown error"}`);
        } finally {
            setSaveBusy(false);
        }
    };

    if (isLoading && !participant) return <LoadingSpinner />;

    if (!participantId) {
        return (
            <div className="p-6 md:p-8">
                <PageHeader title="Resume Builder" subtitle="Missing participant_id" />
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-6 text-slate-300">
                        Open this page from a participant record so we can attach the resume correctly.
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <PageHeader title="Resume Builder" subtitle="Generate, export, edit, and attach a resume to the participant record" />
                    <div className="mt-2">
                        <Link
                            to={createPageUrl(`ParticipantDetail?id=${participantId}`)}
                            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Participant
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="border-slate-700 text-slate-200">
                        Participant: {safeText(participant?.first_name)} {safeText(participant?.last_name)}
                    </Badge>
                    <Badge className="bg-slate-800 text-slate-200 border border-slate-700">
                        <Briefcase className="h-3.5 w-3.5 mr-2" />
                        {normalizeIndustryValue(industry)}
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="bg-slate-900/50 border-slate-800 lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-blue-400" />
                            AI Resume Inputs
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-slate-300">Target Industry</Label>
                            <Select value={industry} onValueChange={setIndustry}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                                    <SelectValue placeholder="Select industry" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800">
                                    <SelectItem value="General">General</SelectItem>
                                    <SelectItem value="Construction">Construction</SelectItem>
                                    <SelectItem value="Warehousing">Warehousing</SelectItem>
                                    <SelectItem value="Hospitality">Hospitality</SelectItem>
                                    <SelectItem value="Security">Security</SelectItem>
                                    <SelectItem value="Retail">Retail</SelectItem>
                                    <SelectItem value="Community Services">Community Services</SelectItem>
                                    <SelectItem value="Administration">Administration</SelectItem>
                                    <SelectItem value="Transport and Logistics">Transport and Logistics</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="text-slate-300">Target Role (optional)</Label>
                            <Input
                                value={targetRole}
                                onChange={(e) => setTargetRole(e.target.value)}
                                placeholder="e.g. Warehouse Storeperson, Security Officer"
                                className="bg-slate-950 border-slate-800 text-white"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Work history notes</Label>
                            <Textarea
                                value={workHistoryNotes}
                                onChange={(e) => setWorkHistoryNotes(e.target.value)}
                                placeholder="Employers, roles, tasks, dates, informal experience"
                                className="bg-slate-950 border-slate-800 text-white min-h-24"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Training and education</Label>
                            <Textarea
                                value={trainingNotes}
                                onChange={(e) => setTrainingNotes(e.target.value)}
                                placeholder="Courses, certificates, licences, completion status"
                                className="bg-slate-950 border-slate-800 text-white min-h-20"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Skills</Label>
                            <Textarea
                                value={skillsNotes}
                                onChange={(e) => setSkillsNotes(e.target.value)}
                                placeholder="Hard skills and soft skills relevant to the role"
                                className="bg-slate-950 border-slate-800 text-white min-h-20"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Achievements</Label>
                            <Textarea
                                value={achievementsNotes}
                                onChange={(e) => setAchievementsNotes(e.target.value)}
                                placeholder="Attendance, milestones, positive feedback, reliability"
                                className="bg-slate-950 border-slate-800 text-white min-h-20"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Barriers addressed and supports</Label>
                            <Textarea
                                value={barriersNotes}
                                onChange={(e) => setBarriersNotes(e.target.value)}
                                placeholder="Support provided, stability improvements, mentoring"
                                className="bg-slate-950 border-slate-800 text-white min-h-20"
                            />
                        </div>

                        <div className="pt-2 flex flex-col gap-2">
                            <Button onClick={() => setDialogOpen(true)} className="w-full" disabled={!canGenerate}>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Generate Resume
                            </Button>

                            <Button
                                onClick={openEditDialog}
                                variant="outline"
                                className="w-full border-slate-700 hover:bg-slate-800"
                                disabled={!resume}
                            >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Resume
                            </Button>

                            <Button
                                onClick={downloadPdf}
                                variant="outline"
                                className="w-full border-slate-700 hover:bg-slate-800"
                                disabled={!resume}
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
                            </Button>

                            <Button
                                onClick={savePdfToParticipant}
                                variant="outline"
                                className="w-full border-slate-700 hover:bg-slate-800"
                                disabled={!resume || saveBusy}
                            >
                                <Save className="h-4 w-4 mr-2" />
                                {saveBusy ? "Saving..." : "Save to Participant Documents"}
                            </Button>

                            {pdfUrl ? (
                                <div className="text-xs text-slate-400 break-all">
                                    Saved PDF:{" "}
                                    <a className="text-blue-400 hover:underline" href={pdfUrl} target="_blank" rel="noreferrer">
                                        View
                                    </a>
                                </div>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800 lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <FileText className="h-5 w-5 text-emerald-400" />
                            Resume Preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!resume ? (
                            <div className="text-slate-400">Generate a resume to preview it here.</div>
                        ) : (
                            <div className="space-y-5">
                                <div>
                                    <div className="text-2xl font-bold text-white">{resume.fullName}</div>
                                    <div className="text-slate-300 mt-1">{resume.headline}</div>
                                    <div className="text-slate-400 text-sm mt-2">
                                        {safeText(resume.contact?.phone).trim() ? `${resume.contact.phone}  |  ` : ""}
                                        {safeText(resume.contact?.email).trim() ? `${resume.contact.email}  |  ` : ""}
                                        {[safeText(resume.contact?.suburb).trim(), safeText(resume.contact?.state).trim()].filter(Boolean).join(", ")}
                                    </div>
                                </div>

                                <div>
                                    <div className="font-semibold text-white">Professional Summary</div>
                                    <div className="text-slate-300 text-sm mt-2 whitespace-pre-wrap">{resume.summary}</div>
                                </div>

                                {safeList(resume.coreSkills).length ? (
                                    <div>
                                        <div className="font-semibold text-white">Core Skills</div>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {resume.coreSkills.map((s, idx) => (
                                                <Badge key={`${s}_${idx}`} variant="outline" className="border-slate-700 text-slate-200">
                                                    {s}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {safeList(resume.experience).length ? (
                                    <div>
                                        <div className="font-semibold text-white">Employment History</div>
                                        <div className="mt-2 space-y-3">
                                            {resume.experience.map((e, idx) => (
                                                <div key={`exp_${idx}`} className="border border-slate-800 rounded-lg p-3 bg-slate-950/30">
                                                    <div className="text-white font-medium">
                                                        {safeText(e.role)} - {safeText(e.employer)}
                                                    </div>
                                                    <div className="text-slate-400 text-xs mt-1">
                                                        {[safeText(e.location), `${safeText(e.start)} to ${safeText(e.end)}`].filter(Boolean).join("  |  ")}
                                                    </div>
                                                    <ul className="list-disc pl-5 mt-2 text-slate-300 text-sm space-y-1">
                                                        {safeList(e.bullets).map((b, bIdx) => (
                                                            <li key={`b_${idx}_${bIdx}`}>{b}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {safeList(resume.education).length ? (
                                    <div>
                                        <div className="font-semibold text-white">Education and Training</div>
                                        <div className="mt-2 space-y-2">
                                            {resume.education.map((ed, idx) => (
                                                <div key={`edu_${idx}`} className="text-slate-300 text-sm">
                                                    <span className="text-white">{safeText(ed.qualification)}</span>{" "}
                                                    <span className="text-slate-400">
                                                        - {safeText(ed.provider)} ({safeText(ed.year)})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {safeList(resume.certifications).length ? (
                                    <div>
                                        <div className="font-semibold text-white">Certificates</div>
                                        <ul className="list-disc pl-5 mt-2 text-slate-300 text-sm space-y-1">
                                            {resume.certifications.map((c2, idx) => (
                                                <li key={`cert_${idx}`}>{c2}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}

                                {safeList(resume.licences).length ? (
                                    <div>
                                        <div className="font-semibold text-white">Licences</div>
                                        <ul className="list-disc pl-5 mt-2 text-slate-300 text-sm space-y-1">
                                            {resume.licences.map((l2, idx) => (
                                                <li key={`lic_${idx}`}>{l2}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}

                                {safeList(resume.referees).length ? (
                                    <div>
                                        <div className="font-semibold text-white">Referees</div>
                                        <div className="mt-2 space-y-2">
                                            {resume.referees.map((r, idx) => (
                                                <div key={`ref_${idx}`} className="text-slate-300 text-sm">
                                                    <span className="text-white">{safeText(r.name)}</span>{" "}
                                                    <span className="text-slate-400">
                                                        - {safeText(r.relationship)}  |  {safeText(r.phone)}  |  {safeText(r.email)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-blue-400" />
                            Generate Resume
                        </DialogTitle>
                    </DialogHeader>

                    <div className="text-slate-300 text-sm">
                        This will generate a resume tailored to the selected industry and role using the notes provided.
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4">
                        <Button
                            variant="outline"
                            className="border-slate-700 hover:bg-slate-800"
                            onClick={() => setDialogOpen(false)}
                            disabled={aiBusy}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={async () => {
                                await generateWithAI();
                                setDialogOpen(false);
                            }}
                            disabled={aiBusy}
                        >
                            {aiBusy ? "Generating..." : "Generate"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-3xl p-0">
                    <div className="flex flex-col max-h-[85vh]">
                        <div className="p-6 border-b border-slate-800">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Pencil className="h-5 w-5 text-emerald-400" />
                                    Edit Resume
                                </DialogTitle>
                            </DialogHeader>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {!editDraft ? (
                                <div className="text-slate-300">No resume to edit.</div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Full name</Label>
                                            <Input
                                                value={editDraft.fullName}
                                                onChange={(e) => setEditDraft({ ...editDraft, fullName: e.target.value })}
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Headline</Label>
                                            <Input
                                                value={editDraft.headline}
                                                onChange={(e) => setEditDraft({ ...editDraft, headline: e.target.value })}
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Professional summary</Label>
                                        <Textarea
                                            value={editDraft.summary}
                                            onChange={(e) => setEditDraft({ ...editDraft, summary: e.target.value })}
                                            className="bg-slate-950 border-slate-800 text-white min-h-20"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Phone</Label>
                                            <Input
                                                value={editDraft.contact.phone}
                                                onChange={(e) =>
                                                    setEditDraft({
                                                        ...editDraft,
                                                        contact: { ...editDraft.contact, phone: e.target.value },
                                                    })
                                                }
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Email</Label>
                                            <Input
                                                value={editDraft.contact.email}
                                                onChange={(e) =>
                                                    setEditDraft({
                                                        ...editDraft,
                                                        contact: { ...editDraft.contact, email: e.target.value },
                                                    })
                                                }
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Suburb</Label>
                                            <Input
                                                value={editDraft.contact.suburb}
                                                onChange={(e) =>
                                                    setEditDraft({
                                                        ...editDraft,
                                                        contact: { ...editDraft.contact, suburb: e.target.value },
                                                    })
                                                }
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">State</Label>
                                            <Input
                                                value={editDraft.contact.state}
                                                onChange={(e) =>
                                                    setEditDraft({
                                                        ...editDraft,
                                                        contact: { ...editDraft.contact, state: e.target.value },
                                                    })
                                                }
                                                className="bg-slate-950 border-slate-800 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Core skills (comma separated)</Label>
                                        <Textarea
                                            value={editSkillsText}
                                            onChange={(e) => setEditSkillsText(e.target.value)}
                                            className="bg-slate-950 border-slate-800 text-white min-h-16"
                                        />
                                    </div>

                                    {/* The rest of the editor fields are the ones at the top of this Part 2 */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-slate-300">Certificates (one per line)</Label>
                                            <Textarea
                                                value={editCertsText}
                                                onChange={(e) => setEditCertsText(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-white min-h-24"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-slate-300">Licences (one per line)</Label>
                                            <Textarea
                                                value={editLicencesText}
                                                onChange={(e) => setEditLicencesText(e.target.value)}
                                                className="bg-slate-950 border-slate-800 text-white min-h-24"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Employment history editor (blocks separated by ---)</Label>
                                        <div className="text-xs text-slate-400 mt-1">
                                            Format per block:
                                            <br />
                                            Role: ...
                                            <br />
                                            Employer: ...
                                            <br />
                                            Location: ...
                                            <br />
                                            Start: ...
                                            <br />
                                            End: ...
                                            <br />
                                            Bullets:
                                            <br />
                                            one bullet per line
                                        </div>
                                        <Textarea
                                            value={editExpText}
                                            onChange={(e) => setEditExpText(e.target.value)}
                                            className="bg-slate-950 border-slate-800 text-white min-h-56 mt-2"
                                        />
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Education editor (blocks separated by ---)</Label>
                                        <div className="text-xs text-slate-400 mt-1">
                                            Format per block:
                                            <br />
                                            Qualification: ...
                                            <br />
                                            Provider: ...
                                            <br />
                                            Year: ...
                                        </div>
                                        <Textarea
                                            value={editEduText}
                                            onChange={(e) => setEditEduText(e.target.value)}
                                            className="bg-slate-950 border-slate-800 text-white min-h-40 mt-2"
                                        />
                                    </div>

                                    <div>
                                        <Label className="text-slate-300">Referees editor (blocks separated by ---)</Label>
                                        <div className="text-xs text-slate-400 mt-1">
                                            Format per block:
                                            <br />
                                            Name: ...
                                            <br />
                                            Relationship: ...
                                            <br />
                                            Phone: ...
                                            <br />
                                            Email: ...
                                        </div>
                                        <Textarea
                                            value={editRefsText}
                                            onChange={(e) => setEditRefsText(e.target.value)}
                                            className="bg-slate-950 border-slate-800 text-white min-h-40 mt-2"
                                        />
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-2">
                                        <Button
                                            variant="outline"
                                            className="border-slate-700 hover:bg-slate-800"
                                            onClick={() => setEditOpen(false)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button onClick={applyEdits}>Save edits</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
