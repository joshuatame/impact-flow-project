// src/lib/ensureFcmTokenSaved.js
import { requestNotificationPermission, getFcmToken } from "@/lib/fcm";
import { upsertUserFcmToken } from "@/lib/fcmTokenStore";

export async function ensureFcmTokenSaved({ uid }) {
    if (!uid) return { ok: false, reason: "missing_uid" };

    const perm = await requestNotificationPermission();
    if (perm !== "granted") return { ok: false, reason: `permission_${perm}` };

    const token = await getFcmToken();
    await upsertUserFcmToken({ uid, token, enabled: true });

    return { ok: true, token };
}
