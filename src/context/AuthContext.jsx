// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import { auth, db } from "@/firebase";

const AuthContext = createContext(null);

function buildDefaultUserProfile(firebaseUser) {
    const email = firebaseUser?.email || "";
    const fullName = firebaseUser?.displayName || (email ? email.split("@")[0] : "") || "";

    return {
        email,
        full_name: fullName,

        app_role: "Pending",
        status: "Pending",
        is_active: false,

        // ✅ entity selection + access map
        entity_access: {},
        last_active_entity_id: null,

        view_as_role: null,

        phone: "",
        daily_digest_enabled: true,
        daily_digest_time: "08:00",
        notify_training_reminders: true,
        notify_employment_milestones: true,
        notify_overdue_tasks: true,
        notify_new_case_notes: true,
        notify_task_assignments: true,
        notify_upcoming_intakes: true,
        browser_notifications_enabled: true,

        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
    };
}

function buildBackfillPatch(existing = {}, defaults = {}) {
    const patch = {};
    for (const [k, v] of Object.entries(defaults)) {
        if (existing[k] === undefined) patch[k] = v;
    }
    return patch;
}

function normEmail(v = "") {
    return String(v || "").trim().toLowerCase();
}

/**
 * ✅ Apply pending invites (by email) to this user on login.
 * Collection: userInvites
 * Fields expected:
 *  - email (lowercase)
 *  - entity_id
 *  - role
 *  - status: "Pending" | "Consumed"
 */
async function applyInvitesToUser(firebaseUser) {
    const uid = firebaseUser?.uid;
    if (!uid) return;

    const email = normEmail(firebaseUser?.email);
    if (!email) return;

    const invitesQ = query(
        collection(db, "userInvites"),
        where("email", "==", email),
        where("status", "==", "Pending")
    );

    const snap = await getDocs(invitesQ);
    if (snap.empty) return;

    // Merge invites into entity_access
    const entity_access_patch = {};
    const inviteDocIds = [];

    snap.docs.forEach((d) => {
        const inv = d.data() || {};
        inviteDocIds.push(d.id);

        if (inv.entity_id) {
            entity_access_patch[inv.entity_id] = {
                role: inv.role || "User",
                active: true,
            };
        }
    });

    if (!Object.keys(entity_access_patch).length) return;

    // Apply patch to /User/{uid}
    const userRef = doc(db, "User", uid);

    // Merge entity_access into existing entity_access (non-destructive)
    // We do a read to merge safely without wiping other units.
    const userSnap = await getDoc(userRef);
    const existing = userSnap.exists() ? userSnap.data() || {} : {};
    const nextEntityAccess = { ...(existing.entity_access || {}), ...entity_access_patch };

    await setDoc(
        userRef,
        {
            entity_access: nextEntityAccess,
            // If they were pending, unlock them now that they have an invite
            status: "Active",
            is_active: true,
        },
        { merge: true }
    );

    // Mark invites as consumed
    await Promise.all(
        inviteDocIds.map((inviteId) =>
            updateDoc(doc(db, "userInvites", inviteId), {
                status: "Consumed",
                consumed_at: new Date().toISOString(),
                consumed_by_uid: uid,
            })
        )
    );
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null); // Firestore "User" profile
    const [loading, setLoading] = useState(true);

    const profileUnsubRef = useRef(null);

    async function ensureUserProfile(firebaseUser) {
        if (!firebaseUser?.uid) return;

        const ref = doc(db, "User", firebaseUser.uid);
        const snap = await getDoc(ref);

        const defaults = buildDefaultUserProfile(firebaseUser);

        if (!snap.exists()) {
            await setDoc(ref, defaults, { merge: true });
            // ✅ even new users may have invites waiting
            await applyInvitesToUser(firebaseUser);
            return;
        }

        const existing = snap.data() || {};
        const backfill = buildBackfillPatch(existing, defaults);

        await setDoc(
            ref,
            {
                ...backfill,
                last_login: new Date().toISOString(),
            },
            { merge: true }
        );

        // ✅ apply any pending invites after backfill
        await applyInvitesToUser(firebaseUser);
    }

    useEffect(() => {
        const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
            // stop old profile listener
            if (profileUnsubRef.current) {
                profileUnsubRef.current();
                profileUnsubRef.current = null;
            }

            setLoading(true);

            if (!firebaseUser) {
                setUser(null);
                setLoading(false);
                return;
            }

            try {
                await ensureUserProfile(firebaseUser);

                const ref = doc(db, "User", firebaseUser.uid);
                profileUnsubRef.current = onSnapshot(
                    ref,
                    (snap) => {
                        setUser(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
                        setLoading(false);
                    },
                    (err) => {
                        console.error("AuthContext user profile listener error:", err);
                        setLoading(false);
                    }
                );
            } catch (err) {
                console.error("AuthContext ensureUserProfile error:", err);
                setUser(null);
                setLoading(false);
            }
        });

        return () => {
            if (profileUnsubRef.current) profileUnsubRef.current();
            authUnsub();
        };
    }, []);

    async function login(email, password) {
        // IMPORTANT: do not touch `loading` here
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged + onSnapshot will set user + loading=false
    }

    async function logout() {
        // IMPORTANT: do not touch `loading` here
        await signOut(auth);
        // onAuthStateChanged will set user=null + loading=false
    }

    return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}
