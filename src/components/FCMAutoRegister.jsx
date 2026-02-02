// src/components/FCMAutoRegister.jsx
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ensureFcmTokenSaved } from "@/lib/ensureFcmTokenSaved";

export default function FCMAutoRegister() {
    const { data: me } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    useEffect(() => {
        let cancelled = false;

        async function run() {
            if (!me?.id) return;
            if (me?.browser_notifications_enabled !== true) return;

            try {
                const res = await ensureFcmTokenSaved({ uid: me.id });
                if (!cancelled) {
                    if (res?.ok) console.log("✅ FCM token saved:", res.token);
                    else console.log("ℹ️ FCM not enabled:", res?.reason);
                }
            } catch (e) {
                if (!cancelled) console.error("FCM auto-register failed:", e);
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [me?.id, me?.browser_notifications_enabled]);

    return null;
}
