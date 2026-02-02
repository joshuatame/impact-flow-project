// src/lib/fcm.js
import { getToken } from "firebase/messaging";
import { getMessagingSafe } from "@/firebase";

export async function registerFcmServiceWorker() {
    if (typeof window === "undefined") return null;
    if (!("serviceWorker" in navigator)) return null;

    // If already registered, reuse it
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;

    try {
        // MUST be at /public/firebase-messaging-sw.js
        return await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    } catch (err) {
        console.error("Failed to register /firebase-messaging-sw.js", err);
        return null;
    }
}

export async function requestNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return "denied";
    try {
        return await Notification.requestPermission();
    } catch {
        return "denied";
    }
}

export async function getFcmToken() {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) throw new Error("Missing VITE_FIREBASE_VAPID_KEY in .env.local");

    const messaging = await getMessagingSafe();
    if (!messaging) throw new Error("Firebase Messaging not supported in this browser.");

    const swReg = await registerFcmServiceWorker();
    if (!swReg) throw new Error("Service worker registration failed (required for push).");

    const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swReg,
    });

    if (!token) throw new Error("No FCM token returned (permission denied or blocked).");
    return token;
}
