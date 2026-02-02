// src/pages/JobBlastApply.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

function getBlastId() {
    const p = new URLSearchParams(window.location.search);
    return p.get("blastId");
}

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function sanitizeFilename(name) {
    return String(name || "file").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_");
}

export default function JobBlastApply() {
    const [blast, setBlast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const blastId = useMemo(() => getBlastId(), []);

    // Applicant fields
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [mobile, setMobile] = useState("");
    const [email, setEmail] = useState("");
    const [firstNation, setFirstNation] = useState(""); // Aboriginal | Torres Strait Islander | Both | Neither

    // Files
    const [resumeFile, setResumeFile] = useState(null); // required
    const [coverLetterFile, setCoverLetterFile] = useState(null); // optional
    const [coverLetterText, setCoverLetterText] = useState(""); // optional

    useEffect(() => {
        const run = async () => {
            try {
                if (!blastId) {
                    setLoading(false);
                    return;
                }
                const snap = await getDoc(doc(db, "jobBlasts", blastId));
                setBlast(snap.exists() ? { id: snap.id, ...snap.data() } : null);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [blastId]);

    const uploadToStorage = async (file, path) => {
        const storage = getStorage(); // uses default initialized firebase app from "@/firebase"
        const r = ref(storage, path);
        await uploadBytes(r, file);
        return await getDownloadURL(r);
    };

    const submit = async () => {
        if (!blastId) return alert("Missing blastId");
        if (!blast) return alert("Job Blast not found");

        // Basic validation
        if (!firstName.trim()) return alert("First name is required");
        if (!lastName.trim()) return alert("Last name is required");
        if (!mobile.trim()) return alert("Mobile is required");
        if (!email.trim()) return alert("Email is required");
        if (!firstNation) return alert("Please select First Nation status");
        if (!resumeFile) return alert("Resume upload is required");

        setSubmitting(true);
        try {
            const now = Date.now();
            const basePath = `jobBlasts/${blastId}/applications/${now}_${sanitizeFilename(
                `${firstName}_${lastName}`
            )}`;

            // Upload files
            const resumePath = `${basePath}/resume_${sanitizeFilename(resumeFile.name)}`;
            const resumeUrl = await uploadToStorage(resumeFile, resumePath);

            let coverLetterUrl = "";
            let coverLetterPath = "";
            if (coverLetterFile) {
                coverLetterPath = `${basePath}/coverletter_${sanitizeFilename(coverLetterFile.name)}`;
                coverLetterUrl = await uploadToStorage(coverLetterFile, coverLetterPath);
            }

            // Save application
            await addDoc(collection(db, "jobBlastApplications"), {
                blastId,

                firstName: firstName.trim(),
                lastName: lastName.trim(),
                mobile: mobile.trim(),
                email: email.trim(),
                firstNation,

                resume: {
                    url: resumeUrl,
                    path: resumePath,
                    name: resumeFile.name,
                    type: resumeFile.type || "",
                    size: resumeFile.size || 0,
                },

                coverLetter: coverLetterFile
                    ? {
                        url: coverLetterUrl,
                        path: coverLetterPath,
                        name: coverLetterFile.name,
                        type: coverLetterFile.type || "",
                        size: coverLetterFile.size || 0,
                    }
                    : null,

                coverLetterText: coverLetterText.trim() || "",

                createdAt: serverTimestamp(),
            });

            alert("Application submitted. Thank you!");

            // Reset
            setFirstName("");
            setLastName("");
            setMobile("");
            setEmail("");
            setFirstNation("");
            setResumeFile(null);
            setCoverLetterFile(null);
            setCoverLetterText("");
        } catch (e) {
            console.error(e);
            alert(e?.message || "Failed to submit application.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
                Loading...
            </div>
        );
    }

    if (!blastId || !blast) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
                <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <div className="text-xl font-semibold">Job Blast not found</div>
                    <div className="text-sm text-slate-400 mt-2">
                        This application link is invalid.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="text-2xl font-bold">
                    {safeText(blast.businessName || "Business")} — {safeText(blast.title || "Role")}
                </div>

                {blast.intro && (
                    <div className="text-slate-300 mt-2 whitespace-pre-wrap">
                        {safeText(blast.intro)}
                    </div>
                )}

                {blast.roleDetails && (
                    <div className="text-slate-300 mt-3 whitespace-pre-wrap">
                        {safeText(blast.roleDetails)}
                    </div>
                )}

                <div className="mt-6 grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-slate-300">First Name *</Label>
                            <Input
                                className="bg-slate-800 border-slate-700 text-white"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="First name"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Last Name *</Label>
                            <Input
                                className="bg-slate-800 border-slate-700 text-white"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Last name"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Mobile *</Label>
                            <Input
                                className="bg-slate-800 border-slate-700 text-white"
                                value={mobile}
                                onChange={(e) => setMobile(e.target.value)}
                                placeholder="Mobile number"
                            />
                        </div>

                        <div>
                            <Label className="text-slate-300">Email *</Label>
                            <Input
                                className="bg-slate-800 border-slate-700 text-white"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Email address"
                            />
                        </div>
                    </div>

                    <div>
                        <Label className="text-slate-300">First Nation *</Label>
                        <Select value={firstNation} onValueChange={setFirstNation}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                <SelectValue placeholder="Select one" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                                <SelectItem value="Aboriginal" className="text-white">
                                    Aboriginal
                                </SelectItem>
                                <SelectItem value="Torres Strait Islander" className="text-white">
                                    Torres Strait Islander
                                </SelectItem>
                                <SelectItem value="Both" className="text-white">
                                    Both
                                </SelectItem>
                                <SelectItem value="Neither" className="text-white">
                                    Neither
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label className="text-slate-300">Resume (required) *</Label>
                        <Input
                            type="file"
                            accept=".pdf,.doc,.docx,.txt"
                            className="bg-slate-800 border-slate-700 text-white"
                            onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                        />
                        {resumeFile ? (
                            <div className="text-xs text-slate-500 mt-2">
                                Selected: {resumeFile.name}
                            </div>
                        ) : null}
                    </div>

                    <div>
                        <Label className="text-slate-300">Cover Letter (optional upload)</Label>
                        <Input
                            type="file"
                            accept=".pdf,.doc,.docx,.txt"
                            className="bg-slate-800 border-slate-700 text-white"
                            onChange={(e) => setCoverLetterFile(e.target.files?.[0] || null)}
                        />
                        {coverLetterFile ? (
                            <div className="text-xs text-slate-500 mt-2">
                                Selected: {coverLetterFile.name}
                            </div>
                        ) : null}
                    </div>

                    <div>
                        <Label className="text-slate-300">Cover Letter (optional text)</Label>
                        <Textarea
                            className="bg-slate-800 border-slate-700 text-white"
                            rows={6}
                            placeholder="Write your cover letter here (optional)..."
                            value={coverLetterText}
                            onChange={(e) => setCoverLetterText(e.target.value)}
                        />
                    </div>

                    <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={submit}
                        type="button"
                        disabled={submitting}
                    >
                        {submitting ? "Submitting..." : "Submit Application"}
                    </Button>

                    <div className="text-xs text-slate-500">
                        By submitting, your application is saved inside Impact Central under this Job Blast.
                    </div>
                </div>
            </div>
        </div>
    );
}
