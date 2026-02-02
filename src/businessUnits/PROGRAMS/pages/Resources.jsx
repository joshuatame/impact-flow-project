import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
    FileUp,
    Link as LinkIcon,
    ExternalLink,
    Download,
    Search,
    Filter,
    X,
    PhoneCall,
    Plus,
} from "lucide-react";
import { uploadResourceFile } from "@/lib/firebaseUploadResources";

// Firestore fallback for create if base44 entity does not support create
import { db } from "@/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

const CATEGORIES = [
    "All",
    "Wellbeing",
    "Services",
    "Training",
    "Policies",
    "Forms",
    "Templates",
    "Community",
    "Other",
];

const RESOURCE_TYPES = ["All", "Link", "Phone", "File"];

function normalize(str) {
    return (str || "").toString().trim().toLowerCase();
}

function digitsOnly(str) {
    return (str || "").toString().replace(/[^\d+]/g, "");
}

function safeOpen(url) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
}

export default function Resources() {
    const queryClient = useQueryClient();

    const [user, setUser] = useState(null);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState("All");
    const [typeFilter, setTypeFilter] = useState("All");
    const [search, setSearch] = useState("");

    // Dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedResource, setSelectedResource] = useState(null);

    // Create form state
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [newCategory, setNewCategory] = useState("Wellbeing");
    const [newType, setNewType] = useState("Link"); // Link | Phone | File
    const [newUrl, setNewUrl] = useState("");
    const [newPhone, setNewPhone] = useState("");
    const [newFile, setNewFile] = useState(null);

    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const me = await base44.auth.me();
                setUser(me);
            } catch (e) {
                // ignore
            }
        })();
    }, []);

    // Role logic
    const viewAsRole =
        typeof window !== "undefined" ? user?.view_as_role || null : null;
    const effectiveRole = viewAsRole || user?.app_role;

    const canManageResources =
        effectiveRole === "SystemAdmin" ||
        effectiveRole === "Manager" ||
        effectiveRole === "ContractsAdmin";

    const resourcesQuery = useQuery({
        queryKey: ["resources"],
        queryFn: () => base44.entities.Resource.list("-created_date", 1000),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        placeholderData: () => queryClient.getQueryData(["resources"]) || [],
    });

    const resources = Array.isArray(resourcesQuery.data) ? resourcesQuery.data : [];
    const isFetching = resourcesQuery.isFetching;

    const filtered = useMemo(() => {
        const s = normalize(search);

        return resources.filter((r) => {
            const catOk = categoryFilter === "All" ? true : r.category === categoryFilter;

            const typeOk =
                typeFilter === "All"
                    ? true
                    : typeFilter === "Link"
                        ? r.resource_type === "Link"
                        : typeFilter === "Phone"
                            ? r.resource_type === "Phone"
                            : r.resource_type === "File";

            if (!catOk || !typeOk) return false;

            if (!s) return true;

            const haystack = normalize(
                [
                    r.title,
                    r.description,
                    r.category,
                    r.resource_type,
                    r.url,
                    r.phone,
                    r.file_name,
                    Array.isArray(r.tags) ? r.tags.join(" ") : "",
                ].join(" ")
            );

            return haystack.includes(s);
        });
    }, [resources, categoryFilter, typeFilter, search]);

    const clearCreateForm = () => {
        setNewTitle("");
        setNewDescription("");
        setNewCategory("Wellbeing");
        setNewType("Link");
        setNewUrl("");
        setNewPhone("");
        setNewFile(null);
        setError("");
    };

    const validateCreate = () => {
        if (!newTitle.trim()) return "Title is required.";
        if (!newCategory) return "Category is required.";

        if (newType === "Link") {
            if (!newUrl.trim()) return "Link URL is required.";
            try {
                // eslint-disable-next-line no-new
                new URL(newUrl.trim());
            } catch {
                return "Please enter a valid URL (including https://).";
            }
        }

        if (newType === "Phone") {
            const cleaned = digitsOnly(newPhone);
            if (!cleaned) return "Phone number is required.";
            if (cleaned.replace(/[^\d]/g, "").length < 6) return "Phone number looks too short.";
        }

        if (newType === "File") {
            if (!newFile) return "Please choose a file to upload.";
        }

        return "";
    };

    const createViaBase44OrFirestore = async (payload) => {
        // Prefer base44 if the method exists
        const createFn = base44?.entities?.Resource?.create;

        if (typeof createFn === "function") {
            return await createFn(payload);
        }

        // Firestore fallback - prevents the "undefined create" crash
        // Writes into the "Resource" collection. Adjust name if your collection is different.
        return await addDoc(collection(db, "Resource"), {
            ...payload,
            created_date: payload.created_date || new Date().toISOString(),
            _createdAt: serverTimestamp(),
        });
    };

    const handleCreate = async () => {
        setError("");
        const msg = validateCreate();
        if (msg) {
            setError(msg);
            return;
        }

        setIsCreating(true);
        try {
            let file_url = "";
            let file_name = "";

            if (newType === "File" && newFile) {
                const { downloadUrl, fileName } = await uploadResourceFile(newFile, {
                    folder: "resources",
                });
                file_url = downloadUrl;
                file_name = fileName || newFile.name || "";
            }

            const payload = {
                title: newTitle.trim(),
                description: newDescription.trim(),
                category: newCategory,
                resource_type: newType, // "Link" | "Phone" | "File"
                url: newType === "Link" ? newUrl.trim() : "",
                phone: newType === "Phone" ? newPhone.trim() : "",
                file_url,
                file_name,
                created_by_id: user?.id || "",
                created_by_name: user?.full_name || "",
                created_date: new Date().toISOString(),
            };

            await createViaBase44OrFirestore(payload);

            await queryClient.invalidateQueries({ queryKey: ["resources"] });

            setCreateOpen(false);
            clearCreateForm();
        } catch (e) {
            setError(e?.message || "Failed to create resource.");
        } finally {
            setIsCreating(false);
        }
    };

    const openDetails = (r) => {
        setSelectedResource(r);
        setDetailsOpen(true);
    };

    const openResource = (r) => {
        if (!r) return;

        if (r.resource_type === "File") {
            safeOpen(r.file_url);
            return;
        }

        if (r.resource_type === "Link") {
            safeOpen(r.url);
            return;
        }

        if (r.resource_type === "Phone") {
            const tel = digitsOnly(r.phone);
            if (!tel) return;
            window.location.href = `tel:${tel}`;
        }
    };

    const primaryValue = (r) => {
        if (!r) return "";
        if (r.resource_type === "File") return r.file_name || "";
        if (r.resource_type === "Phone") return r.phone || "";
        return r.url || "";
    };

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <PageHeader
                    title="Resources and Helpful Links"
                    subtitle="Curated links, phone contacts, templates, and shared files"
                />
                <div className="flex items-center gap-3">
                    {isFetching ? (
                        <Badge className="bg-slate-700/50 text-slate-300">Syncing...</Badge>
                    ) : null}

                    {canManageResources ? (
                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => setCreateOpen(true)}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Resource
                        </Button>
                    ) : null}
                </div>
            </div>

            {/* Filters (filter the list total) */}
            <div className="mt-6 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-4 md:p-5">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex items-center gap-2 text-slate-300">
                            <Filter className="h-4 w-4" />
                            <span className="text-sm font-medium">Filters</span>
                        </div>

                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="w-48 bg-slate-900/50 border-slate-800 text-white">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {CATEGORIES.map((c) => (
                                    <SelectItem key={c} value={c} className="text-white">
                                        {c}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-40 bg-slate-900/50 border-slate-800 text-white">
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {RESOURCE_TYPES.map((t) => (
                                    <SelectItem key={t} value={t} className="text-white">
                                        {t}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="relative w-full sm:w-80">
                            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search title, description, URL, phone..."
                                className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                            />
                            {!!search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-slate-800/60 text-slate-400 hover:text-white"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="text-sm text-slate-400">
                        Showing <span className="text-white font-medium">{filtered.length}</span>{" "}
                        of <span className="text-white font-medium">{resources.length}</span>{" "}
                        resource{resources.length === 1 ? "" : "s"}
                    </div>
                </div>
            </div>

            {/* Resource List FIRST */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filtered.map((r) => {
                    const isFile = r.resource_type === "File";
                    const isPhone = r.resource_type === "Phone";

                    return (
                        <button
                            key={r.id}
                            type="button"
                            onClick={() => openDetails(r)}
                            className="text-left bg-slate-900/50 border border-slate-800/50 rounded-2xl p-5 hover:bg-slate-900/60 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <Badge className="bg-slate-700/50 text-slate-300">
                                            {r.category || "Other"}
                                        </Badge>

                                        <Badge
                                            className="bg-slate-700/50 text-slate-300"
                                            style={{
                                                backgroundColor: isFile
                                                    ? "rgba(59,130,246,0.15)"
                                                    : isPhone
                                                        ? "rgba(245,158,11,0.15)"
                                                        : "rgba(16,185,129,0.15)",
                                                color: isFile ? "#60a5fa" : isPhone ? "#fbbf24" : "#34d399",
                                            }}
                                        >
                                            {r.resource_type || "Link"}
                                        </Badge>
                                    </div>

                                    <h4 className="text-white font-semibold text-base truncate">{r.title}</h4>

                                    {r.description ? (
                                        <p className="text-sm text-slate-400 mt-2 line-clamp-2">{r.description}</p>
                                    ) : (
                                        <p className="text-sm text-slate-500 mt-2">No description provided</p>
                                    )}

                                    <div className="mt-3 text-xs text-slate-500">
                                        {r.created_by_name ? (
                                            <span>
                                                Added by <span className="text-slate-300">{r.created_by_name}</span>
                                            </span>
                                        ) : (
                                            <span>Added</span>
                                        )}
                                        {r.created_date ? <span> - {new Date(r.created_date).toLocaleDateString()}</span> : null}
                                    </div>
                                </div>

                                <div className="shrink-0">
                                    <div className="text-xs text-slate-500">
                                        {primaryValue(r) ? (
                                            <span className="break-all">{primaryValue(r)}</span>
                                        ) : (
                                            <span className="text-slate-600">No link/phone/file</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-10 text-center text-slate-500 lg:col-span-2">
                        No resources match your filters.
                    </div>
                )}
            </div>

            {/* Create Dialog */}
            <Dialog open={createOpen} onOpenChange={(open) => {
                setCreateOpen(open);
                if (!open) {
                    setError("");
                    // keep form values if you prefer; otherwise clear:
                    // clearCreateForm();
                }
            }}>
                <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add Resource</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
                        <div>
                            <label className="text-sm text-slate-400">Title</label>
                            <input
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                                placeholder="e.g., Lifeline - Crisis Support"
                            />
                        </div>

                        <div>
                            <label className="text-sm text-slate-400">Category</label>
                            <div className="mt-1">
                                <Select value={newCategory} onValueChange={setNewCategory}>
                                    <SelectTrigger className="w-full bg-slate-900/50 border-slate-800 text-white">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                        {CATEGORIES.filter((c) => c !== "All").map((c) => (
                                            <SelectItem key={c} value={c} className="text-white">
                                                {c}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm text-slate-400">Type</label>
                            <div className="mt-1">
                                <Select
                                    value={newType}
                                    onValueChange={(val) => {
                                        setNewType(val);
                                        setError("");
                                        if (val !== "Link") setNewUrl("");
                                        if (val !== "Phone") setNewPhone("");
                                        if (val !== "File") setNewFile(null);
                                    }}
                                >
                                    <SelectTrigger className="w-full bg-slate-900/50 border-slate-800 text-white">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800">
                                        <SelectItem value="Link" className="text-white">Link</SelectItem>
                                        <SelectItem value="Phone" className="text-white">Phone</SelectItem>
                                        <SelectItem value="File" className="text-white">File</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            {newType === "Link" ? (
                                <>
                                    <label className="text-sm text-slate-400">URL</label>
                                    <input
                                        value={newUrl}
                                        onChange={(e) => setNewUrl(e.target.value)}
                                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                                        placeholder="https://"
                                    />
                                </>
                            ) : newType === "Phone" ? (
                                <>
                                    <label className="text-sm text-slate-400">Phone number</label>
                                    <input
                                        value={newPhone}
                                        onChange={(e) => setNewPhone(e.target.value)}
                                        className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                                        placeholder="e.g., 13 11 14"
                                        inputMode="tel"
                                    />
                                    <div className="mt-2 text-xs text-slate-500">
                                        You can paste any format. We will dial a cleaned number.
                                    </div>
                                </>
                            ) : (
                                <>
                                    <label className="text-sm text-slate-400">Upload file</label>
                                    <div className="mt-1 flex items-center gap-3">
                                        <input
                                            type="file"
                                            onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                                            className="w-full text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800/70 file:px-3 file:py-2 file:text-slate-200 hover:file:bg-slate-800"
                                        />
                                    </div>
                                    {newFile?.name && (
                                        <div className="mt-2 text-xs text-slate-400">
                                            Selected: <span className="text-slate-200">{newFile.name}</span>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="lg:col-span-2">
                            <label className="text-sm text-slate-400">Description (optional)</label>
                            <textarea
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                className="mt-1 w-full min-h-[90px] px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
                                placeholder="What is this resource, who is it for, and when should it be used?"
                            />
                        </div>
                    </div>

                    {!!error && <div className="mt-3 text-sm text-red-400">{error}</div>}

                    <div className="mt-5 flex flex-wrap gap-3 justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                setCreateOpen(false);
                            }}
                            className="text-slate-300 hover:text-white"
                        >
                            Cancel
                        </Button>

                        <Button
                            onClick={handleCreate}
                            disabled={isCreating}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {newType === "File" ? (
                                <>
                                    <FileUp className="h-4 w-4 mr-2" />
                                    {isCreating ? "Uploading..." : "Upload and Save"}
                                </>
                            ) : newType === "Phone" ? (
                                <>
                                    <PhoneCall className="h-4 w-4 mr-2" />
                                    {isCreating ? "Saving..." : "Save Phone"}
                                </>
                            ) : (
                                <>
                                    <LinkIcon className="h-4 w-4 mr-2" />
                                    {isCreating ? "Saving..." : "Save Link"}
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Details Dialog */}
            <Dialog open={detailsOpen} onOpenChange={(open) => {
                setDetailsOpen(open);
                if (!open) setSelectedResource(null);
            }}>
                <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{selectedResource?.title || "Resource"}</DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-wrap gap-2 mt-1">
                        {selectedResource?.category ? (
                            <Badge className="bg-slate-700/50 text-slate-300">{selectedResource.category}</Badge>
                        ) : null}
                        {selectedResource?.resource_type ? (
                            <Badge className="bg-slate-700/50 text-slate-300">{selectedResource.resource_type}</Badge>
                        ) : null}
                    </div>

                    <div className="mt-4 text-sm text-slate-300">
                        {selectedResource?.description ? selectedResource.description : "No description provided."}
                    </div>

                    <Separator className="my-4 bg-slate-800" />

                    <div className="space-y-3 text-sm">
                        {selectedResource?.resource_type === "Link" && (
                            <div className="break-all">
                                <div className="text-slate-400">URL</div>
                                <div className="text-slate-200">{selectedResource?.url || ""}</div>
                            </div>
                        )}

                        {selectedResource?.resource_type === "Phone" && (
                            <div className="break-all">
                                <div className="text-slate-400">Phone</div>
                                <div className="text-slate-200">{selectedResource?.phone || ""}</div>
                            </div>
                        )}

                        {selectedResource?.resource_type === "File" && (
                            <div className="break-all">
                                <div className="text-slate-400">File</div>
                                <div className="text-slate-200">{selectedResource?.file_name || "download"}</div>
                            </div>
                        )}

                        <div className="text-xs text-slate-500">
                            {selectedResource?.created_by_name ? (
                                <span>
                                    Added by <span className="text-slate-300">{selectedResource.created_by_name}</span>
                                </span>
                            ) : (
                                <span>Added</span>
                            )}
                            {selectedResource?.created_date ? (
                                <span> - {new Date(selectedResource.created_date).toLocaleString()}</span>
                            ) : null}
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3 justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setDetailsOpen(false)}
                            className="text-slate-300 hover:text-white"
                        >
                            Close
                        </Button>

                        <Button
                            onClick={() => openResource(selectedResource)}
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={
                                !selectedResource ||
                                (selectedResource.resource_type === "Link" && !selectedResource.url) ||
                                (selectedResource.resource_type === "File" && !selectedResource.file_url) ||
                                (selectedResource.resource_type === "Phone" && !digitsOnly(selectedResource.phone))
                            }
                        >
                            {selectedResource?.resource_type === "Phone" ? (
                                <>
                                    <PhoneCall className="h-4 w-4 mr-2" />
                                    Call
                                </>
                            ) : selectedResource?.resource_type === "File" ? (
                                <>
                                    <Download className="h-4 w-4 mr-2" />
                                    Open File
                                </>
                            ) : (
                                <>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open Link
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
