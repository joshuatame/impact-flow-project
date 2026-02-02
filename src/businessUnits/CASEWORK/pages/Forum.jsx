// src/pages/Forum.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Send,
    Hash,
    Pin,
    Users,
    MessageSquare,
    Image as ImageIcon,
    Smile,
    Heart,
    MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { createPageUrl } from "@/utils";

import { uploadGoodNewsPhotos } from "@/lib/firebaseUploadPhotos";

// Firestore
import {
    collection,
    addDoc,
    updateDoc,
    setDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    limit,
    serverTimestamp,
    where,
    arrayUnion,
    arrayRemove,
} from "firebase/firestore";
import { db } from "@/firebase";

function ImageModal({ url, onClose }) {
    if (!url) return null;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={onClose}
            role="button"
            tabIndex={0}
        >
            <div
                className="max-w-5xl w-full"
                onClick={(e) => e.stopPropagation()}
                role="presentation"
            >
                <div className="flex justify-end mb-2">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                </div>
                <div className="bg-black rounded-xl overflow-hidden border border-slate-800">
                    <img
                        src={url}
                        alt="Attachment"
                        className="w-full h-auto object-contain"
                    />
                </div>
            </div>
        </div>
    );
}

const iconMap = { hash: Hash, pin: Pin, users: Users, message: MessageSquare };

const roleColors = {
    SystemAdmin: "text-red-400",
    Manager: "text-purple-400",
    ContractsAdmin: "text-blue-400",
    ClientCaseWorker: "text-emerald-400",
};

const EMOJIS = [
    "😀",
    "😁",
    "😂",
    "🤣",
    "😊",
    "😍",
    "🥳",
    "😎",
    "😅",
    "😬",
    "😢",
    "😡",
    "👍",
    "👏",
    "🙏",
    "🔥",
    "❤️",
    "🎉",
    "✅",
    "📣",
];

function getChannelId(msg) {
    return (
        msg?.channelId ||
        msg?.channel_id ||
        msg?.forumChannelId ||
        msg?.forum_channel_id ||
        null
    );
}

function getMessageBody(msg) {
    if (!msg) return "";
    if (msg.message_type === "good_news_story") {
        const title = msg.title ? `${msg.title}\n\n` : "";
        const body = msg.body || msg.content || "";
        return `${title}${body}`.trim();
    }
    return msg.content || "";
}

function getMessageAuthorName(msg) {
    return (
        msg?.authorName ||
        msg?.created_by_name ||
        msg?.author_name ||
        msg?.createdByName ||
        "Unknown"
    );
}

function getMessageAuthorRole(msg) {
    return (
        msg?.authorRole ||
        msg?.created_by_role ||
        msg?.author_role ||
        msg?.createdByRole ||
        null
    );
}

function getMessageCreatedAtMillis(msg) {
    const ts = msg?.createdAt || msg?.created_at;
    if (ts?.toMillis) return ts.toMillis();
    if (ts?.seconds) return ts.seconds * 1000;
    if (typeof ts === "string") {
        const d = new Date(ts);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (ts instanceof Date) return ts.getTime();
    return 0;
}

function getMessageCreatedAtDate(msg) {
    const ts = msg?.createdAt || msg?.created_at;
    if (ts?.toDate) return ts.toDate();
    if (ts?.seconds) return new Date(ts.seconds * 1000);
    if (typeof ts === "string") return new Date(ts);
    if (ts instanceof Date) return ts;
    return null;
}

function normalizeAttachments(message) {
    const atts = [];

    if (Array.isArray(message?.attachments)) {
        for (const a of message.attachments) {
            if (!a) continue;
            if (typeof a === "string")
                atts.push({ type: "image", url: a, name: "image" });
            else if (a.url)
                atts.push({
                    type: a.type || "image",
                    url: a.url,
                    name: a.name || "image",
                });
        }
    }

    const urlArrays = [
        message?.photo_urls,
        message?.photoUrls,
        message?.photos,
        message?.images,
        message?.image_urls,
        message?.imageUrls,
        message?.downloadUrls,
    ].filter(Array.isArray);

    for (const arr of urlArrays) {
        for (const url of arr) {
            if (!url) continue;
            if (!atts.some((x) => x.url === url))
                atts.push({ type: "image", url, name: "image" });
        }
    }

    const singles = [
        message?.photo_url,
        message?.photoUrl,
        message?.image_url,
        message?.imageUrl,
    ].filter(Boolean);

    for (const url of singles) {
        if (!atts.some((x) => x.url === url))
            atts.push({ type: "image", url, name: "image" });
    }

    return atts;
}

function buildReadReceiptId(channelId, userId) {
    return `${channelId}_${userId}`;
}

export default function Forum() {
    const [channels, setChannels] = useState([]);
    const [activeChannelId, setActiveChannelId] = useState(null);

    const [allMessages, setAllMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");

    const [creatingChannel, setCreatingChannel] = useState(false);
    const [newChannelName, setNewChannelName] = useState("");

    const [loadingChannels, setLoadingChannels] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(true);

    const [pendingFiles, setPendingFiles] = useState([]);
    const [pendingUploads, setPendingUploads] = useState(false);

    const [viewerUrl, setViewerUrl] = useState(null);

    const [showEmoji, setShowEmoji] = useState(false);

    const [readReceipts, setReadReceipts] = useState({});
    const [channelReadsAll, setChannelReadsAll] = useState({});
    const [commentsByMessage, setCommentsByMessage] = useState({});
    const [commentDrafts, setCommentDrafts] = useState({});
    const [openComments, setOpenComments] = useState({});

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    const { data: user, isLoading: loadingUser } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: allUsers = [] } = useQuery({
        queryKey: ["allUsers"],
        queryFn: () => base44.entities.User.list(),
    });

    // names only: full_name -> display_name -> email (no id fallback)
    const userNameById = useMemo(() => {
        const map = {};
        for (const u of allUsers || []) {
            if (!u?.id) continue;
            map[u.id] = u.full_name || u.display_name || u.email || "";
        }
        return map;
    }, [allUsers]);

    // Seen-by helpers (names only + tooltip-friendly full list)
    const getSeenByNames = (channelId, msg) => {
        if (!channelId || !msg) return [];
        const reads = channelReadsAll[channelId] || {};
        const msgMillis = getMessageCreatedAtMillis(msg);
        if (!msgMillis) return [];

        const authorId = msg.authorId || msg.createdById || msg.created_by_id || null;
        const currentUserId = user?.id || null;

        const seenIds = Object.entries(reads)
            .filter(([, millis]) => (Number(millis) || 0) >= msgMillis)
            .map(([uid]) => uid)
            .filter((uid) => uid && uid !== authorId && uid !== currentUserId);

        return seenIds.map((uid) => userNameById[uid]).filter(Boolean);
    };

    const getSeenByLabel = (channelId, msg) => {
        const names = getSeenByNames(channelId, msg);
        if (!names.length) return null;

        const shown = names.slice(0, 3);
        const remaining = names.length - shown.length;

        return `Seen by ${shown.join(", ")}${remaining > 0 ? ` +${remaining}` : ""}`;
    };

    const notify = async ({ recipientId, type, title, message, linkUrl, meta } = {}) => {
        if (!recipientId || recipientId === user?.id) return;
        try {
            await base44.entities.Notification.create({
                user_id: recipientId,
                notification_type: type,
                type,
                title,
                message,
                is_read: false,
                link_url: linkUrl || createPageUrl("Forum"),
                ...(meta || {}),
            });
        } catch (e) {
            console.error("Failed to create notification", e);
        }
    };

    const logActivity = async ({ activity_type, message, target_user_id, metadata } = {}) => {
        try {
            await addDoc(collection(db, "ActivityLog"), {
                activity_type: activity_type || "forum",
                message: message || "",
                actor_id: user?.id || null,
                actor_name: user?.full_name || user?.display_name || user?.email || null,
                target_user_id: target_user_id || null,
                metadata: metadata || {},
                createdAt: serverTimestamp(),
            });
        } catch (_) {
            // best-effort
        }
    };

    const isAdmin =
        user?.app_role === "SystemAdmin" ||
        user?.app_role === "Manager" ||
        user?.app_role === "ContractsAdmin";

    useEffect(() => {
        const qRef = query(
            collection(db, "forumChannels"),
            where("isActive", "==", true),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(
            qRef,
            (snapshot) => {
                const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
                setChannels(docs);
                setLoadingChannels(false);

                setActiveChannelId((prev) => {
                    if (!docs.length) return null;
                    if (!prev) return docs[0].id;
                    if (!docs.some((c) => c.id === prev)) return docs[0].id;
                    return prev;
                });
            },
            (error) => {
                console.error("Error loading channels", error);
                setLoadingChannels(false);
            }
        );

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const qRef = query(
            collection(db, "forumMessages"),
            orderBy("createdAt", "desc"),
            limit(500)
        );

        const unsubscribe = onSnapshot(
            qRef,
            (snapshot) => {
                const docs = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                    _source: "forumMessages",
                }));
                setAllMessages(docs);
                setLoadingMessages(false);
            },
            (error) => {
                console.error("Error loading messages", error);
                setLoadingMessages(false);
            }
        );

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user?.id) return;

        const qRef = query(
            collection(db, "forumChannelReads"),
            where("userId", "==", user.id)
        );

        const unsubscribe = onSnapshot(
            qRef,
            (snapshot) => {
                const map = {};
                snapshot.docs.forEach((d) => {
                    const data = d.data() || {};
                    const ch = data.channelId;
                    const ts = data.lastReadAt;
                    let millis = 0;
                    if (ts?.toMillis) millis = ts.toMillis();
                    else if (ts?.seconds) millis = ts.seconds * 1000;
                    if (ch) map[ch] = millis;
                });
                setReadReceipts(map);
            },
            (error) => console.error("Error loading read receipts", error)
        );

        return () => unsubscribe();
    }, [user?.id]);

    useEffect(() => {
        const qRef = query(collection(db, "forumChannelReads"), limit(5000));
        const unsubscribe = onSnapshot(
            qRef,
            (snapshot) => {
                const map = {};
                snapshot.docs.forEach((d) => {
                    const data = d.data() || {};
                    const ch = data.channelId;
                    const uid = data.userId;
                    const ts = data.lastReadAt;
                    let millis = 0;
                    if (ts?.toMillis) millis = ts.toMillis();
                    else if (ts?.seconds) millis = ts.seconds * 1000;
                    if (!ch || !uid) return;
                    if (!map[ch]) map[ch] = {};
                    map[ch][uid] = millis;
                });
                setChannelReadsAll(map);
            },
            (error) => console.error("Error loading all read receipts", error)
        );

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const markChannelRead = async () => {
            if (!user?.id || !activeChannelId) return;
            try {
                const readId = buildReadReceiptId(activeChannelId, user.id);
                await setDoc(
                    doc(db, "forumChannelReads", readId),
                    { userId: user.id, channelId: activeChannelId, lastReadAt: serverTimestamp() },
                    { merge: true }
                );
            } catch (e) {
                console.error("Error updating channel read receipt", e);
            }
        };

        markChannelRead();
    }, [activeChannelId, user?.id]);

    const activeChannelMessages = useMemo(() => {
        return allMessages
            .filter((m) => getChannelId(m) === activeChannelId)
            .sort((a, b) => getMessageCreatedAtMillis(a) - getMessageCreatedAtMillis(b));
    }, [allMessages, activeChannelId]);

    const unreadCounts = useMemo(() => {
        if (!user?.id) return {};
        const counts = {};

        for (const msg of allMessages) {
            const channelId = getChannelId(msg);
            if (!channelId) continue;

            const authorId = msg.authorId || msg.createdById || msg.created_by_id;
            if (authorId && authorId === user.id) continue;

            const createdMillis = getMessageCreatedAtMillis(msg);
            const lastReadMillis = readReceipts[channelId] || 0;

            if (createdMillis > lastReadMillis) counts[channelId] = (counts[channelId] || 0) + 1;
        }

        return counts;
    }, [allMessages, readReceipts, user?.id]);

    const lastMessageByChannel = useMemo(() => {
        const last = {};
        for (const msg of allMessages) {
            const channelId = getChannelId(msg);
            if (!channelId) continue;
            if (!last[channelId]) last[channelId] = msg;
        }
        return last;
    }, [allMessages]);

    useEffect(() => {
        if (!activeChannelId) {
            setCommentsByMessage({});
            return;
        }

        const qRef = query(
            collection(db, "forumComments"),
            where("channelId", "==", activeChannelId),
            orderBy("createdAt", "asc"),
            limit(500)
        );

        const unsubscribe = onSnapshot(
            qRef,
            (snapshot) => {
                const map = {};
                snapshot.docs.forEach((d) => {
                    const data = { id: d.id, ...d.data() };
                    const mid = data.messageId;
                    if (!mid) return;
                    if (!map[mid]) map[mid] = [];
                    map[mid].push(data);
                });
                setCommentsByMessage(map);
            },
            (error) => console.error("Error loading comments", error)
        );

        return () => unsubscribe();
    }, [activeChannelId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeChannelMessages.length]);

    const handlePickFiles = () => fileInputRef.current?.click();

    const handleFilesSelected = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const imgs = files.filter((f) => f?.type?.startsWith("image/")).slice(0, 6);
        setPendingFiles((prev) => [...prev, ...imgs].slice(0, 6));
        e.target.value = "";
    };

    const removePendingFile = (idx) =>
        setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

    const appendEmoji = (emoji) => {
        setNewMessage((prev) => `${prev}${emoji}`);
        setShowEmoji(false);
    };

    const handleSend = async () => {
        if (!user?.id || !activeChannelId) return;

        const content = newMessage.trim();
        const hasFiles = pendingFiles.length > 0;
        if (!content && !hasFiles) return;

        try {
            setPendingUploads(true);

            let attachments = [];
            if (hasFiles) {
                const urls = await uploadGoodNewsPhotos(pendingFiles, { folder: "forum_photos" });
                attachments = urls.map((url) => ({ type: "image", url, name: "image" }));
            }

            await addDoc(collection(db, "forumMessages"), {
                channelId: activeChannelId,
                channel_id: activeChannelId,
                message_type: "text",
                content,
                attachments,
                authorId: user.id,
                authorName: user.full_name,
                authorRole: user.app_role,
                createdAt: serverTimestamp(),
                likedBy: [],
            });

            setNewMessage("");
            setPendingFiles([]);

            try {
                const readId = buildReadReceiptId(activeChannelId, user.id);
                await setDoc(
                    doc(db, "forumChannelReads", readId),
                    { userId: user.id, channelId: activeChannelId, lastReadAt: serverTimestamp() },
                    { merge: true }
                );
            } catch (e) {
                console.error("Error updating read receipt after send", e);
            }
        } catch (err) {
            console.error("Error sending message", err);
        } finally {
            setPendingUploads(false);
        }
    };

    const handleCreateChannel = async () => {
        const name = newChannelName.trim();
        if (!name || !user?.id) return;

        try {
            const docRef = await addDoc(collection(db, "forumChannels"), {
                name,
                icon: "hash",
                isActive: true,
                createdById: user.id,
                createdByName: user.full_name,
                createdAt: serverTimestamp(),
            });
            setNewChannelName("");
            setCreatingChannel(false);
            setActiveChannelId(docRef.id);
        } catch (err) {
            console.error("Error creating channel", err);
        }
    };

    const toggleLike = async (message) => {
        if (!user?.id) return;
        if (!message?.id) return;
        if (message?._source !== "forumMessages") return;

        const likedBy = Array.isArray(message.likedBy) ? message.likedBy : [];
        const hasLiked = likedBy.includes(user.id);

        try {
            const ref = doc(db, "forumMessages", message.id);
            await updateDoc(ref, {
                likedBy: hasLiked ? arrayRemove(user.id) : arrayUnion(user.id),
            });

            if (!hasLiked) {
                const channelId = getChannelId(message) || activeChannelId;
                const linkUrl = createPageUrl(`Forum?channelId=${encodeURIComponent(channelId)}`);

                await notify({
                    recipientId: message.authorId,
                    type: "forum_like",
                    title: "New like on your forum message",
                    message: `${user?.full_name || "Someone"} liked your message in ${activeChannel?.name || "Forum"}.`,
                    linkUrl,
                    meta: { forum_message_id: message.id, forum_channel_id: channelId },
                });

                await logActivity({
                    activity_type: "forum_like",
                    message: `${user?.full_name || "Someone"} liked a forum message`,
                    target_user_id: message.authorId,
                    metadata: { forum_message_id: message.id, forum_channel_id: channelId },
                });
            }
        } catch (e) {
            console.error("Error toggling like", e);
        }
    };

    const toggleComments = (messageId) => {
        setOpenComments((prev) => ({ ...prev, [messageId]: !prev[messageId] }));
    };

    const submitComment = async (message) => {
        if (!user?.id || !activeChannelId) return;
        if (!message?.id) return;
        if (message?._source !== "forumMessages") return;

        const text = String(commentDrafts[message.id] || "").trim();
        if (!text) return;

        try {
            await addDoc(collection(db, "forumComments"), {
                channelId: activeChannelId,
                messageId: message.id,
                content: text,
                authorId: user.id,
                authorName: user.full_name,
                authorRole: user.app_role,
                createdAt: serverTimestamp(),
            });

            const channelId = getChannelId(message) || activeChannelId;
            const linkUrl = createPageUrl(`Forum?channelId=${encodeURIComponent(channelId)}`);

            await notify({
                recipientId: message.authorId,
                type: "forum_comment",
                title: "New comment on your forum message",
                message: `${user?.full_name || "Someone"} commented on your message in ${activeChannel?.name || "Forum"}.`,
                linkUrl,
                meta: { forum_message_id: message.id, forum_channel_id: channelId },
            });

            await logActivity({
                activity_type: "forum_comment",
                message: `${user?.full_name || "Someone"} commented on a forum message`,
                target_user_id: message.authorId,
                metadata: { forum_message_id: message.id, forum_channel_id: channelId },
            });

            setCommentDrafts((prev) => ({ ...prev, [message.id]: "" }));
            setOpenComments((prev) => ({ ...prev, [message.id]: true }));
        } catch (e) {
            console.error("Error adding comment", e);
        }
    };

    const getInitials = (name) => {
        if (!name) return "U";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    if (loadingUser && !user) return <LoadingSpinner />;
    if (loadingChannels) return <LoadingSpinner />;

    const activeChannel = channels.find((c) => c.id === activeChannelId);

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8 h-screen flex flex-col">
            <PageHeader title="Team Forum" subtitle="Discuss and collaborate with your team" />

            <ImageModal url={viewerUrl} onClose={() => setViewerUrl(null)} />

            <div className="flex-1 flex gap-6 min-h-0">
                {/* Desktop Channels Sidebar */}
                <div className="w-64 hidden lg:flex flex-col bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase">Channels</h3>
                        {isAdmin && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-slate-400 hover:text-white"
                                onClick={() => setCreatingChannel((prev) => !prev)}
                                type="button"
                            >
                                +
                            </Button>
                        )}
                    </div>

                    {creatingChannel && (
                        <div className="mb-3 flex gap-2">
                            <Input
                                value={newChannelName}
                                onChange={(e) => setNewChannelName(e.target.value)}
                                placeholder="New channel name"
                                className="bg-slate-800 border-slate-700 text-white text-xs"
                            />
                            <Button
                                size="icon"
                                className="bg-blue-600 hover:bg-blue-700 h-8 w-8"
                                onClick={handleCreateChannel}
                                disabled={!newChannelName.trim()}
                                type="button"
                            >
                                <Send className="h-3 w-3" />
                            </Button>
                        </div>
                    )}

                    <div className="space-y-1">
                        {channels.map((channel) => {
                            const Icon = iconMap[channel.icon] || Hash;
                            const unread = unreadCounts[channel.id] || 0;
                            const isActive = activeChannelId === channel.id;
                            const lastMsg = lastMessageByChannel[channel.id];

                            const previewAuthor = lastMsg ? lastMsg.authorName || "" : "";
                            const previewText = lastMsg ? getMessageBody(lastMsg).split("\n")[0] || "" : "";

                            const seenLabel = lastMsg ? getSeenByLabel(channel.id, lastMsg) : null;
                            const seenNames = lastMsg ? getSeenByNames(channel.id, lastMsg) : [];

                            return (
                                <button
                                    key={channel.id}
                                    onClick={() => setActiveChannelId(channel.id)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${isActive
                                            ? "bg-blue-600/20 text-blue-400"
                                            : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                                        }`}
                                    type="button"
                                >
                                    <div className="flex flex-col items-start gap-0.5 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Icon className="h-4 w-4" />
                                            <span className="text-sm">{channel.name}</span>
                                        </div>

                                        {lastMsg && (
                                            <>
                                                <span className="text-xs text-slate-500 truncate max-w-[150px]">
                                                    {previewAuthor}: {previewText}
                                                </span>

                                                {seenLabel && (
                                                    <span
                                                        className="text-[10px] text-slate-600 truncate max-w-[150px]"
                                                        title={seenNames.join(", ")}
                                                    >
                                                        {seenLabel}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    {unread > 0 && (
                                        <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[20px] flex items-center justify-center">
                                            {unread}
                                        </Badge>
                                    )}
                                </button>
                            );
                        })}

                        {channels.length === 0 && (
                            <div className="text-xs text-slate-500 mt-2">
                                No channels yet.
                                {isAdmin && " Create one to get started."}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile channel picker ONLY (no create UI) */}
                <div className="lg:hidden w-full flex flex-col gap-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-2 overflow-x-auto">
                        <div className="flex gap-2">
                            {channels.map((channel) => {
                                const Icon = iconMap[channel.icon] || Hash;
                                const unread = unreadCounts[channel.id] || 0;
                                const isActive = activeChannelId === channel.id;

                                return (
                                    <button
                                        key={channel.id}
                                        onClick={() => setActiveChannelId(channel.id)}
                                        className={`relative flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${isActive ? "bg-blue-600/20 text-blue-400" : "text-slate-400"
                                            }`}
                                        type="button"
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="text-xs">{channel.name}</span>
                                        {unread > 0 && (
                                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                                                {unread}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Messages area */}
                <div className="flex-1 flex flex-col bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <Hash className="h-5 w-5 text-slate-400" />
                            <h2 className="text-lg font-semibold text-white">
                                {activeChannel?.name || "Select a channel"}
                            </h2>
                        </div>
                    </div>

                    <ScrollArea className="flex-1 p-4">
                        {loadingMessages && (
                            <div className="text-center py-4 text-slate-500 text-sm">
                                Loading messages...
                            </div>
                        )}

                        <div className="space-y-4">
                            {activeChannelMessages.map((message) => {
                                const authorName = getMessageAuthorName(message);
                                const authorRole = getMessageAuthorRole(message);
                                const body = getMessageBody(message);
                                const createdAt = getMessageCreatedAtDate(message);
                                const attachments = normalizeAttachments(message);

                                const likedBy = Array.isArray(message.likedBy) ? message.likedBy : [];
                                const hasLiked = user?.id ? likedBy.includes(user.id) : false;
                                const likeCount = likedBy.length;

                                const commentList = commentsByMessage[message.id] || [];
                                const commentCount = commentList.length;

                                const canInteract = message?._source === "forumMessages";

                                const seenLabel = activeChannelId ? getSeenByLabel(activeChannelId, message) : null;
                                const seenNames = activeChannelId ? getSeenByNames(activeChannelId, message) : [];

                                return (
                                    <div key={message.id} className="flex gap-3">
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-600 text-white text-sm">
                                                {getInitials(authorName)}
                                            </AvatarFallback>
                                        </Avatar>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`font-medium ${roleColors[authorRole] || "text-white"}`}>
                                                    {authorName}
                                                </span>

                                                {authorRole && (
                                                    <Badge className="bg-slate-700/50 text-slate-400 text-xs">
                                                        {authorRole}
                                                    </Badge>
                                                )}

                                                {createdAt && (
                                                    <span className="text-xs text-slate-500">
                                                        {format(createdAt, "MMM d, h:mm a")}
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-slate-300 mt-1 whitespace-pre-wrap">{body}</p>

                                            {attachments.length > 0 && (
                                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {attachments.map((att, idx) => (
                                                        <button
                                                            key={`${att.url}-${idx}`}
                                                            type="button"
                                                            className="group relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950"
                                                            onClick={() => setViewerUrl(att.url)}
                                                            title="Open image"
                                                        >
                                                            <img
                                                                src={att.url}
                                                                alt={att.name || "image"}
                                                                className="h-28 w-full object-cover group-hover:opacity-90 transition"
                                                                loading="lazy"
                                                            />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="mt-2 flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    className={`text-xs flex items-center gap-1 ${canInteract
                                                            ? hasLiked
                                                                ? "text-red-400"
                                                                : "text-slate-400 hover:text-white"
                                                            : "text-slate-600 cursor-not-allowed"
                                                        }`}
                                                    onClick={() => (canInteract ? toggleLike(message) : null)}
                                                    disabled={!canInteract}
                                                >
                                                    <Heart className="h-4 w-4" />
                                                    <span>{likeCount}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    className={`text-xs flex items-center gap-1 ${canInteract
                                                            ? "text-slate-400 hover:text-white"
                                                            : "text-slate-600 cursor-not-allowed"
                                                        }`}
                                                    onClick={() => (canInteract ? toggleComments(message.id) : null)}
                                                    disabled={!canInteract}
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                    <span>{commentCount}</span>
                                                </button>
                                            </div>

                                            {seenLabel && (
                                                <div className="mt-1 text-[10px] text-slate-600" title={seenNames.join(", ")}>
                                                    {seenLabel}
                                                </div>
                                            )}

                                            {canInteract && openComments[message.id] && (
                                                <div className="mt-2 border border-slate-800 rounded-xl p-3 bg-slate-950/40">
                                                    <div className="space-y-3">
                                                        {commentList.length === 0 && (
                                                            <div className="text-xs text-slate-500">No comments yet.</div>
                                                        )}

                                                        {commentList.map((c) => {
                                                            const cAuthor = c.authorName || "Unknown";
                                                            const cRole = c.authorRole || null;
                                                            const cAt = c.createdAt?.toDate ? c.createdAt.toDate() : null;

                                                            return (
                                                                <div key={c.id} className="flex gap-2">
                                                                    <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center text-xs text-white">
                                                                        {getInitials(cAuthor)}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="text-xs text-white font-medium">{cAuthor}</span>
                                                                            {cRole && (
                                                                                <Badge className="bg-slate-700/50 text-slate-400 text-xs">
                                                                                    {cRole}
                                                                                </Badge>
                                                                            )}
                                                                            {cAt && (
                                                                                <span className="text-[11px] text-slate-500">
                                                                                    {format(cAt, "MMM d, h:mm a")}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-xs text-slate-300 whitespace-pre-wrap">
                                                                            {c.content || ""}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="mt-3 flex gap-2 items-start">
                                                        <textarea
                                                            value={commentDrafts[message.id] || ""}
                                                            onChange={(e) =>
                                                                setCommentDrafts((prev) => ({
                                                                    ...prev,
                                                                    [message.id]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="Write a comment..."
                                                            className="w-full bg-slate-900 border border-slate-800 text-white text-sm rounded-lg px-3 py-2 min-h-[40px] max-h-[120px] overflow-auto resize-none"
                                                        />
                                                        <Button
                                                            type="button"
                                                            className="bg-blue-600 hover:bg-blue-700"
                                                            disabled={!(commentDrafts[message.id] || "").trim()}
                                                            onClick={() => submitComment(message)}
                                                        >
                                                            Post
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            <div ref={messagesEndRef} />
                        </div>

                        {!loadingMessages && activeChannelMessages.length === 0 && (
                            <div className="text-center py-12 text-slate-500 text-sm">
                                No messages in this channel yet. Start the conversation.
                            </div>
                        )}
                    </ScrollArea>

                    {/* Composer */}
                    <div className="p-4 border-t border-slate-800">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleFilesSelected}
                            className="hidden"
                        />

                        {pendingFiles.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {pendingFiles.map((f, idx) => (
                                    <div
                                        key={`${f.name}-${idx}`}
                                        className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1"
                                    >
                                        <ImageIcon className="h-4 w-4 text-slate-300" />
                                        <span className="text-xs text-slate-200 max-w-[180px] truncate">
                                            {f.name}
                                        </span>
                                        <button
                                            type="button"
                                            className="text-xs text-slate-400 hover:text-white"
                                            onClick={() => removePendingFile(idx)}
                                            title="Remove"
                                        >
                                            x
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showEmoji && (
                            <div className="mb-3 border border-slate-800 rounded-xl p-2 bg-slate-950/60">
                                <div className="grid grid-cols-10 gap-1">
                                    {EMOJIS.map((e) => (
                                        <button
                                            key={e}
                                            type="button"
                                            className="h-8 w-8 rounded-lg hover:bg-slate-800 text-lg"
                                            onClick={() => appendEmoji(e)}
                                            title={e}
                                        >
                                            {e}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 items-end">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handlePickFiles}
                                disabled={!activeChannel || pendingUploads}
                                title="Attach photos"
                            >
                                <ImageIcon className="h-4 w-4" />
                            </Button>

                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setShowEmoji((p) => !p)}
                                disabled={!activeChannel || pendingUploads}
                                title="Emojis"
                            >
                                <Smile className="h-4 w-4" />
                            </Button>

                            <textarea
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder={
                                    activeChannel
                                        ? `Message #${activeChannel.name}... (Ctrl+Enter to send)`
                                        : "Select a channel to start messaging..."
                                }
                                disabled={!activeChannel || pendingUploads}
                                className="bg-slate-800 border border-slate-700 text-white flex-1 rounded-lg px-3 py-2 min-h-[44px] max-h-[140px] overflow-auto resize-none"
                            />

                            <Button
                                onClick={handleSend}
                                disabled={
                                    !user?.id ||
                                    !activeChannel ||
                                    pendingUploads ||
                                    (!newMessage.trim() && pendingFiles.length === 0)
                                }
                                className="bg-blue-600 hover:bg-blue-700"
                                type="button"
                                title={pendingUploads ? "Uploading..." : "Send"}
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>

                        {pendingUploads && (
                            <div className="mt-2 text-xs text-slate-500">Uploading photos...</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
