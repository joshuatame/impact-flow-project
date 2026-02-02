// src/components/forum/useForumUnreadCount.js
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";

function getChannelId(msg) {
  return msg?.channelId || msg?.channel_id || msg?.forumChannelId || msg?.forum_channel_id || null;
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

/**
 * Forum unread count is computed from Firestore read receipts (forumChannelReads)
 * + forumMessages timestamps. This ensures "read" is unique per user.
 */
export function useForumUnreadCount() {
  const { data: me } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const [messages, setMessages] = useState([]);
  const [readMap, setReadMap] = useState({}); // channelId -> lastReadMillis

  useEffect(() => {
    const qRef = query(collection(db, "forumMessages"), orderBy("createdAt", "desc"), limit(500));
    const unsub = onSnapshot(
      qRef,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setMessages([])
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!me?.id) return undefined;
    const qRef = query(collection(db, "forumChannelReads"), where("userId", "==", me.id));
    const unsub = onSnapshot(
      qRef,
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          const ch = data.channelId;
          const ts = data.lastReadAt;
          let millis = 0;
          if (ts?.toMillis) millis = ts.toMillis();
          else if (ts?.seconds) millis = ts.seconds * 1000;
          if (ch) next[ch] = millis;
        });
        setReadMap(next);
      },
      () => setReadMap({})
    );
    return () => unsub();
  }, [me?.id]);

  const { total, byChannel } = useMemo(() => {
    if (!me?.id) return { total: 0, byChannel: {} };
    const counts = {};
    let t = 0;

    for (const msg of messages) {
      const channelId = getChannelId(msg);
      if (!channelId) continue;

      const authorId = msg.authorId || msg.createdById || msg.created_by_id;
      if (authorId && authorId === me.id) continue;

      const createdMillis = getMessageCreatedAtMillis(msg);
      const lastReadMillis = readMap[channelId] || 0;

      if (createdMillis > lastReadMillis) {
        counts[channelId] = (counts[channelId] || 0) + 1;
        t += 1;
      }
    }

    return { total: t, byChannel: counts };
  }, [me?.id, messages, readMap]);

  return { totalUnread: total, unreadByChannel: byChannel, me };
}
