// src/components/FCMForegroundListener.jsx
import { useEffect } from "react";
import { onMessage } from "firebase/messaging";
import { getMessagingSafe } from "@/firebase";
import { toast } from "@/components/ui/use-toast";

function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
}

export default function FCMForegroundListener() {
    useEffect(() => {
        let unsub = null;

        (async () => {
            const messaging = await getMessagingSafe();
            if (!messaging) return;

            unsub = onMessage(messaging, (payload) => {
                // ✅ you can remove this log later
                console.log("📩 FCM foreground payload:", payload);

                const title =
                    safeText(payload?.notification?.title) ||
                    safeText(payload?.data?.title) ||
                    "Notification";

                const message =
                    safeText(payload?.notification?.body) ||
                    safeText(payload?.data?.body) ||
                    safeText(payload?.data?.message) ||
                    "";

                toast({ title, description: message });

                // optional browser popup while app is open
                if (typeof window !== "undefined" && "Notification" in window) {
                    if (Notification.permission === "granted") {
                        try {
                            new Notification(title, { body: message });
                        } catch {
                            // ignore
                        }
                    }
                }
            });
        })();

        return () => {
            if (typeof unsub === "function") unsub();
        };
    }, []);

    return null;
}
