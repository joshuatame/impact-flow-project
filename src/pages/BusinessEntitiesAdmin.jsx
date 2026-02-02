// src/pages/BusinessEntitiesAdmin.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Building2, Upload, ArrowLeft, Pencil, Save, XCircle } from "lucide-react";

const ENTITY_TYPES = [
    { value: "PROGRAMS", label: "Programs" },
    { value: "CASEWORK", label: "Casework" },
    { value: "RTO", label: "RTO Lead gen + enrolments" },
    { value: "LABOURHIRE", label: "Labourhire / Subcontracting" },
];

function isoNow() {
    return new Date().toISOString();
}

function sanitizeFilename(name = "") {
    return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

function toBool(v) {
    return Boolean(v);
}

export default function BusinessEntitiesAdmin() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const canAccess = useMemo(() => user?.app_role === "SystemAdmin", [user]);

    const [loadingList, setLoadingList] = useState(true);
    const [entities, setEntities] = useState([]);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // CREATE form
    const [createForm, setCreateForm] = useState({
        name: "",
        type: "PROGRAMS",
        active: true,
        trading_name: "",
        abn: "",
        phone: "",
        email: "",
        website: "",
        address_line1: "",
        address_line2: "",
        suburb: "",
        state: "",
        postcode: "",
        email_signature_html: "",
    });

    const [createLogoFile, setCreateLogoFile] = useState(null);
    const [createLogoPreviewUrl, setCreateLogoPreviewUrl] = useState("");
    const createPrevPreviewRef = useRef("");

    // EDIT form
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState(null);

    const [editLogoFile, setEditLogoFile] = useState(null);
    const [editLogoPreviewUrl, setEditLogoPreviewUrl] = useState("");
    const editPrevPreviewRef = useRef("");

    useEffect(() => {
        return () => {
            if (createPrevPreviewRef.current) URL.revokeObjectURL(createPrevPreviewRef.current);
            if (editPrevPreviewRef.current) URL.revokeObjectURL(editPrevPreviewRef.current);
        };
    }, []);

    async function loadEntities() {
        setLoadingList(true);
        try {
            const q = query(collection(db, "businessEntities"), orderBy("created_at", "desc"));
            const snap = await getDocs(q);
            setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
            setEntities([]);
        } finally {
            setLoadingList(false);
        }
    }

    useEffect(() => {
        if (!canAccess) return;
        loadEntities();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canAccess]);

    function onCreateChange(field) {
        return (e) => {
            const value = e?.target?.type === "checkbox" ? e.target.checked : e.target.value;
            setCreateForm((p) => ({ ...p, [field]: value }));
        };
    }

    function onEditChange(field) {
        return (e) => {
            const value = e?.target?.type === "checkbox" ? e.target.checked : e.target.value;
            setEditForm((p) => ({ ...p, [field]: value }));
        };
    }

    function pickCreateLogo(file) {
        setCreateLogoFile(file || null);

        if (createPrevPreviewRef.current) URL.revokeObjectURL(createPrevPreviewRef.current);
        createPrevPreviewRef.current = "";

        if (!file) {
            setCreateLogoPreviewUrl("");
            return;
        }

        const url = URL.createObjectURL(file);
        createPrevPreviewRef.current = url;
        setCreateLogoPreviewUrl(url);
    }

    function pickEditLogo(file) {
        setEditLogoFile(file || null);

        if (editPrevPreviewRef.current) URL.revokeObjectURL(editPrevPreviewRef.current);
        editPrevPreviewRef.current = "";

        if (!file) {
            setEditLogoPreviewUrl("");
            return;
        }

        const url = URL.createObjectURL(file);
        editPrevPreviewRef.current = url;
        setEditLogoPreviewUrl(url);
    }

    function validateCreate() {
        if (!createForm.name.trim()) return "Business name is required.";
        if (!createForm.type) return "Entity type is required.";
        return "";
    }

    async function createEntity(e) {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!canAccess) {
            setError("SystemAdmin only.");
            return;
        }

        const v = validateCreate();
        if (v) {
            setError(v);
            return;
        }

        setSaving(true);

        try {
            const createdAt = isoNow();
            const createdBy = user?.id || null;

            const ref = doc(collection(db, "businessEntities"));
            const entityId = ref.id;

            let logo_url = "";
            let logo_path = "";

            if (createLogoFile) {
                const filename = sanitizeFilename(createLogoFile.name || "logo.png");
                logo_path = `businessEntities/${entityId}/logo/${Date.now()}_${filename}`;
                const sref = storageRef(storage, logo_path);
                await uploadBytes(sref, createLogoFile, {
                    contentType: createLogoFile.type || "application/octet-stream",
                });
                logo_url = await getDownloadURL(sref);
            }

            const payload = {
                name: createForm.name.trim(),
                type: createForm.type,
                active: toBool(createForm.active),

                trading_name: createForm.trading_name.trim(),
                abn: createForm.abn.trim(),
                phone: createForm.phone.trim(),
                email: createForm.email.trim(),
                website: createForm.website.trim(),
                address_line1: createForm.address_line1.trim(),
                address_line2: createForm.address_line2.trim(),
                suburb: createForm.suburb.trim(),
                state: createForm.state.trim(),
                postcode: createForm.postcode.trim(),

                email_signature_html: createForm.email_signature_html || "",

                logo_url,
                logo_path,

                created_at: createdAt,
                created_by: createdBy,
                updated_at: createdAt,
                updated_by: createdBy,
            };

            await setDoc(ref, payload, { merge: true });

            setSuccess("Business entity created.");
            setCreateForm({
                name: "",
                type: "PROGRAMS",
                active: true,
                trading_name: "",
                abn: "",
                phone: "",
                email: "",
                website: "",
                address_line1: "",
                address_line2: "",
                suburb: "",
                state: "",
                postcode: "",
                email_signature_html: "",
            });
            pickCreateLogo(null);

            await loadEntities();
        } catch (err) {
            console.error(err);
            setError("Could not create business entity.");
        } finally {
            setSaving(false);
        }
    }

    async function startEdit(entityId) {
        setError("");
        setSuccess("");
        setEditLogoFile(null);
        setEditLogoPreviewUrl("");

        setSaving(true);
        try {
            const ref = doc(db, "businessEntities", entityId);
            const snap = await getDoc(ref);
            if (!snap.exists()) {
                setError("Entity not found.");
                setEditingId(null);
                setEditForm(null);
                return;
            }

            const data = snap.data() || {};
            setEditingId(entityId);
            setEditForm({
                name: data.name || "",
                type: data.type || "PROGRAMS",
                active: toBool(data.active),

                trading_name: data.trading_name || "",
                abn: data.abn || "",
                phone: data.phone || "",
                email: data.email || "",
                website: data.website || "",
                address_line1: data.address_line1 || "",
                address_line2: data.address_line2 || "",
                suburb: data.suburb || "",
                state: data.state || "",
                postcode: data.postcode || "",

                email_signature_html: data.email_signature_html || "",

                logo_url: data.logo_url || "",
                logo_path: data.logo_path || "",
            });
        } catch (err) {
            console.error(err);
            setError("Could not load entity for editing.");
        } finally {
            setSaving(false);
        }
    }

    function cancelEdit() {
        setEditingId(null);
        setEditForm(null);
        pickEditLogo(null);
    }

    function validateEdit() {
        if (!editForm?.name?.trim()) return "Business name is required.";
        if (!editForm?.type) return "Entity type is required.";
        return "";
    }

    async function saveEdit(e) {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!canAccess) {
            setError("SystemAdmin only.");
            return;
        }
        if (!editingId || !editForm) return;

        const v = validateEdit();
        if (v) {
            setError(v);
            return;
        }

        setSaving(true);
        try {
            const updatedAt = isoNow();
            const updatedBy = user?.id || null;

            let logo_url = editForm.logo_url || "";
            let logo_path = editForm.logo_path || "";

            if (editLogoFile) {
                const filename = sanitizeFilename(editLogoFile.name || "logo.png");
                logo_path = `businessEntities/${editingId}/logo/${Date.now()}_${filename}`;
                const sref = storageRef(storage, logo_path);
                await uploadBytes(sref, editLogoFile, {
                    contentType: editLogoFile.type || "application/octet-stream",
                });
                logo_url = await getDownloadURL(sref);
            }

            const payload = {
                name: editForm.name.trim(),
                type: editForm.type,
                active: toBool(editForm.active),

                trading_name: (editForm.trading_name || "").trim(),
                abn: (editForm.abn || "").trim(),
                phone: (editForm.phone || "").trim(),
                email: (editForm.email || "").trim(),
                website: (editForm.website || "").trim(),
                address_line1: (editForm.address_line1 || "").trim(),
                address_line2: (editForm.address_line2 || "").trim(),
                suburb: (editForm.suburb || "").trim(),
                state: (editForm.state || "").trim(),
                postcode: (editForm.postcode || "").trim(),

                email_signature_html: editForm.email_signature_html || "",

                logo_url,
                logo_path,

                updated_at: updatedAt,
                updated_by: updatedBy,
            };

            await updateDoc(doc(db, "businessEntities", editingId), payload);

            setSuccess("Entity updated.");
            pickEditLogo(null);

            await loadEntities();
        } catch (err) {
            console.error(err);
            setError("Could not update entity.");
        } finally {
            setSaving(false);
        }
    }

    async function quickToggleActive(entity) {
        setError("");
        setSuccess("");
        if (!canAccess) return;

        setSaving(true);
        try {
            const updatedAt = isoNow();
            const updatedBy = user?.id || null;
            await updateDoc(doc(db, "businessEntities", entity.id), {
                active: !entity.active,
                updated_at: updatedAt,
                updated_by: updatedBy,
            });
            await loadEntities();
        } catch (err) {
            console.error(err);
            setError("Could not toggle active.");
        } finally {
            setSaving(false);
        }
    }

    if (!canAccess) {
        return (
            <div className="p-6">
                <div className="max-w-3xl">
                    <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                        SystemAdmin only.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <div className="font-bold text-xl">Business Entities</div>
                            <div className="text-xs text-slate-400">Create and manage business units.</div>
                        </div>
                    </div>

                    <Button
                        variant="secondary"
                        className="bg-slate-800 hover:bg-slate-700 text-white"
                        onClick={() => navigate("/Admin")}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Admin
                    </Button>
                </div>

                {(error || success) && (
                    <div
                        className={[
                            "mt-6 rounded-xl border px-4 py-3 text-sm",
                            error
                                ? "border-red-900/60 bg-red-950/30 text-red-200"
                                : "border-emerald-900/60 bg-emerald-950/30 text-emerald-200",
                        ].join(" ")}
                    >
                        {error || success}
                    </div>
                )}

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* CREATE */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                        <div className="font-semibold">Create new entity</div>

                        <form onSubmit={createEntity} className="mt-5 space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-200 mb-1">
                                    Business name *
                                </label>
                                <input
                                    value={createForm.name}
                                    onChange={onCreateChange("name")}
                                    className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                    placeholder="e.g. Impact Central - Casework"
                                    required
                                    disabled={saving}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-200 mb-1">
                                        Entity type *
                                    </label>
                                    <select
                                        value={createForm.type}
                                        onChange={onCreateChange("type")}
                                        className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                        disabled={saving}
                                    >
                                        {ENTITY_TYPES.map((t) => (
                                            <option key={t.value} value={t.value}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-end gap-2">
                                    <label className="flex items-center gap-2 text-sm text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={createForm.active}
                                            onChange={onCreateChange("active")}
                                            disabled={saving}
                                        />
                                        Active
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-200 mb-1">
                                    Business logo
                                </label>
                                <div className="flex items-center gap-3">
                                    <label className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm px-3 py-2 cursor-pointer">
                                        <Upload className="h-4 w-4" />
                                        Upload
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => pickCreateLogo(e.target.files?.[0] || null)}
                                            disabled={saving}
                                        />
                                    </label>

                                    {createLogoPreviewUrl && (
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={createLogoPreviewUrl}
                                                alt="Logo preview"
                                                className="h-10 w-10 rounded-xl object-cover border border-slate-700"
                                            />
                                            <button
                                                type="button"
                                                className="text-xs text-slate-300 hover:text-white"
                                                onClick={() => pickCreateLogo(null)}
                                                disabled={saving}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-200 mb-1">
                                    Email signature (HTML)
                                </label>
                                <textarea
                                    value={createForm.email_signature_html}
                                    onChange={onCreateChange("email_signature_html")}
                                    rows={5}
                                    className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                    placeholder="<div>Kind regards,<br/>Team...</div>"
                                    disabled={saving}
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button className="bg-blue-600 hover:bg-blue-700" type="submit" disabled={saving}>
                                    {saving ? "Creating…" : "Create entity"}
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* LIST + EDIT */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-semibold">Existing entities</div>
                                <div className="text-xs text-slate-400 mt-1">
                                    Click edit to change details, signature, logo, or active status.
                                </div>
                            </div>

                            <Button
                                variant="secondary"
                                className="bg-slate-800 hover:bg-slate-700 text-white"
                                onClick={loadEntities}
                                disabled={loadingList || saving}
                            >
                                {loadingList ? "Refreshing…" : "Refresh"}
                            </Button>
                        </div>

                        {loadingList ? (
                            <div className="mt-4 text-sm text-slate-400">Loading…</div>
                        ) : entities.length ? (
                            <div className="mt-4 space-y-3">
                                {entities.map((e) => (
                                    <div key={e.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold truncate">{e.name || "Unnamed"}</div>
                                                <div className="mt-1 text-xs text-slate-400">
                                                    {e.type || "UNKNOWN"} - {e.active ? "Active" : "Inactive"}
                                                </div>
                                                <div className="mt-2 text-[11px] text-slate-500 break-all">
                                                    ID: {e.id}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="secondary"
                                                    className="bg-slate-800 hover:bg-slate-700 text-white"
                                                    onClick={() => quickToggleActive(e)}
                                                    disabled={saving}
                                                >
                                                    {e.active ? "Deactivate" : "Activate"}
                                                </Button>

                                                <Button
                                                    className="bg-blue-600 hover:bg-blue-700"
                                                    onClick={() => startEdit(e.id)}
                                                    disabled={saving}
                                                >
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    Edit
                                                </Button>
                                            </div>
                                        </div>

                                        {editingId === e.id && editForm && (
                                            <form onSubmit={saveEdit} className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-semibold text-sm">Edit entity</div>
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        className="bg-slate-800 hover:bg-slate-700 text-white"
                                                        onClick={cancelEdit}
                                                        disabled={saving}
                                                    >
                                                        <XCircle className="mr-2 h-4 w-4" />
                                                        Close
                                                    </Button>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-slate-200 mb-1">
                                                        Business name *
                                                    </label>
                                                    <input
                                                        value={editForm.name}
                                                        onChange={onEditChange("name")}
                                                        className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                                        disabled={saving}
                                                        required
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-200 mb-1">
                                                            Entity type *
                                                        </label>
                                                        <select
                                                            value={editForm.type}
                                                            onChange={onEditChange("type")}
                                                            className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                                            disabled={saving}
                                                        >
                                                            {ENTITY_TYPES.map((t) => (
                                                                <option key={t.value} value={t.value}>
                                                                    {t.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="flex items-end gap-2">
                                                        <label className="flex items-center gap-2 text-sm text-slate-200">
                                                            <input
                                                                type="checkbox"
                                                                checked={toBool(editForm.active)}
                                                                onChange={onEditChange("active")}
                                                                disabled={saving}
                                                            />
                                                            Active
                                                        </label>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-slate-200 mb-1">
                                                        Replace logo
                                                    </label>
                                                    <div className="flex items-center gap-3">
                                                        <label className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm px-3 py-2 cursor-pointer">
                                                            <Upload className="h-4 w-4" />
                                                            Upload
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={(ev) => pickEditLogo(ev.target.files?.[0] || null)}
                                                                disabled={saving}
                                                            />
                                                        </label>

                                                        {(editLogoPreviewUrl || editForm.logo_url) && (
                                                            <div className="flex items-center gap-3">
                                                                <img
                                                                    src={editLogoPreviewUrl || editForm.logo_url}
                                                                    alt="Logo"
                                                                    className="h-10 w-10 rounded-xl object-cover border border-slate-700"
                                                                />
                                                                {editLogoPreviewUrl && (
                                                                    <button
                                                                        type="button"
                                                                        className="text-xs text-slate-300 hover:text-white"
                                                                        onClick={() => pickEditLogo(null)}
                                                                        disabled={saving}
                                                                    >
                                                                        Remove new
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-slate-200 mb-1">
                                                        Email signature (HTML)
                                                    </label>
                                                    <textarea
                                                        value={editForm.email_signature_html}
                                                        onChange={onEditChange("email_signature_html")}
                                                        rows={5}
                                                        className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                                        disabled={saving}
                                                    />
                                                </div>

                                                <div className="flex gap-2">
                                                    <Button className="bg-blue-600 hover:bg-blue-700" type="submit" disabled={saving}>
                                                        <Save className="mr-2 h-4 w-4" />
                                                        {saving ? "Saving…" : "Save changes"}
                                                    </Button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-4 text-sm text-slate-400">No entities yet.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
