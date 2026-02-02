import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { setActiveEntity } from "@/lib/activeEntity";

function buildDefaultUserProfile(firebaseUser) {
    const email = firebaseUser?.email || "";
    const fullName = firebaseUser?.displayName || (email ? email.split("@")[0] : "") || "";

    return {
        email,
        full_name: fullName,
        app_role: "User", // legacy fallback
        status: "Active",
        is_active: true,
        entity_access: {},
        last_active_entity_id: null,
        view_as_role: null,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
    };
}

export default function FinishSignIn() {
    const navigate = useNavigate();
    const [params] = useSearchParams();

    const inviteId = params.get("inviteId") || "";
    const entityId = params.get("entityId") || "";

    const isLink = useMemo(() => {
        try {
            return isSignInWithEmailLink(auth, window.location.href);
        } catch {
            return false;
        }
    }, []);

    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    async function finish() {
        setMsg("");
        if (!isLink) {
            setMsg("This is not a valid sign-in link.");
            return;
        }
        const trimmed = String(email || "").trim().toLowerCase();
        if (!trimmed) {
            setMsg("Please enter your email to finish sign-in.");
            return;
        }
        if (!inviteId) {
            setMsg("Missing inviteId.");
            return;
        }

        setBusy(true);
        try {
            const result = await signInWithEmailLink(auth, trimmed, window.location.href);
            const firebaseUser = result.user;

            // Ensure user profile exists
            const userRef = doc(db, "User", firebaseUser.uid);
            const snap = await getDoc(userRef);

            if (!snap.exists()) {
                await setDoc(userRef, buildDefaultUserProfile(firebaseUser), { merge: true });
            } else {
                await updateDoc(userRef, { last_login: new Date().toISOString() });
            }

            // Apply invite
            const inviteRef = doc(db, "userInvites", inviteId);
            const invSnap = await getDoc(inviteRef);

            if (!invSnap.exists()) {
                setMsg("Invite not found.");
                setBusy(false);
                return;
            }

            const inv = invSnap.data() || {};
            const invEmail = String(inv.email || "").trim().toLowerCase();

            if (invEmail && invEmail !== trimmed) {
                setMsg("This invite was issued to a different email address.");
                setBusy(false);
                return;
            }

            if (inv.status === "revoked") {
                setMsg("This invite has been revoked.");
                setBusy(false);
                return;
            }

            const targetEntityId = String(inv.entity_id || entityId || "").trim();
            if (!targetEntityId) {
                setMsg("Invite missing business unit.");
                setBusy(false);
                return;
            }

            // Update entity access for this user
            const patch = {
                [`entity_access.${targetEntityId}`]: {
                    active: true,
                    role: inv.role || "User",
                    invited_via: "emailLink",
                },
                last_active_entity_id: targetEntityId,
            };

            await updateDoc(userRef, patch);

            // Mark invite accepted
            await updateDoc(inviteRef, {
                status: "accepted",
                accepted_by_uid: firebaseUser.uid,
                accepted_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            });

            // Set active entity (client storage) and go in
            setActiveEntity({ id: targetEntityId, type: inv.entity_type || "", name: inv.entity_name || "" });
            navigate("/Dashboard", { replace: true });
        } catch (e) {
            console.error(e);
            setMsg("Could not finish sign-in. The link may be expired.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white px-4">
            <div className="max-w-md mx-auto py-10 space-y-6">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <div className="font-bold text-xl">Finish sign-in</div>
                        <div className="text-xs text-slate-400">Enter your email to accept your invite.</div>
                    </div>
                </div>

                {msg && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
                        {msg}
                    </div>
                )}

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                    <div>
                        <Label className="text-slate-300">Email</Label>
                        <Input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-slate-800 border-slate-700 text-white"
                            placeholder="name@company.com"
                            disabled={busy}
                        />
                    </div>

                    <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={finish} disabled={busy}>
                        {busy ? "Finishing…" : "Accept invite"}
                    </Button>

                    <Button
                        variant="secondary"
                        className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                        onClick={() => navigate("/Landing")}
                        disabled={busy}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
}
