// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AuthProvider } from "@/context/AuthContext";
import Pages from "@/pages";
import FCMAutoRegister from "@/components/FCMAutoRegister";
import FCMForegroundListener from "@/components/FCMForegroundListener";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
        },
    },
});

// (Optional) Register SW once at startup (fine)
// If you prefer, you can remove this and rely on registerFcmServiceWorker() in fcm.js
if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("/firebase-messaging-sw.js")
        .then(() => console.log("✅ FCM service worker registered"))
        .catch((err) => console.error("❌ FCM service worker registration failed:", err));
}

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <AuthProvider>
                    <FCMAutoRegister />
                    <FCMForegroundListener />
                    <Pages />
                </AuthProvider>
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>
);
