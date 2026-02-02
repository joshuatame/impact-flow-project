// src/businessUnits/LABOURHIRE/pages/candidate/CandidateOnboard.jsx

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { auth, db } from "../../../../firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { Button } from "../../../../components/ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card.jsx";
import { Input } from "../../../../components/ui/input.jsx";
import { Label } from "../../../../components/ui/label.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../../components/ui/alert.jsx";
import { getInviteByToken, markInviteUsed } from "../../api/labourHireApi.js";

const BU = "LABOURHIRE";

function isExpired(expiresAt) {
    if (!expiresAt) return false;
    const d =
        typeof expiresAt?.toDate === "function"
            ? expiresAt.toDate()
            : typeof expiresAt === "string"
                ? new Date(expiresAt)
                : expiresAt instanceof Date
                    ? expiresAt
                    : null;
    if (!d) return false;
    return d.getTime() < Date.now();
}

export default function CandidateOnboard({ mode = "candidate" }) {
    const { token } = useParams();
    const nav = useNavigate();

    const [invite, setInvite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [password, setPassword] = useState("");
    const [signInPassword, setSignInPassword] = useState("");
    const [existing, setExisting] = useState(false);

    const portal = useMemo(() => (mode === "company" ? "company" : "candidate"), [mode]);

    useEffect(() => {
        let alive = true;
        async function run() {
            setLoading(true);
            setErr("");
            const inv = await getInviteByToken(token);
            if (!alive) return;
            setInvite(inv);
            setLoading(false);

            if (!inv) setErr("Invite not found.");
            else if (inv.usedAt) setErr("Invite already used.");
            else if (isExpired(inv.expiresAt)) setErr("Invite expired.");
            else if (inv._kind !== portal) setErr(`This invite is for ${inv._kind}, not ${portal}.`);
        }
        run();
        return () => {
            alive = false;
        };
    }, [token, portal]);

    async function completeOnboarding(user) {
        const uid = user.uid;
        const entityId = invite.entityId;
        const candidateId = invite.candidateId || null;
        const hiringCompanyId = invite.hiringCompanyId || null;

        await runTransaction(db, async (tx) => {
            const wfRef = doc(db, "wfConnectUsers", uid);
            tx.set(
                wfRef,
                {
                    uid,
                    portal,
                    roles: portal === "candidate" ? ["CandidateUser"] : ["CompanyUser"],
                    candidateId,
                    hiringCompanyId,
                    entityId,
                    businessUnit: BU,
                    createdAt: serverTimestamp(),
                    createdBy: uid,
                    updatedAt: serverTimestamp(),
                    updatedBy: uid,
                },
                { merge: true }
            );

            if (portal === "candidate" && candidateId) {
                const candRef = doc(db, "candidates", candidateId);
                tx.set(
                    candRef,
                    {
                        businessUnit: BU,
                        entityId,
                        status: "onboarding",
                        profile: { email: invite.email || user.email || "" },
                        checklist: { resume: false, id: false, tickets: false },
                        share: { enabled: true, allowCompanyIds: [] },
                        createdAt: serverTimestamp(),
                        createdBy: uid,
                        updatedAt: serverTimestamp(),
                        updatedBy: uid,
                    },
                    { merge: true }
                );
            }

            if (portal === "company" && hiringCompanyId) {
                const compRef = doc(db, "hiringCompanies", hiringCompanyId);
                tx.set(
                    compRef,
                    {
                        businessUnit: BU,
                        entityId,
                        updatedAt: serverTimestamp(),
                        updatedBy: uid,
                    },
                    { merge: true }
                );
            }
        });

        await markInviteUsed({ token, kind: portal, user });
    }

    async function handleCreateAccount() {
        setErr("");
        if (!invite || err) return;

        try {
            const email = invite.email;
            if (!email) throw new Error("Invite is missing email.");
            if (!password || password.length < 8) throw new Error("Password must be at least 8 characters.");

            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await completeOnboarding(cred.user);

            nav(portal === "candidate" ? "/labourhire/candidate/profile" : "/labourhire/company/dashboard", { replace: true });
        } catch (e) {
            setErr(e?.message || "Failed to create account.");
        }
    }

    async function handleSignInExisting() {
        setErr("");
        if (!invite || err) return;

        try {
            const email = invite.email;
            if (!email) throw new Error("Invite is missing email.");
            if (!signInPassword) throw new Error("Enter your password.");

            const cred = await signInWithEmailAndPassword(auth, email, signInPassword);
            await completeOnboarding(cred.user);

            nav(portal === "candidate" ? "/labourhire/candidate/profile" : "/labourhire/company/dashboard", { replace: true });
        } catch (e) {
            setErr(e?.message || "Failed to sign in.");
        }
    }

    return (
        <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>{portal === "candidate" ? "Candidate Onboarding" : "Company Onboarding"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="text-sm text-muted-foreground">Loading invite…</div>
                    ) : (
                        <>
                            {err ? (
                                <Alert variant="destructive">
                                    <AlertTitle>Can’t continue</AlertTitle>
                                    <AlertDescription>{err}</AlertDescription>
                                </Alert>
                            ) : (
                                <Alert>
                                    <AlertTitle>Welcome</AlertTitle>
                                    <AlertDescription>
                                        You’re onboarding as <strong>{portal}</strong> for {invite?.entityId || "your entity"}.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!err && (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <Button variant={!existing ? "default" : "outline"} onClick={() => setExisting(false)}>
                                            Create account
                                        </Button>
                                        <Button variant={existing ? "default" : "outline"} onClick={() => setExisting(true)}>
                                            I already have an account
                                        </Button>
                                    </div>

                                    {!existing ? (
                                        <div className="grid gap-3">
                                            <div className="grid gap-2">
                                                <Label>Email</Label>
                                                <Input value={invite?.email || ""} readOnly />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>Password</Label>
                                                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                                                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                                            </div>
                                            <Button onClick={handleCreateAccount}>Create & continue</Button>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            <div className="grid gap-2">
                                                <Label>Email</Label>
                                                <Input value={invite?.email || ""} readOnly />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label>Password</Label>
                                                <Input type="password" value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} />
                                            </div>
                                            <Button onClick={handleSignInExisting}>Sign in & continue</Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                    This link is secure and single-use. If it expired, request a fresh invite.
                </CardContent>
            </Card>
        </div>
    );
}
