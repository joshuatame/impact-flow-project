// src/lib/fcmTokenStore.js
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase";

function tokenToDocId(token) {
    return String(token).replace(/\//g, "_");
}

export async function upsertUserFcmToken({ uid, token, enabled = true }) {
    if (!uid || !token) return;

    const tokenDocId = tokenToDocId(token);
    const tokenRef = doc(db, "User", uid, "fcmTokens", tokenDocId);

    await setDoc(
        tokenRef,
        {
            token,
            platform: "web",
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
            disabled: enabled !== true,
            createdAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
        },
        { merge: true }
    );

    await setDoc(
        doc(db, "User", uid),
        {
            browser_notifications_enabled: enabled === true,
            push_notifications_enabled: enabled === true,
            fcm_token_latest: token,
            fcm_token_updated_at: serverTimestamp(),
        },
        { merge: true }
    );
}
