import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Plus,
    Sparkles,
    Star,
    Share2,
    FileDown,
    FileText,
    Image as ImageIcon,
    X,
    CheckCircle2,
    Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Firestore (source of truth for forum channels/messages)
import { collection, getDocs, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

// ✅ NEW: text-only word export
import { exportGoodNewsTextToWord } from "@/lib/goodNewsExportWord";

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeStory(raw) {
    const title = raw?.title || raw?.story_title || "Good News Story";
    const story_content = raw?.story_content || raw?.story || raw?.content || "";
    const story_date = raw?.story_date || raw?.created_date || raw?.date || null;
    const category = raw?.category || "Good News";
    const is_featured = Boolean(raw?.is_featured);

    const photo_urls =
        raw?.photo_urls ||
        (Array.isArray(raw?.photos) ? raw.photos.map((p) => p?.url).filter(Boolean) : []) ||
        [];

    return { ...raw, title, story_content, story_date, category, is_featured, photo_urls };
}

function exportSingleStoryAsPDF(story, participantName) {
    if (!story) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        alert("Popup blocked. Please allow popups to export PDF.");
        return;
    }

    const safe = (v) => (v == null ? "" : String(v));
    const title = safe(story?.title || "Good News Story");
    const category = safe(story?.category || "Good News");
    const dateStr = story?.story_date
        ? new Date(story.story_date).toLocaleDateString()
        : story?.created_date
            ? new Date(story.created_date).toLocaleDateString()
            : "";

    const submittedBy = safe(story?.submitted_by_name || story?.created_by_name || "");
    const body = safe(story?.story_content || story?.story || "");

    const photoUrls =
        story?.photo_urls?.length
            ? story.photo_urls
            : Array.isArray(story?.photos)
                ? story.photos.map((p) => p?.url).filter(Boolean)
                : [];

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px; margin: 0 auto; padding: 40px 20px;
      color: #1a1a1a; line-height: 1.6;
    }
    .header { text-align: center; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 3px solid #f59e0b; }
    .header h1 { font-size: 26px; margin: 0 0 8px 0; }
    .header p { color: #666; margin: 0; }
    .story { background: #fefce8; border-radius: 12px; padding: 24px; border: 1px solid #fef08a; }
    h2 { font-size: 20px; margin: 0 0 8px 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; background: #fef3c7; color: #92400e; margin-right: 8px; }
    .featured { background: #f59e0b; color: white; }
    .meta { display: flex; gap: 16px; margin: 10px 0 16px 0; font-size: 14px; color: #666; flex-wrap: wrap; }
    .content { font-size: 15px; white-space: pre-wrap; margin-top: 10px; }
    .photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
    .photos img { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; }
    .print-btn {
      position: fixed; top: 20px; right: 20px; background: #f59e0b; color: white;
      border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .print-btn:hover { background: #d97706; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
  <div class="header">
    <h1>Good News Story</h1>
    <p>Generated ${new Date().toLocaleDateString()}</p>
  </div>

  <div class="story">
    <h2>${title}</h2>
    <div>
      <span class="badge">${category}</span>
      ${story?.is_featured ? `<span class="badge featured">Featured</span>` : ``}
    </div>

    <div class="meta">
      ${dateStr ? `<span>${dateStr}</span>` : ``}
      ${participantName ? `<span>${safe(participantName)}</span>` : ``}
      ${submittedBy ? `<span>${submittedBy}</span>` : ``}
    </div>

    <div class="content">${body}</div>

    ${photoUrls.length ? `<div class="photos">${photoUrls.map((u) => `<img src="${u}" alt="Story photo" />`).join("")}</div>` : ``}
  </div>
</body>
</html>
`;

    printWindow.document.write(html);
    printWindow.document.close();
}

function exportSingleStoryAsWordText(story, participantName) {
    if (!story) return;

    const dateStr = story?.story_date
        ? new Date(story.story_date).toLocaleDateString()
        : story?.created_date
            ? new Date(story.created_date).toLocaleDateString()
            : "";

    const submittedBy = safeText(story?.submitted_by_name || story?.created_by_name || "");
    const title = safeText(story?.title || "Good News Story");
    const category = safeText(story?.category || "Good News");
    const body = safeText(story?.story_content || story?.story || "");

    const text = [
        "GOOD NEWS STORY",
        "================",
        "",
        `Title: ${title}`,
        `Category: ${category}`,
        dateStr ? `Date: ${dateStr}` : null,
        participantName ? `Participant: ${participantName}` : null,
        submittedBy ? `Submitted by: ${submittedBy}` : null,
        "",
        "Story:",
        "------",
        body,
        "",
    ]
        .filter(Boolean)
        .join("\n");

    exportGoodNewsTextToWord({
        filename: `${title.replace(/[^\w\- ]+/g, "").slice(0, 60) || "good-news"}.doc`,
        text,
    });
}

export default function ParticipantGoodNews({ participantId, participant }) {
    const queryClient = useQueryClient();

    const [createOpen, setCreateOpen] = useState(false);
    const [viewOpen, setViewOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [selectedStory, setSelectedStory] = useState(null);

    // AI context dialog
    const [aiContextOpen, setAiContextOpen] = useState(false);
    const [aiContext, setAiContext] = useState("");

    // FORM STATE (single source of truth for create + AI)
    const [createForm, setCreateForm] = useState({
        title: "",
        story: "",
        category: "Good News",
        is_featured: false,
    });

    const [photos, setPhotos] = useState([]);
    const [shareChannelId, setShareChannelId] = useState("");

    const participantName = useMemo(() => {
        const fn = participant?.first_name || "";
        const ln = participant?.last_name || "";
        const full = `${fn} ${ln}`.trim();
        return full || safeText(participant?.full_name) || safeText(participant?.name) || "";
    }, [participant]);

    const { data: me } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    // ---------------- AI (Rewrite / Generate) ----------------
    const aiMutation = useMutation({
        mutationFn: async ({ mode, context }) => {
            const title = safeText(createForm.title).trim();
            const story = safeText(createForm.story).trim();
            const extraContext = safeText(context).trim();

            const contextLines = [
                `Participant: ${safeText(participantName) || "Unknown"}`,
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
                        "Rewrite the following participant Good News story to be more polished and professional.",
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
                        "Generate a participant Good News story.",
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
                story: outStory || story || "",
            };
        },
        onSuccess: (data) => {
            setCreateForm((prev) => ({ ...prev, ...data }));
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

    // ---------------- Stories ----------------
    const { data: goodNewsStoriesRaw = [], isLoading: loadingStories, error: storiesError } = useQuery({
        queryKey: ["goodNewsStories", participantId],
        queryFn: async () => {
            const res = await base44.entities.GoodNewsStory.filter({ participant_id: participantId }, undefined, 500);
            return Array.isArray(res) ? res : [];
        },
        enabled: !!participantId,
    });

    const goodNewsStories = useMemo(() => {
        const normalized = (goodNewsStoriesRaw || []).map(normalizeStory);
        return normalized.sort((a, b) => {
            const ad = a.story_date || a.created_date || "";
            const bd = b.story_date || b.created_date || "";
            return String(bd).localeCompare(String(ad));
        });
    }, [goodNewsStoriesRaw]);

    const openStory = (story) => {
        setSelectedStory(normalizeStory(story));
        setViewOpen(true);
    };

    const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

    const createStoryMutation = useMutation({
        mutationFn: async () => {
            if (!participantId) throw new Error("Missing participantId");
            if (!createForm.title.trim()) throw new Error("Title is required");
            if (!createForm.story.trim()) throw new Error("Story content is required");

            const uploadedPhotos = [];
            for (const file of photos) {
                const upload = await base44.integrations.Core.UploadFile({ file, pathPrefix: "goodnews" });
                uploadedPhotos.push({
                    file_name: upload?.file_name || file.name,
                    content_type: upload?.content_type || file.type,
                    size: upload?.size || file.size,
                    storage_path: upload?.storage_path || null,
                    url: upload?.url || upload?.file_url,
                });
            }

            const payload = {
                participant_id: participantId,
                participant_name: participantName || null,

                title: createForm.title.trim(),
                story: createForm.story.trim(),

                story_content: createForm.story.trim(),
                story_date: new Date().toISOString(),
                category: createForm.category || "Good News",
                is_featured: Boolean(createForm.is_featured),

                photos: uploadedPhotos,
                photo_urls: uploadedPhotos.map((p) => p.url).filter(Boolean),
            };

            return base44.entities.GoodNewsStory.create(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["goodNewsStories", participantId] });
            setCreateOpen(false);
            setCreateForm({ title: "", story: "", category: "Good News", is_featured: false });
            setPhotos([]);
            setAiContext("");
            setAiContextOpen(false);
        },
        onError: (err) => {
            console.error("Create story failed:", err);
            alert(err?.message || "Failed to create story. Check console for details.");
        },
    });

    // Channels only when share UI is open
    const { data: channels = [], isLoading: loadingChannels, error: channelsError } = useQuery({
        queryKey: ["forumChannels"],
        enabled: shareOpen === true,
        queryFn: async () => {
            const qRef = query(collection(db, "forumChannels"), where("isActive", "==", true));
            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

            rows.sort((a, b) => {
                const ad = a?.createdAt?.seconds ? a.createdAt.seconds : 0;
                const bd = b?.createdAt?.seconds ? b.createdAt.seconds : 0;
                return ad - bd;
            });

            return rows
                .map((c) => ({
                    id: c.id,
                    name: safeText(c.name || c.channel_name || c.title || c.id).trim(),
                    isActive: c?.isActive === true,
                }))
                .filter((c) => c.id && c.name && c.isActive);
        },
    });

    // ✅ Share directly to Firestore forumMessages (matches Forum.jsx expectations)
    const shareToForumMutation = useMutation({
        mutationFn: async ({ story, channelId }) => {
            if (!story?.id) throw new Error("Missing story");
            if (!channelId) throw new Error("Select a forum channel");

            const channel = channels.find((c) => c.id === channelId);
            const photoUrls = Array.isArray(story?.photo_urls) ? story.photo_urls.filter(Boolean) : [];
            const attachments = photoUrls.map((url) => ({ type: "image", url, name: "image" }));

            const messagePayload = {
                channelId,
                channel_id: channelId,
                channel_name: channel?.name || channelId,

                message_type: "good_news_story",
                title: story.title || "Good News Story",
                body: story.story_content || story.story || "",
                content: "",

                // helps with thumbnails / legacy rendering
                photo_urls: photoUrls,
                attachments,

                linked_participant_id: story.participant_id || participantId,
                linked_entity_type: "GoodNewsStory",
                linked_entity_id: story.id,

                authorId: me?.id || null,
                authorName: me?.full_name || me?.display_name || "Unknown",
                authorRole: me?.app_role || null,

                createdAt: serverTimestamp(),
                likedBy: [],
            };

            const forumDocRef = await addDoc(collection(db, "forumMessages"), messagePayload);
            return { id: forumDocRef.id, ...messagePayload };
        },
        onSuccess: () => {
            // forum listens via onSnapshot; invalidations are optional
            setShareOpen(false);
            setShareChannelId("");
            alert("Shared to forum.");
        },
        onError: (err) => {
            console.error("Share failed:", err);
            alert(err?.message || "Failed to share to forum. Check console for details.");
        },
    });

    const storyCountLabel = useMemo(() => {
        const n = goodNewsStories.length;
        return `${n} ${n === 1 ? "story" : "stories"}`;
    }, [goodNewsStories.length]);

    return (
        <div className="space-y-6">
            {/* AI Context Dialog */}
            <Dialog open={aiContextOpen} onOpenChange={setAiContextOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-white">Generate story with AI</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 mt-2">
                        <p className="text-sm text-slate-400">
                            Add a little context (optional). Example: what happened, when, who helped, key milestone.
                        </p>

                        <div>
                            <Label className="text-slate-300">Context (optional)</Label>
                            <Textarea
                                value={aiContext}
                                onChange={(e) => setAiContext(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white"
                                rows={5}
                                placeholder="e.g., Participant completed their first week at ABC Company and received great feedback..."
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="outline" className="border-slate-700" onClick={() => setAiContextOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={handleAiGenerateConfirm}
                                disabled={aiMutation.isPending}
                            >
                                {aiMutation.isPending ? "Generating..." : "Generate"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-white">Good News</h3>
                    <p className="text-sm text-slate-400">Only stories for this participant are shown here.</p>
                    {storiesError && (
                        <p className="text-xs text-red-300 mt-2">Failed to load stories: {safeText(storiesError?.message)}</p>
                    )}
                </div>

                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700" type="button">
                            <Plus className="h-4 w-4 mr-2" />
                            New Story
                        </Button>
                    </DialogTrigger>

                    <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                                <Megaphone className="h-5 w-5" />
                                Create Good News Story
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 mt-4">
                            <div>
                                <Label className="text-slate-300">Title</Label>
                                <Input
                                    value={createForm.title}
                                    onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="e.g., First shift milestone"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleAiRewrite}
                                    disabled={aiMutation.isPending}
                                    className="gap-2"
                                >
                                    <Sparkles className="h-4 w-4" />
                                    {aiMutation.isPending ? "Working..." : "Rewrite with AI"}
                                </Button>

                                <Button type="button" onClick={handleAiGenerateClick} disabled={aiMutation.isPending} className="gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    {aiMutation.isPending ? "Working..." : "Generate with AI"}
                                </Button>
                            </div>

                            <div>
                                <Label className="text-slate-300">Category</Label>
                                <Input
                                    value={createForm.category}
                                    onChange={(e) => setCreateForm((p) => ({ ...p, category: e.target.value }))}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="Good News"
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Story</Label>
                                <Textarea
                                    value={createForm.story}
                                    onChange={(e) => setCreateForm((p) => ({ ...p, story: e.target.value }))}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    rows={8}
                                    placeholder="Write the story..."
                                />
                            </div>

                            <div>
                                <Label className="text-slate-300">Photos (optional)</Label>
                                <div className="mt-2 flex items-center gap-3">
                                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer hover:bg-slate-700/60">
                                        <ImageIcon className="h-4 w-4" />
                                        Add photos
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                if (files.length) setPhotos((prev) => [...prev, ...files]);
                                                e.target.value = "";
                                            }}
                                        />
                                    </label>

                                    {photos.length > 0 && <span className="text-sm text-slate-400">{photos.length} selected</span>}
                                </div>

                                {photos.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {photos.map((f, idx) => (
                                            <div
                                                key={`${f.name}-${idx}`}
                                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700"
                                            >
                                                <span className="text-xs text-slate-200 max-w-[220px] truncate">{f.name}</span>
                                                <button type="button" className="text-slate-400 hover:text-white" onClick={() => removePhoto(idx)} title="Remove">
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="ghost" className="text-slate-300" onClick={() => setCreateOpen(false)} type="button">
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-blue-600 hover:bg-blue-700"
                                    onClick={() => createStoryMutation.mutate()}
                                    disabled={createStoryMutation.isPending || !createForm.title.trim() || !createForm.story.trim()}
                                    type="button"
                                >
                                    {createStoryMutation.isPending ? "Saving..." : "Save Story"}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {loadingStories ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <h3 className="text-lg font-semibold text-white">Good News Stories</h3>
                        <span className="text-xs text-slate-500 ml-2">Loading...</span>
                    </div>
                    <LoadingSpinner />
                </div>
            ) : goodNewsStories.length > 0 ? (
                <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
                                <Sparkles className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Good News Stories</h3>
                                <p className="text-xs text-slate-400">{storyCountLabel}</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {goodNewsStories.map((raw) => {
                            const story = normalizeStory(raw);
                            return (
                                <button
                                    key={story.id}
                                    onClick={() => openStory(story)}
                                    className="w-full text-left bg-slate-900/50 rounded-xl p-4 hover:bg-slate-800/40 transition-colors"
                                    type="button"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-medium text-white truncate">{story.title}</h4>
                                                {story.is_featured && <Star className="h-4 w-4 text-amber-400 fill-amber-400" />}
                                            </div>

                                            <p className="text-sm text-slate-400 line-clamp-2">{story.story_content}</p>

                                            <div className="flex items-center gap-3 mt-2">
                                                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">{story.category}</Badge>

                                                {story.story_date && (
                                                    <span className="text-xs text-slate-500">{format(new Date(story.story_date), "MMM d, yyyy")}</span>
                                                )}
                                            </div>
                                        </div>

                                        {story.photo_urls?.[0] && (
                                            <img
                                                src={story.photo_urls[0]}
                                                alt={story.title}
                                                loading="lazy"
                                                className="w-20 h-20 rounded-lg object-cover shrink-0"
                                            />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <EmptyState
                    icon={Sparkles}
                    title="No Good News stories"
                    description="Create your first story for this participant"
                    actionLabel="New Story"
                    onAction={() => setCreateOpen(true)}
                />
            )}

            <Dialog
                open={viewOpen}
                onOpenChange={(v) => {
                    setViewOpen(v);
                    if (!v) {
                        setShareOpen(false);
                        setShareChannelId("");
                    }
                }}
            >
                <DialogContent className="bg-slate-900 border-slate-800 max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-white flex items-center justify-between gap-4">
                            <span className="truncate">{selectedStory?.title || "Good News Story"}</span>

                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                <Button
                                    variant="outline"
                                    className="border-slate-700"
                                    onClick={() => exportSingleStoryAsPDF(selectedStory, participantName)}
                                    disabled={!selectedStory}
                                    type="button"
                                >
                                    <FileDown className="h-4 w-4 mr-2" />
                                    Export PDF
                                </Button>

                                <Button
                                    variant="outline"
                                    className="border-slate-700"
                                    onClick={() => exportSingleStoryAsWordText(selectedStory, participantName)}
                                    disabled={!selectedStory}
                                    type="button"
                                >
                                    <FileText className="h-4 w-4 mr-2" />
                                    Export Word (Text)
                                </Button>

                                <Button
                                    className="bg-blue-600 hover:bg-blue-700"
                                    onClick={() => setShareOpen(true)}
                                    disabled={!selectedStory}
                                    type="button"
                                >
                                    <Share2 className="h-4 w-4 mr-2" />
                                    Share to Forum
                                </Button>
                            </div>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 mt-2">
                        {selectedStory?.story_date && (
                            <p className="text-xs text-slate-500">
                                {format(new Date(selectedStory.story_date), "EEEE, MMMM d, yyyy")}
                            </p>
                        )}

                        <div className="text-slate-200 whitespace-pre-wrap leading-relaxed">{selectedStory?.story_content}</div>

                        {Array.isArray(selectedStory?.photo_urls) && selectedStory.photo_urls.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                {selectedStory.photo_urls.map((url, idx) => (
                                    <a
                                        key={`${url}-${idx}`}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block rounded-xl overflow-hidden border border-slate-800 bg-slate-950"
                                        title="Open full size"
                                    >
                                        <img
                                            src={url}
                                            alt={selectedStory.title || ""}
                                            loading="lazy"
                                            className="w-full h-[240px] object-contain bg-black/20"
                                        />
                                    </a>
                                ))}
                            </div>
                        )}
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
                                ) : channels.length === 0 ? (
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
                                                    {channels.map((c) => (
                                                        <SelectItem key={c.id} value={c.id} className="text-white">
                                                            {c.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <Button
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                            disabled={!selectedStory || !shareChannelId || shareToForumMutation.isPending}
                                            onClick={() =>
                                                shareToForumMutation.mutate({
                                                    story: selectedStory,
                                                    channelId: shareChannelId,
                                                })
                                            }
                                            type="button"
                                        >
                                            {shareToForumMutation.isPending ? (
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
        </div>
    );
}
