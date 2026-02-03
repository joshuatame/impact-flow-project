// src/firebase.js
// Central Firebase initialisation for the whole app (Vite/HMR safe)

import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getMessaging, isSupported } from "firebase/messaging";

// Your Firebase config (from the console)
const firebaseConfig = {
    apiKey: "AIzaSyCDUA5x0Itk2TaqgcKP1rf8HeDlCbnJTXI",
    authDomain: "impact-flow-jpc.firebaseapp.com",
    projectId: "impact-flow-jpc",
    storageBucket: "impact-flow-jpc.firebasestorage.app",
    messagingSenderId: "428194572102",
    appId: "1:428194572102:web:6d5903d8e446277d51a747",
    measurementId: "G-9Z42KNQ2YR",
};

// ✅ IMPORTANT: create/get app safely (prevents duplicate init under HMR)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Core Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

const functions = getFunctions(app, "australia-southeast1");
const storage = getStorage(app, "gs://impact-flow-jpc.firebasestorage.app");
export { app, auth, db, storage, functions };

// ✅ Safe messaging getter (returns null if unsupported)
export async function getMessagingSafe() {
    const ok = await isSupported();
    if (!ok) return null;
    return getMessaging(app);
}
