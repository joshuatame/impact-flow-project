import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Sparkles,
    Plus,
    Upload,
    X,
    Star,
    User,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Download,
    Share2,
    CheckCircle2,
    FileText,
    FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EmptyState from "@/components/ui/EmptyState.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { db } from "@/firebase";
import {
    addDoc,
    collection,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";

// ✅ NEW: text-only Word export helper
import { exportGoodNewsTextToWord } from "@/lib/goodNewsExportWord";

const categoryColors = {
    "Employment Success": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "Training Achievement": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    "Personal Growth": "bg-violet-500/10 text-violet-400 border-violet-500/20",
    "Community Impact": "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Milestone: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    Other: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeStory(raw) {
    const title = raw?.title || raw?.story_title || "Good News Story";
    const story_content = raw?.story_content || raw?.story || raw?.content || "";
    const story_date = raw?.story_date || raw?.created_date || raw?.date || null;
    const category = raw?.category || "Other";
    const is_featured = Boolean(raw?.is_featured);

    const photo_urls =
        raw?.photo_urls ||
        (Array.isArray(raw?.photos) ? raw.photos.map((p) => p?.url).filter(Boolean) : []) ||
        [];

    const linkedIds = Array.isArray(raw?.linked_participant_ids)
        ? raw.linked_participant_ids.filter(Boolean)
        : raw?.participant_id
            ? [raw.participant_id]
            : [];

    return {
        ...raw,
        title,
        story_content,
        story_date,
        category,
        is_featured,
        photo_urls,
        linked_participant_ids: linkedIds,
    };
}

function escapeForFilename(name) {
    return safeText(name).replace(/[^\w\- ]+/g, "").trim().slice(0, 70) || "good-news";
}

// ---- PDF Export (existing approach: Print to PDF) ----
const exportStoriesAsPDF = (stories, participants, programName) => {
    const getParticipantName = (participantId) => {
        const p = participants.find((x) => x.id === participantId);
        return p ? `${p.first_name} ${p.last_name}` : "";
    };

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("Popup blocked. Please allow popups to export PDF.");
        return;
    }

    const safe = (s) => safeText(s).replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let html = `
<!DOCTYPE html>
<html>
<head>
  <title>Good News Stories - ${safe(programName || "Report")}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .story { page-break-inside: avoid; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1a1a1a;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #f59e0b;
    }
    .header h1 { font-size: 28px; margin: 0 0 8px 0; color: #1a1a1a; }
    .header p { color: #666; margin: 0; }
    .story {
      background: #fefce8;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      border: 1px solid #fef08a;
    }
    .story-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .story h2 { font-size: 20px; margin: 0 0 8px 0; color: #1a1a1a; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      background: #fef3c7;
      color: #92400e;
      margin-right: 8px;
    }
    .featured { background: #f59e0b; color: white; }
    .meta {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #666;
      flex-wrap: wrap;
    }
    .story-content { font-size: 15px; white-space: pre-wrap; margin-bottom: 16px; }
    .photos {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .photos img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 12px;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f59e0b;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .print-btn:hover { background: #d97706; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">📄 Save as PDF</button>
  <div class="header">
    <h1>✨ Good News Stories</h1>
    <p>${safe(programName || "Program Report")} • Generated ${new Date().toLocaleDateString()}</p>
  </div>
`;

    stories.forEach((raw) => {
        const story = normalizeStory(raw);
        const names = (story.linked_participant_ids || []).map(getParticipantName).filter(Boolean);
        const participantLabel = names.length ? names.join(", ") : "";

        html += `
  <div class="story">
    <div class="story-header">
      <div>
        <h2>${safe(story.title)}</h2>
        <div>
          <span class="badge">${safe(story.category)}</span>
          ${story.is_featured ? '<span class="badge featured">⭐ Featured</span>' : ""}
        </div>
      </div>
    </div>
    <div class="meta">
      ${story.story_date ? `<span>📅 ${new Date(story.story_date).toLocaleDateString()}</span>` : ""}
      ${participantLabel ? `<span>👤 ${safe(participantLabel)}</span>` : ""}
      ${story.submitted_by_name ? `<span>✍️ ${safe(story.submitted_by_name)}</span>` : ""}
    </div>
    <div class="story-content">${safe(story.story_content)}</div>
    ${story.photo_urls?.length > 0
                ? `<div class="photos">
        ${story.photo_urls.map((url) => `<img src="${url}" alt="Story photo" />`).join("")}
      </div>`
                : ""
            }
  </div>
`;
    });

    html += `
  <div class="footer">
    <p>Good News Stories Report • ${stories.length} ${stories.length === 1 ? "story" : "stories"}</p>
  </div>
</body>
</html>
`;

    printWindow.document.write(html);
    printWindow.document.close();
};

// ✅ NEW: Word (Text) export (all stories)
function exportStoriesAsWordText({ stories, participants, programName }) {
    const getParticipantName = (participantId) => {
        const p = participants.find((x) => x.id === participantId);
        return p ? `${p.first_name} ${p.last_name}` : "";
    };

    const lines = [];
    lines.push(`GOOD NEWS STORIES`);
    lines.push(`================`);
    if (programName) lines.push(`Program: ${safeText(programName)}`);
    lines.push(`Generated: ${new Date().toLocaleDateString()}`);
    lines.push("");
    lines.push(`Total stories: ${stories.length}`);
    lines.push("");
    lines.push("------------------------------------------------------------");
    lines.push("");

    stories.forEach((raw, idx) => {
        const s = normalizeStory(raw);
        const dateStr = s.story_date ? new Date(s.story_date).toLocaleDateString() : "";
        const names = (s.linked_participant_ids || []).map(getParticipantName).filter(Boolean);
        const participantLabel = names.length ? names.join(", ") : "";

        lines.push(`Story ${idx + 1}`);
        lines.push(`--------`);
        lines.push(`Title: ${safeText(s.title)}`);
        lines.push(`Category: ${safeText(s.category)}`);
        if (dateStr) lines.push(`Date: ${dateStr}`);
        if (participantLabel) lines.push(`Participants: ${participantLabel}`);
        if (s.submitted_by_name) lines.push(`Submitted by: ${safeText(s.submitted_by_name)}`);
        if (s.is_featured) lines.push(`Featured: Yes`);
        lines.push("");
        lines.push(safeText(s.story_content || ""));
        lines.push("");
        lines.push("------------------------------------------------------------");
        lines.push("");
    });

    exportGoodNewsTextToWord({
        filename: `${escapeForFilename(programName || "good-news-stories")}.doc`,
        text: lines.join("\n"),
    });
}

// ✅ NEW: Word (Text) export (single story)
function exportSingleStoryAsWordText({ story, participants, programName }) {
    if (!story) return;

    const s = normalizeStory(story);
    const dateStr = s.story_date ? new Date(s.story_date).toLocaleDateString() : "";

    const getParticipantName = (participantId) => {
        const p = participants.find((x) => x.id === participantId);
        return p ? `${p.first_name} ${p.last_name}` : "";
    };

    const names = (s.linked_participant_ids || []).map(getParticipantName).filter(Boolean);
    const participantLabel = names.length ? names.join(", ") : "";

    const text = [
        "GOOD NEWS STORY",
        "===============",
        programName ? `Program: ${safeText(programName)}` : null,
        "",
        `Title: ${safeText(s.title)}`,
        `Category: ${safeText(s.category)}`,
        dateStr ? `Date: ${dateStr}` : null,
        participantLabel ? `Participants: ${participantLabel}` : null,
        s.submitted_by_name ? `Submitted by: ${safeText(s.submitted_by_name)}` : null,
        s.is_featured ? `Featured: Yes` : null,
        "",
        "Story:",
        "------",
        safeText(s.story_content || ""),
        "",
    ]
        .filter(Boolean)
        .join("\n");

    exportGoodNewsTextToWord({
        filename: `${escapeForFilename(s.title)}.doc`,
        text,
    });
}

export default function GoodNewsStories({ programId, programName }) {
    const queryClient = useQueryClient();

    const [showForm, setShowForm] = useState(false);
    const [selectedStory, setSelectedStory] = useState(null);
    const [uploading, setUploading] = useState(false);

    const [shareOpen, setShareOpen] = useState(false);
    const [shareChannelId, setShareChannelId] = useState("");

    // AI context dialog
    const [aiContextOpen, setAiContextOpen] = useState(false);
    const [aiContext, setAiContext] = useState("");

    const [formData, setFormData] = useState({
        title: "",
        story_content: "",
        photo_urls: [],
        story_date: new Date().toISOString().split("T")[0],
        linked_participant_ids: [],
        category: "Other",
        is_featured: false,
    });

    const resetForm = () => {
        setFormData({
            title: "",
            story_content: "",
            photo_urls: [],
            story_date: new Date().toISOString().split("T")[0],
            category: "Other",
            linked_participant_ids: [],
            is_featured: false,
        });
        setAiContext("");
        setAiContextOpen(false);
    };

    const { data: storiesRaw = [], isLoading: loadingStories, error: storiesError } = useQuery({
        queryKey: ["goodNewsStories", programId],
        queryFn: async () => {
            const res = await base44.entities.GoodNewsStory.filter({ program_id: programId }, undefined, 1000);
            return Array.isArray(res) ? res : [];
        },
        enabled: !!programId,
    });

    const stories = useMemo(() => {
        const s = Array.isArray(storiesRaw) ? storiesRaw.map(normalizeStory) : [];
        return s.sort(
            (a, b) => new Date(b.story_date || b.created_date || 0) - new Date(a.story_date || a.created_date || 0)
        );
    }, [storiesRaw]);

    const { data: participants = [] } = useQuery({
        queryKey: ["participants"],
        queryFn: async () => {
            const res = await base44.entities.Participant.list("-created_date", 1000);
            return Array.isArray(res) ? res : [];
        },
    });

    const { data: enrollments = [] } = useQuery({
        queryKey: ["enrollments", programId],
        queryFn: async () => {
            const res = await base44.entities.ParticipantProgramEnrollment.filter({ program_id: programId }, undefined, 2000);
            return Array.isArray(res) ? res : [];
        },
        enabled: !!programId,
    });

    const enrolledParticipantIds = useMemo(
        () => (Array.isArray(enrollments) ? enrollments.map((e) => e.participant_id).filter(Boolean) : []),
        [enrollments]
    );

    const enrolledParticipants = useMemo(
        () => (Array.isArray(participants) ? participants.filter((p) => enrolledParticipantIds.includes(p.id)) : []),
        [participants, enrolledParticipantIds]
    );

    const getParticipantName = (participantId) => {
        const p = participants.find((x) => x.id === participantId);
        return p ? `${p.first_name} ${p.last_name}` : null;
    };

    const getParticipantLabel = (story) => {
        const ids = story.linked_participant_ids || [];
        if (!ids.length) return null;

        const names = ids.map(getParticipantName).filter(Boolean);
        if (!names.length) return `${ids.length} participant${ids.length === 1 ? "" : "s"}`;
        if (names.length <= 2) return names.join(", ");
        return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    };

    const { data: me } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    // ---------- AI ----------
    const aiMutation = useMutation({
        mutationFn: async ({ mode, context }) => {
            const title = safeText(formData.title).trim();
            const story = safeText(formData.story_content).trim();
            const extraContext = safeText(context).trim();

            const participantNames = (formData.linked_participant_ids || [])
                .map((id) => getParticipantName(id))
                .filter(Boolean);

            const contextLines = [
                `Program: ${safeText(programName) || "Unknown Program"}`,
                participantNames.length ? `Participants: ${participantNames.join(", ")}` : "",
                `Date: ${new Date().toLocaleDateString()}`,
            ].filter(Boolean);

            const styleRules = [
                "Strictly celebratory tone.",
                "Use professional language.",
                "Use headings and bullet highlights.",
                "Do not include any criticism or risk language.",
            ].join(" ");

            const schema = {
                type: "object",
                additionalProperties: false,
                properties: {
                    title: { type: "string" },
                    story_content: { type: "string" },
                },
                required: ["title", "story_content"],
            };

            const prompt =
                mode === "rewrite"
                    ? [
                        "Rewrite the following Good News story to be more polished and professional.",
                        styleRules,
                        "",
                        ...contextLines,
                        "",
                        "Return JSON with title and story_content.",
                        "",
                        `Current Title: ${title || "Good News Story"}`,
                        "",
                        "Current Story:",
                        story || "(empty)",
                    ].join("\n")
                    : [
                        "Generate a Good News story.",
                        styleRules,
                        "",
                        ...contextLines,
                        "",
                        extraContext ? `Extra context from case worker:\n${extraContext}\n` : "",
                        "Include clear headings and bullet highlights.",
                        "Return JSON with title and story_content.",
                    ].join("\n");

            const res = await base44.integrations.Core.InvokeLLM({
                prompt,
                model: "gpt-4.1-mini",
                response_json_schema: schema,
            });

            const out = res?.json ?? res?.data ?? res;
            const outTitle = safeText(out?.title).trim();
            const outStory = safeText(out?.story_content).trim();

            return {
                title: outTitle || title || "Good News Story",
                story_content: outStory || story || "",
            };
        },
        onSuccess: (data) => {
            setFormData((prev) => ({ ...prev, ...data }));
        },
        onError: (err) => {
            console.error("AI failed:", err);
            alert(err?.message || "AI failed. Check console for details.");
        },
    });

    const handleAiRewrite = () => aiMutation.mutate({ mode: "rewrite" });
    const handleAiGenerateClick = () => setAiContextOpen(true);
    const handleAiGenerateConfirm = () => {
        setAiContextOpen(false);
        aiMutation.mutate({ mode: "generate", context: aiContext });
        setAiContext("");
    };

    // ---------- Channels (Firestore forumChannels) ----------
    const { data: channels = [], isLoading: loadingChannels, error: channelsError } = useQuery({
        queryKey: ["forumChannels"],
        queryFn: async () => {
            try {
                const qRef = query(
                    collection(db, "forumChannels"),
                    where("isActive", "==", true),
                    orderBy("createdAt", "asc")
                );
                const snap = await getDocs(qRef);
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            } catch {
                const qRef = query(collection(db, "forumChannels"), where("isActive", "==", true));
                const snap = await getDocs(qRef);
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            }
        },
    });

    const createStoryMutation = useMutation({
        mutationFn: async (data) => {
            const user = await base44.auth.me();

            const linkedIds = Array.isArray(data.linked_participant_ids) ? data.linked_participant_ids.filter(Boolean) : [];
            const primaryId = linkedIds[0] || null;

            return base44.entities.GoodNewsStory.create({
                ...data,
                participant_id: primaryId,
                linked_participant_ids: linkedIds,
                program_id: programId,
                submitted_by_id: user?.id,
                submitted_by_name: user?.full_name,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goodNewsStories", programId] });
            setShowForm(false);
            resetForm();
        },
        onError: (err) => {
            console.error("Create story failed:", err);
            alert(err?.message || "Failed to create story. Check console for details.");
        },
    });

    // ✅ Share to Forum -> Firestore forumMessages (so it appears in Forum feed)
    const shareToForumMutation = useMutation({
        mutationFn: async ({ story, channelId }) => {
            if (!story?.id) throw new Error("Missing story");
            if (!channelId) throw new Error("Select a forum channel");

            const channel = (channels || []).find((c) => c.id === channelId);
            const photoUrls = Array.isArray(story?.photo_urls) ? story.photo_urls.filter(Boolean) : [];
            const attachments = photoUrls.map((url) => ({ type: "image", url, name: "image" }));

            const payload = {
                channelId,
                channel_id: channelId,
                channel_name: safeText(channel?.name || channel?.channel_name || channelId),

                message_type: "good_news_story",
                title: safeText(story.title || "Good News Story"),
                body: safeText(story.story_content || story.story || ""),
                content: "",

                linked_entity_type: "GoodNewsStory",
                linked_entity_id: story.id,

                linked_program_id: programId || null,
                linked_participant_ids: Array.isArray(story.linked_participant_ids) ? story.linked_participant_ids : [],

                photo_urls: photoUrls,
                attachments,

                authorId: me?.id || null,
                authorName: me?.full_name || me?.display_name || "Unknown",
                authorRole: me?.app_role || null,

                createdAt: serverTimestamp(),
                likedBy: [],
            };

            const ref = await addDoc(collection(db, "forumMessages"), payload);
            return { id: ref.id, ...payload };
        },
        onSuccess: () => {
            setShareOpen(false);
            setShareChannelId("");
            alert("Shared to forum.");
        },
        onError: (err) => {
            console.error("Share failed:", err);
            alert(err?.message || "Failed to share to forum. Check console for details.");
        },
    });

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setUploading(true);
        const uploadedUrls = [];

        try {
            for (const file of files) {
                const result = await base44.integrations.Core.UploadFile({ file, pathPrefix: "goodnews" });
                const url = result?.file_url || result?.url;
                if (url) uploadedUrls.push(url);
            }

            setFormData((prev) => ({
                ...prev,
                photo_urls: [...prev.photo_urls, ...uploadedUrls],
            }));
        } finally {
            setUploading(false);
        }
    };

    const removePhoto = (index) => {
        setFormData((prev) => ({
            ...prev,
            photo_urls: prev.photo_urls.filter((_, i) => i !== index),
        }));
    };

    const toggleParticipantLink = (id) => {
        setFormData((prev) => {
            const set = new Set(prev.linked_participant_ids || []);
            if (set.has(id)) set.delete(id);
            else set.add(id);
            return { ...prev, linked_participant_ids: Array.from(set) };
        });
    };

    if (loadingStories) return <LoadingSpinner />;

    return (
        <div>
            {/* AI Context Dialog */}
            <Dialog open={aiContextOpen} onOpenChange={setAiContextOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white">Generate story with AI</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 mt-2">
                        <p className="text-sm text-slate-400">
                            Add a little context (optional). Example: milestone, participants involved, employer/training provider, outcome.
                        </p>

                        <div>
                            <Label className="text-slate-300">Context (optional)</Label>
                            <Textarea
                                value={aiContext}
                                onChange={(e) => setAiContext(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={5}
                                placeholder="e.g., Three participants completed their short course and were congratulated by the trainer..."
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="outline" className="border-slate-700" onClick={() => setAiContextOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-amber-600 hover:bg-amber-700"
                                onClick={handleAiGenerateConfirm}
                                disabled={aiMutation.isPending}
                            >
                                {aiMutation.isPending ? "Generating..." : "Generate"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Good News Stories</h3>
                        {storiesError && (
                            <p className="text-xs text-red-300 mt-1">Failed to load stories. Check console for details.</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {stories.length > 0 && (
                        <>
                            <Button
                                variant="outline"
                                className="border-slate-700"
                                onClick={() => exportStoriesAsPDF(stories, participants, programName)}
                                type="button"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Export PDF
                            </Button>

                            <Button
                                variant="outline"
                                className="border-slate-700"
                                onClick={() => exportStoriesAsWordText({ stories, participants, programName })}
                                type="button"
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                Export Word (Text)
                            </Button>
                        </>
                    )}

                    <Button onClick={() => setShowForm(true)} className="bg-amber-600 hover:bg-amber-700" type="button">
                        <Plus className="h-4 w-4 mr-2" />
                        Share Story
                    </Button>
                </div>
            </div>

            {stories.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {stories.map((story) => (
                        <StoryCard
                            key={story.id}
                            story={story}
                            participantLabel={getParticipantLabel(story)}
                            onClick={() => setSelectedStory(story)}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={Sparkles}
                    title="No stories yet"
                    description="Share the first good news story from this program"
                    actionLabel="Share Story"
                    onAction={() => setShowForm(true)}
                />
            )}

            {/* Create Story Dialog */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-amber-400" />
                            Share a Good News Story
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-4">
                        <div>
                            <Label className="text-slate-300">Title *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="e.g., John lands dream job at local company"
                            />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="secondary" onClick={handleAiRewrite} disabled={aiMutation.isPending} className="gap-2">
                                <Sparkles className="h-4 w-4" />
                                {aiMutation.isPending ? "Working..." : "Rewrite with AI"}
                            </Button>

                            <Button type="button" onClick={handleAiGenerateClick} disabled={aiMutation.isPending} className="gap-2">
                                <Sparkles className="h-4 w-4" />
                                {aiMutation.isPending ? "Working..." : "Generate with AI"}
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Category</Label>
                                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {Object.keys(categoryColors).map((cat) => (
                                            <SelectItem key={cat} value={cat} className="text-white">
                                                {cat}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Date</Label>
                                <Input
                                    type="date"
                                    value={formData.story_date}
                                    onChange={(e) => setFormData({ ...formData, story_date: e.target.value })}
                                    className="bg-slate-800 border-slate-700 text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-slate-300">Link participants (optional)</Label>
                            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3 max-h-56 overflow-y-auto">
                                {enrolledParticipants.length > 0 ? (
                                    <div className="space-y-2">
                                        {enrolledParticipants.map((p) => {
                                            const checked = (formData.linked_participant_ids || []).includes(p.id);
                                            return (
                                                <label key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900/40 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleParticipantLink(p.id)}
                                                        className="rounded border-slate-700 bg-slate-800"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-sm text-slate-200 truncate">
                                                            {p.first_name} {p.last_name}
                                                        </p>
                                                        <p className="text-xs text-slate-500 truncate">{p.current_phase}</p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500">No enrolled participants found for this program.</p>
                                )}
                            </div>

                            {(formData.linked_participant_ids?.length || 0) > 0 && (
                                <p className="text-xs text-slate-500 mt-2">
                                    Linked to {formData.linked_participant_ids.length} participant
                                    {formData.linked_participant_ids.length === 1 ? "" : "s"}.
                                </p>
                            )}
                        </div>

                        <div>
                            <Label className="text-slate-300">Story *</Label>
                            <Textarea
                                value={formData.story_content}
                                onChange={(e) => setFormData({ ...formData, story_content: e.target.value })}
                                className="bg-slate-800 border-slate-700 text-white min-h-[120px]"
                                placeholder="Share the inspiring story..."
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Photos</Label>
                            <div className="mt-2">
                                {formData.photo_urls.length > 0 && (
                                    <div className="grid grid-cols-3 gap-3 mb-3">
                                        {formData.photo_urls.map((url, index) => (
                                            <div key={`${url}-${index}`} className="relative group">
                                                <img src={url} alt={`Upload ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                                                <button
                                                    type="button"
                                                    onClick={() => removePhoto(index)}
                                                    className="absolute top-1 right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Remove photo"
                                                >
                                                    <X className="h-3 w-3 text-white" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-slate-600 transition-colors">
                                    <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
                                    {uploading ? (
                                        <span className="text-slate-400">Uploading...</span>
                                    ) : (
                                        <>
                                            <Upload className="h-5 w-5 text-slate-500" />
                                            <span className="text-slate-400">Click to upload photos</span>
                                        </>
                                    )}
                                </label>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="featured"
                                checked={formData.is_featured}
                                onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                                className="rounded border-slate-700 bg-slate-800"
                            />
                            <Label htmlFor="featured" className="text-slate-300 cursor-pointer">
                                <Star className="h-4 w-4 inline mr-1 text-amber-400" />
                                Mark as featured story
                            </Label>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button variant="outline" onClick={() => setShowForm(false)} className="border-slate-700" type="button">
                                Cancel
                            </Button>

                            <Button
                                onClick={() => createStoryMutation.mutate(formData)}
                                disabled={!formData.title.trim() || !formData.story_content.trim() || createStoryMutation.isPending}
                                className="bg-amber-600 hover:bg-amber-700"
                                type="button"
                            >
                                {createStoryMutation.isPending ? "Sharing..." : "Share Story"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* View Story Dialog */}
            {selectedStory && (
                <StoryViewer
                    story={selectedStory}
                    participantLabel={getParticipantLabel(selectedStory)}
                    participants={participants}
                    programName={programName}
                    channels={channels}
                    loadingChannels={loadingChannels}
                    channelsError={channelsError}
                    shareOpen={shareOpen}
                    setShareOpen={setShareOpen}
                    shareChannelId={shareChannelId}
                    setShareChannelId={setShareChannelId}
                    onShare={() => {
                        setShareOpen(true);
                        setShareChannelId(channels?.[0]?.id || "");
                    }}
                    shareMutation={shareToForumMutation}
                    onClose={() => setSelectedStory(null)}
                />
            )}
        </div>
    );
}

function StoryCard({ story, participantLabel, onClick }) {
    const hasPhotos = story.photo_urls?.length > 0;

    return (
        <div
            onClick={onClick}
            className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden hover:border-amber-500/30 transition-all cursor-pointer group"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onClick();
            }}
        >
            {hasPhotos && (
                <div className="relative h-48 overflow-hidden">
                    <img
                        src={story.photo_urls[0]}
                        alt={story.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {story.photo_urls.length > 1 && (
                        <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded-lg text-xs text-white">
                            +{story.photo_urls.length - 1} more
                        </div>
                    )}
                    {story.is_featured && (
                        <div className="absolute top-2 left-2">
                            <Badge className="bg-amber-500 text-white">
                                <Star className="h-3 w-3 mr-1 fill-current" />
                                Featured
                            </Badge>
                        </div>
                    )}
                </div>
            )}

            <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-white group-hover:text-amber-400 transition-colors line-clamp-2">
                        {story.title}
                    </h4>
                    {!hasPhotos && story.is_featured && (
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                    )}
                </div>

                <p className="text-sm text-slate-400 mt-2 line-clamp-3">{story.story_content}</p>

                <div className="flex items-center justify-between mt-4">
                    <Badge variant="outline" className={categoryColors[story.category] || categoryColors.Other}>
                        {story.category}
                    </Badge>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                        {participantLabel && (
                            <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {participantLabel}
                            </span>
                        )}
                        {story.story_date && <span>{format(new Date(story.story_date), "MMM d, yyyy")}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StoryViewer({
    story,
    participantLabel,
    participants,
    programName,
    channels,
    loadingChannels,
    channelsError,
    shareOpen,
    setShareOpen,
    shareChannelId,
    setShareChannelId,
    onShare,
    shareMutation,
    onClose,
}) {
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const hasPhotos = story.photo_urls?.length > 0;

    const nextPhoto = () => setCurrentPhotoIndex((prev) => (prev + 1) % story.photo_urls.length);
    const prevPhoto = () => setCurrentPhotoIndex((prev) => (prev - 1 + story.photo_urls.length) % story.photo_urls.length);

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl max-h-[90vh] overflow-y-auto p-0">
                {hasPhotos && (
                    <div className="relative bg-black">
                        <img
                            src={story.photo_urls[currentPhotoIndex]}
                            alt={story.title}
                            className="w-full max-h-[400px] object-contain"
                        />

                        {story.photo_urls.length > 1 && (
                            <>
                                <button
                                    onClick={prevPhoto}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                                    title="Previous photo"
                                    type="button"
                                >
                                    <ChevronLeft className="h-6 w-6 text-white" />
                                </button>

                                <button
                                    onClick={nextPhoto}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                                    title="Next photo"
                                    type="button"
                                >
                                    <ChevronRight className="h-6 w-6 text-white" />
                                </button>
                            </>
                        )}
                    </div>
                )}

                <div className="p-6">
                    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                        <div className="flex items-start gap-3 flex-wrap">
                            {story.is_featured && (
                                <Badge className="bg-amber-500 text-white flex-shrink-0">
                                    <Star className="h-3 w-3 mr-1 fill-current" />
                                    Featured
                                </Badge>
                            )}
                            <Badge variant="outline" className={categoryColors[story.category] || categoryColors.Other}>
                                {story.category}
                            </Badge>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <Button
                                variant="outline"
                                className="border-slate-700"
                                onClick={() =>
                                    exportSingleStoryAsWordText({
                                        story,
                                        participants,
                                        programName,
                                    })
                                }
                                type="button"
                            >
                                <FileText className="h-4 w-4 mr-2" />
                                Export Word (Text)
                            </Button>

                            <Button
                                variant="outline"
                                className="border-slate-700"
                                onClick={() => exportStoriesAsPDF([story], participants, programName)}
                                type="button"
                            >
                                <FileDown className="h-4 w-4 mr-2" />
                                Export PDF
                            </Button>

                            <Button
                                variant="outline"
                                className="border-slate-700"
                                onClick={onShare}
                                disabled={!channels?.length}
                                title={channels?.length ? "Share to forum" : "No active forum channels available"}
                                type="button"
                            >
                                <Share2 className="h-4 w-4 mr-2" />
                                Share
                            </Button>
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-4">{story.title}</h2>

                    <div className="prose prose-invert max-w-none">
                        <p className="text-slate-300 whitespace-pre-wrap">{story.story_content}</p>
                    </div>

                    <div className="flex items-center flex-wrap gap-6 mt-6 pt-4 border-t border-slate-800 text-sm text-slate-400">
                        {participantLabel && (
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span>{participantLabel}</span>
                            </div>
                        )}

                        {story.story_date && (
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>{format(new Date(story.story_date), "MMMM d, yyyy")}</span>
                            </div>
                        )}

                        {story.submitted_by_name && <span>Submitted by {story.submitted_by_name}</span>}
                    </div>
                </div>

                {/* Share dialog */}
                <Dialog
                    open={shareOpen}
                    onOpenChange={(v) => {
                        setShareOpen(v);
                        if (!v) setShareChannelId("");
                    }}
                >
                    <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-white">Share to Forum</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 mt-4">
                            {loadingChannels ? (
                                <LoadingSpinner />
                            ) : channelsError ? (
                                <div className="rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
                                    Error loading channels: {safeText(channelsError?.message)}
                                </div>
                            ) : (channels || []).length === 0 ? (
                                <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-300">
                                    No active channels exist in Firestore forumChannels.
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <Label className="text-slate-300">Channel (Active only)</Label>
                                        <Select value={shareChannelId} onValueChange={setShareChannelId}>
                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                                <SelectValue placeholder="Select channel" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-slate-700">
                                                {(channels || []).map((c) => (
                                                    <SelectItem key={c.id} value={c.id} className="text-white">
                                                        {c.name || c.channel_name || c.id}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <Button
                                        className="w-full bg-blue-600 hover:bg-blue-700"
                                        disabled={!shareChannelId || shareMutation.isPending}
                                        onClick={() =>
                                            shareMutation.mutate({
                                                story,
                                                channelId: shareChannelId,
                                            })
                                        }
                                        type="button"
                                    >
                                        {shareMutation.isPending ? (
                                            "Sharing..."
                                        ) : (
                                            <>
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                                Share
                                            </>
                                        )}
                                    </Button>

                                    <p className="text-xs text-slate-500">
                                        Posts write to Firestore forumMessages and will appear in the Forum feed.
                                    </p>
                                </>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
