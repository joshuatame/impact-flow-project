/* public/firebase-messaging-sw.js */
/* eslint-disable no-undef */

// ✅ Load SAME-ORIGIN scripts (no CDN needed)
importScripts("/firebase-app-compat.js");
importScripts("/firebase-messaging-compat.js");

// ✅ Your Firebase config
firebase.initializeApp({
    apiKey: "AIzaSyCDUA5x0Itk2TaqgcKP1rf8HeDlCbnJTXI",
    authDomain: "impact-flow-jpc.firebaseapp.com",
    projectId: "impact-flow-jpc",
    storageBucket: "impact-flow-jpc.firebasestorage.app",
    messagingSenderId: "428194572102",
    appId: "1:428194572102:web:6d5903d8e446277d51a747",
    measurementId: "G-9Z42KNQ2YR",
});

const messaging = firebase.messaging();

// helps during dev
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// ✅ Background push handler
messaging.onBackgroundMessage((payload) => {
    const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        "Impact Central";

    const body =
        payload?.notification?.body ||
        payload?.data?.body ||
        payload?.data?.message ||
        "";

    const linkUrl =
        payload?.data?.link_url ||
        payload?.data?.linkUrl ||
        "/";

    self.registration.showNotification(title, {
        body,
        data: { linkUrl },
    });
});

// ✅ Click: focus/open app + navigate
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const linkUrl = event?.notification?.data?.linkUrl || "/";

    event.waitUntil(
        (async () => {
            const allClients = await clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });

            for (const client of allClients) {
                if ("focus" in client) {
                    await client.focus();
                    if ("navigate" in client) await client.navigate(linkUrl);
                    return;
                }
            }

            if (clients.openWindow) await clients.openWindow(linkUrl);
        })()
    );
});
