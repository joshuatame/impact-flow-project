// src/components/NotificationListener.jsx
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { toast } from "@/components/ui/use-toast";

function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
}

function getNotificationId(n) {
    return n?.id || n?._id || n?.docId || null;
}

function getCreatedMillis(n) {
    const ts = n?.created_at || n?.createdAt;
    if (ts?.toMillis) return ts.toMillis();
    if (ts?.seconds) return ts.seconds * 1000;
    const iso = n?.created_date || n?.createdDate;
    if (typeof iso === "string") {
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    return 0;
}

function getType(n) {
    return safeText(n?.type || n?.notification_type || "").trim();
}

function isAllowedByPrefs(me, n) {
    const type = getType(n);
    if (!type) return true;

    switch (type) {
        case "task_assigned":
            return me?.notify_task_assignments !== false;

        case "approval_required":
            return true;

        case "forum_like":
        case "forum_comment":
            return true;

        case "training_reminder":
            return me?.notify_training_reminders !== false;

        case "employment_milestone":
            return me?.notify_employment_milestones !== false;

        case "overdue_task":
            return me?.notify_overdue_tasks !== false;

        case "intake_upcoming":
            return me?.notify_upcoming_intakes !== false;

        default:
            return true;
    }
}

/**
 * Listens for new Notification docs for the current user and:
 * - shows an in-app toast
 * - optionally shows a browser Notification() popup if enabled + permission granted
 */
export default function NotificationListener() {
    const { data: me } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    // Keep latest "me" without forcing the Firestore listener to resubscribe
    const meRef = useRef(null);
    useEffect(() => {
        meRef.current = me || null;
    }, [me]);

    const lastSeenMillisRef = useRef(0);
    const shownIdsRef = useRef(new Set());

    // Reset tracking if the logged-in user changes
    useEffect(() => {
        lastSeenMillisRef.current = 0;
        shownIdsRef.current = new Set();
    }, [me?.id]);

    useEffect(() => {
        if (!me?.id) return undefined;

        const qRef = query(
            collection(db, "Notification"),
            where("user_id", "==", me.id),
            orderBy("created_at", "desc"),
            limit(25)
        );

        const unsubscribe = onSnapshot(
            qRef,
            (snap) => {
                const currentMe = meRef.current;

                const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

                // First load: don't spam old notifications
                if (!lastSeenMillisRef.current && docs.length) {
                    lastSeenMillisRef.current = Math.max(...docs.map(getCreatedMillis));
                    docs.forEach((n) => {
                        const id = getNotificationId(n);
                        if (id) shownIdsRef.current.add(id);
                    });
                    return;
                }

                const browserEnabled = currentMe?.browser_notifications_enabled === true;

                for (const n of docs) {
                    const id = getNotificationId(n);
                    if (!id || shownIdsRef.current.has(id)) continue;

                    const created = getCreatedMillis(n);
                    if (created && created <= lastSeenMillisRef.current) continue;

                    shownIdsRef.current.add(id);
                    lastSeenMillisRef.current = Math.max(lastSeenMillisRef.current, created || 0);

                    // Preference gate
                    if (!isAllowedByPrefs(currentMe, n)) continue;

                    const title = safeText(n.title || "Notification");
                    const message = safeText(n.message || n.body || n.description || "");

                    // In-app toast
                    toast({ title, description: message });

                    // Browser popup
                    if (browserEnabled && typeof window !== "undefined" && "Notification" in window) {
                        if (Notification.permission === "granted") {
                            try {
                                new Notification(title, { body: message });
                            } catch (_) { }
                        }
                    }
                }
            },
            (err) => {
                console.error("NotificationListener Firestore listener error:", err);
            }
        );

        return () => unsubscribe();
    }, [me?.id]);

    return null;
}
