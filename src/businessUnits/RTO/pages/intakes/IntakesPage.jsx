// File: src/businessUnits/RTO/pages/intakes/IntakesPage.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    collection,
    addDoc,
    doc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    getDocs,
} from "firebase/firestore";

import { db, auth } from "@/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import PageHeader from "@/components/ui/PageHeader.jsx";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, X, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getActiveEntity } from "@/lib/activeEntity";

function nowUserId() {
    return auth?.currentUser?.uid || null;
}

/**
 * Dates in UI are stored as YYYY-MM-DD strings.
 * Convert to ms on save.
 */
function pad2(n) {
    return String(n).padStart(2, "0");
}
function dateToYmd(d) {
    if (!d) return "";
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function ymdToDate(ymd) {
    if (!ymd) return null;
    const [y, m, d] = String(ymd).split("-").map((v) => parseInt(v, 10));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
}
function ymdToMs(ymd) {
    const dt = ymdToDate(ymd);
    return dt ? dt.getTime() : null;
}
function normalizeStoredDateToYmd(v) {
    if (!v) return "";
    if (typeof v === "object" && typeof v.toDate === "function") return dateToYmd(v.toDate());
    if (typeof v === "number") return dateToYmd(new Date(v));
    if (typeof v === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const dt = new Date(v);
        return Number.isNaN(dt.getTime()) ? "" : dateToYmd(dt);
    }
    if (v instanceof Date) return dateToYmd(v);
    return "";
}

function validateCourse(payload) {
    const errors = [];
    if (!payload?.code) errors.push("Course code is required.");
    if (!payload?.name) errors.push("Course name is required.");
    return errors;
}

function validateIntake(payload) {
    const errors = [];
    if (!payload?.courseId && !payload?.course?.code) errors.push("Course is required.");
    if (!payload?.dates?.startAt) errors.push("Start date is required.");
    if (!payload?.dates?.endAt) errors.push("End date is required.");
    if (payload?.pricing?.amount === "" || payload?.pricing?.amount === null || payload?.pricing?.amount === undefined)
        errors.push("Price is required.");
    if (payload?.capacity === "" || payload?.capacity === null || payload?.capacity === undefined)
        errors.push("Capacity is required.");
    return errors;
}

/**
 * Date picker with fixed-size calendar + manual input.
 */
function DatePickerField({ label, value, onChange, placeholder = "Select date" }) {
    const selected = useMemo(() => ymdToDate(value), [value]);

    const display = useMemo(() => {
        if (!selected) return placeholder;
        try {
            return format(selected, "dd MMM yyyy");
        } catch {
            return placeholder;
        }
    }, [selected, placeholder]);

    return (
        <div className="space-y-1">
            <div className="text-xs font-medium">{label}</div>

            <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className={cn(
                                    "w-full justify-start border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800",
                                    !value && "text-slate-400"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {display}
                            </Button>
                        </PopoverTrigger>

                        <PopoverContent
                            className="p-2 bg-slate-900 border-slate-800"
                            align="start"
                            style={{ width: 320 }}
                        >
                            <div className="w-[300px]">
                                <Calendar
                                    mode="single"
                                    selected={selected || undefined}
                                    onSelect={(d) => onChange(d ? dateToYmd(d) : "")}
                                    initialFocus
                                    className="w-[300px]"
                                />
                            </div>
                        </PopoverContent>
                    </Popover>

                    <Button
                        type="button"
                        variant="outline"
                        className="border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                        onClick={() => onChange("")}
                        title="Clear date"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <Input
                    type="date"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    className="border-slate-700 bg-slate-900/40 text-slate-200"
                />
            </div>
        </div>
    );
}

export default function IntakesPage() {
    const qc = useQueryClient();
    const activeEntity = getActiveEntity();
    const entityId = activeEntity?.id;

    const [viewMode, setViewMode] = useState("INTAKES"); // INTAKES | COURSES

    const [search, setSearch] = useState("");
    const [stateFilter, setStateFilter] = useState("OPEN");

    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [formError, setFormError] = useState("");

    const [courseEditorOpen, setCourseEditorOpen] = useState(false);
    const [courseEditing, setCourseEditing] = useState(null);
    const [courseError, setCourseError] = useState("");

    const coursesQuery = useQuery({
        queryKey: ["rto-courses", entityId],
        enabled: !!entityId,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoCourses"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO")
            );
            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => {
                const au = a?.updatedAt?.toMillis?.() || a?.updatedAt || a?.createdAt?.toMillis?.() || a?.createdAt || 0;
                const bu = b?.updatedAt?.toMillis?.() || b?.updatedAt || b?.createdAt?.toMillis?.() || b?.createdAt || 0;
                return bu - au;
            });
            return rows;
        },
    });

    const intakesQuery = useQuery({
        queryKey: ["rto-intakes", entityId, stateFilter],
        enabled: !!entityId,
        queryFn: async () => {
            const qRef = query(
                collection(db, "RtoCourseIntakes"),
                where("entityId", "==", entityId),
                where("businessUnit", "==", "RTO"),
                where("state", "==", stateFilter)
            );
            const snap = await getDocs(qRef);
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => {
                const au = a?.updatedAt?.toMillis?.() || a?.updatedAt || a?.createdAt?.toMillis?.() || a?.createdAt || 0;
                const bu = b?.updatedAt?.toMillis?.() || b?.updatedAt || b?.createdAt?.toMillis?.() || b?.createdAt || 0;
                return bu - au;
            });
            return rows;
        },
    });

    const filteredIntakes = useMemo(() => {
        const list = intakesQuery.data || [];
        const s = String(search || "").trim().toLowerCase();
        if (!s) return list;
        return list.filter((x) => {
            const hay = [
                x?.course?.name,
                x?.course?.code,
                x?.course?.location,
                x?.courseId,
                ...(x?.tags || []),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(s);
        });
    }, [intakesQuery.data, search]);

    const filteredCourses = useMemo(() => {
        const list = coursesQuery.data || [];
        const s = String(search || "").trim().toLowerCase();
        if (!s) return list;
        return list.filter((x) => {
            const hay = [x?.name, x?.code, x?.location, ...(x?.tags || [])]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(s);
        });
    }, [coursesQuery.data, search]);

    const saveCourseMutation = useMutation({
        mutationFn: async ({ id, payload }) => {
            const uid = nowUserId();
            if (!uid) throw new Error("Not authenticated.");
            if (!entityId) throw new Error("Missing entityId.");

            const errs = validateCourse(payload);
            if (errs.length) throw new Error(errs.join(" "));

            if (id) {
                await updateDoc(doc(db, "RtoCourses", id), {
                    ...payload,
                    updatedAt: serverTimestamp(),
                    updatedBy: uid,
                });
                return id;
            }

            const ref = await addDoc(collection(db, "RtoCourses"), {
                ...payload,
                entityId,
                businessUnit: "RTO",
                createdAt: serverTimestamp(),
                createdBy: uid,
                updatedAt: serverTimestamp(),
                updatedBy: uid,
            });
            return ref.id;
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["rto-courses", entityId] });
            setCourseEditorOpen(false);
            setCourseEditing(null);
            setCourseError("");
        },
        onError: (e) => setCourseError(e?.message || "Failed to save course."),
    });

    const saveIntakeMutation = useMutation({
        mutationFn: async ({ id, payload }) => {
            const uid = nowUserId();
            if (!uid) throw new Error("Not authenticated.");
            if (!entityId) throw new Error("Missing entityId.");

            const errs = validateIntake(payload);
            if (errs.length) throw new Error(errs.join(" "));

            if (id) {
                await updateDoc(doc(db, "RtoCourseIntakes", id), {
                    ...payload,
                    updatedAt: serverTimestamp(),
                    updatedBy: uid,
                });
                return id;
            }

            const ref = await addDoc(collection(db, "RtoCourseIntakes"), {
                ...payload,
                entityId,
                businessUnit: "RTO",
                state: payload.state || "OPEN",
                createdAt: serverTimestamp(),
                createdBy: uid,
                updatedAt: serverTimestamp(),
                updatedBy: uid,
            });
            return ref.id;
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["rto-intakes", entityId, stateFilter] });
            setEditorOpen(false);
            setEditing(null);
            setFormError("");
        },
        onError: (e) => setFormError(e?.message || "Failed to save intake."),
    });

    const openCreateCourse = useCallback(() => {
        setCourseEditing({
            code: "",
            name: "",
            deliveryMode: "Classroom",
            location: "",
            tags: [],
            notes: "",
        });
        setCourseError("");
        setCourseEditorOpen(true);
    }, []);

    const openEditCourse = useCallback((row) => {
        setCourseEditing({
            ...row,
            tags: row.tags || [],
        });
        setCourseError("");
        setCourseEditorOpen(true);
    }, []);

    const openCreateIntake = useCallback(() => {
        setEditing({
            courseId: "",
            course: { code: "", name: "", deliveryMode: "Classroom", location: "" }, // fallback/backward compatible
            capacity: 25,
            pricing: { amount: 0, currency: "AUD", gstIncluded: true, paymentOptions: ["Upfront"] },
            dates: { enrolmentOpenAt: "", enrolmentCloseAt: "", startAt: "", endAt: "" },
            eligibility: { notes: "", fundingStreams: [] },
            state: "OPEN",
            tags: [],
        });
        setFormError("");
        setEditorOpen(true);
    }, []);

    const openEditIntake = useCallback((row) => {
        const dates = row.dates || {};
        setEditing({
            ...row,
            courseId: row.courseId || "",
            course: row.course || { code: "", name: "", deliveryMode: "Classroom", location: "" },
            pricing: row.pricing || { amount: 0, currency: "AUD", gstIncluded: true, paymentOptions: ["Upfront"] },
            dates: {
                enrolmentOpenAt: normalizeStoredDateToYmd(dates.enrolmentOpenAt),
                enrolmentCloseAt: normalizeStoredDateToYmd(dates.enrolmentCloseAt),
                startAt: normalizeStoredDateToYmd(dates.startAt),
                endAt: normalizeStoredDateToYmd(dates.endAt),
            },
            eligibility: row.eligibility || { notes: "", fundingStreams: [] },
            tags: row.tags || [],
        });
        setFormError("");
        setEditorOpen(true);
    }, []);

    function updateEditingField(path, value) {
        setEditing((prev) => {
            const next = { ...(prev || {}) };
            const parts = path.split(".");
            let cur = next;
            for (let i = 0; i < parts.length - 1; i++) {
                const k = parts[i];
                cur[k] = cur[k] && typeof cur[k] === "object" ? { ...cur[k] } : {};
                cur = cur[k];
            }
            cur[parts[parts.length - 1]] = value;
            return next;
        });
    }

    function updateCourseField(path, value) {
        setCourseEditing((prev) => {
            const next = { ...(prev || {}) };
            const parts = path.split(".");
            let cur = next;
            for (let i = 0; i < parts.length - 1; i++) {
                const k = parts[i];
                cur[k] = cur[k] && typeof cur[k] === "object" ? { ...cur[k] } : {};
                cur = cur[k];
            }
            cur[parts[parts.length - 1]] = value;
            return next;
        });
    }

    function saveCourse() {
        if (!courseEditing) return;
        const payload = {
            code: String(courseEditing.code || "").trim(),
            name: String(courseEditing.name || "").trim(),
            deliveryMode: courseEditing.deliveryMode || "Classroom",
            location: String(courseEditing.location || "").trim(),
            tags: Array.isArray(courseEditing.tags) ? courseEditing.tags : [],
            notes: String(courseEditing.notes || "").trim(),
        };
        saveCourseMutation.mutate({ id: courseEditing.id || null, payload });
    }

    function saveIntake() {
        if (!editing) return;

        const payload = { ...editing };
        payload.capacity = Number(payload.capacity || 0);
        payload.pricing = { ...payload.pricing, amount: Number(payload.pricing?.amount || 0) };

        // If courseId selected, also snapshot the course fields for display stability
        if (payload.courseId) {
            const c = (coursesQuery.data || []).find((x) => x.id === payload.courseId);
            if (c) {
                payload.course = {
                    code: c.code || "",
                    name: c.name || "",
                    deliveryMode: c.deliveryMode || "Classroom",
                    location: c.location || "",
                };
            }
        } else {
            payload.course = payload.course || { code: "", name: "", deliveryMode: "Classroom", location: "" };
        }

        const d = payload.dates || {};
        payload.dates = {
            enrolmentOpenAt: d.enrolmentOpenAt ? ymdToMs(d.enrolmentOpenAt) : null,
            enrolmentCloseAt: d.enrolmentCloseAt ? ymdToMs(d.enrolmentCloseAt) : null,
            startAt: d.startAt ? ymdToMs(d.startAt) : null,
            endAt: d.endAt ? ymdToMs(d.endAt) : null,
        };

        saveIntakeMutation.mutate({ id: editing.id || null, payload });
    }

    // Ensure view mode is stable (default to intakes)
    useEffect(() => {
        if (viewMode !== "INTAKES" && viewMode !== "COURSES") setViewMode("INTAKES");
    }, [viewMode]);

    if (!entityId) {
        return (
            <div className="p-6">
                <PageHeader title="RTO Courses and Intakes" subtitle="Select a business entity to manage courses and intakes." />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <PageHeader
                title="RTO Courses and Intakes"
                subtitle="Courses are reusable. Intakes are scheduled delivery windows used by campaigns and enquiries."
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by code, name, location, tags"
                        className="sm:w-[420px]"
                    />

                    <Select value={viewMode} onValueChange={setViewMode}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="View" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="INTAKES">INTAKES</SelectItem>
                            <SelectItem value="COURSES">COURSES</SelectItem>
                        </SelectContent>
                    </Select>

                    {viewMode === "INTAKES" ? (
                        <Select value={stateFilter} onValueChange={setStateFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="State" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="OPEN">OPEN</SelectItem>
                                <SelectItem value="CLOSED">CLOSED</SelectItem>
                                <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : null}
                </div>

                {viewMode === "COURSES" ? (
                    <Button onClick={openCreateCourse}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Course
                    </Button>
                ) : (
                    <Button onClick={openCreateIntake}>New Intake</Button>
                )}
            </div>

            {/* COURSES LIST */}
            {viewMode === "COURSES" ? (
                coursesQuery.isLoading ? (
                    <div className="py-10"><LoadingSpinner /></div>
                ) : coursesQuery.isError ? (
                    <div className="p-4 rounded border text-sm">
                        Failed to load courses: {String(coursesQuery.error?.message || coursesQuery.error || "")}
                    </div>
                ) : (
                    <div className="border rounded overflow-hidden">
                        <div className="grid grid-cols-12 bg-muted/50 px-3 py-2 text-xs font-medium">
                            <div className="col-span-4">Code</div>
                            <div className="col-span-5">Name</div>
                            <div className="col-span-3">Location</div>
                        </div>

                        {filteredCourses.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No courses found.</div>
                        ) : (
                            filteredCourses.map((row) => (
                                <button
                                    key={row.id}
                                    className="grid grid-cols-12 px-3 py-3 text-left border-t hover:bg-muted/30"
                                    onClick={() => openEditCourse(row)}
                                    type="button"
                                >
                                    <div className="col-span-4 font-mono text-sm">{row.code || "-"}</div>
                                    <div className="col-span-5">
                                        <div className="font-medium">{row.name || "Untitled"}</div>
                                        <div className="text-xs text-muted-foreground">{row.deliveryMode || ""}</div>
                                    </div>
                                    <div className="col-span-3 text-sm">{row.location || "-"}</div>
                                </button>
                            ))
                        )}
                    </div>
                )
            ) : null}

            {/* INTAKES LIST */}
            {viewMode === "INTAKES" ? (
                intakesQuery.isLoading ? (
                    <div className="py-10"><LoadingSpinner /></div>
                ) : intakesQuery.isError ? (
                    <div className="p-4 rounded border text-sm">
                        Failed to load intakes: {String(intakesQuery.error?.message || intakesQuery.error || "")}
                    </div>
                ) : (
                    <div className="border rounded overflow-hidden">
                        <div className="grid grid-cols-12 bg-muted/50 px-3 py-2 text-xs font-medium">
                            <div className="col-span-5">Course</div>
                            <div className="col-span-2">Start</div>
                            <div className="col-span-2">End</div>
                            <div className="col-span-1">Cap</div>
                            <div className="col-span-1">Price</div>
                            <div className="col-span-1">State</div>
                        </div>

                        {filteredIntakes.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No intakes found.</div>
                        ) : (
                            filteredIntakes.map((row) => {
                                const startYmd = normalizeStoredDateToYmd(row?.dates?.startAt);
                                const endYmd = normalizeStoredDateToYmd(row?.dates?.endAt);

                                return (
                                    <button
                                        key={row.id}
                                        className="grid grid-cols-12 px-3 py-3 text-left border-t hover:bg-muted/30"
                                        onClick={() => openEditIntake(row)}
                                        type="button"
                                    >
                                        <div className="col-span-5">
                                            <div className="font-medium">{row?.course?.name || "Untitled"}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {row?.course?.code || ""}{" "}
                                                {row?.course?.location ? `- ${row.course.location}` : ""}
                                            </div>
                                        </div>
                                        <div className="col-span-2 text-sm">{startYmd || "-"}</div>
                                        <div className="col-span-2 text-sm">{endYmd || "-"}</div>
                                        <div className="col-span-1 text-sm">{row?.capacity ?? "-"}</div>
                                        <div className="col-span-1 text-sm">${Number(row?.pricing?.amount || 0).toFixed(0)}</div>
                                        <div className="col-span-1">
                                            <Badge variant={row.state === "OPEN" ? "default" : "secondary"}>{row.state}</Badge>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )
            ) : null}

            {/* COURSE EDITOR */}
            {courseEditorOpen && courseEditing ? (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-lg w-full max-w-2xl border">
                        <div className="p-4 border-b flex items-center justify-between">
                            <div className="font-semibold">{courseEditing.id ? "Edit Course" : "New Course"}</div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setCourseEditorOpen(false)}>Close</Button>
                                <Button onClick={saveCourse} disabled={saveCourseMutation.isPending}>
                                    {saveCourseMutation.isPending ? "Saving..." : "Save"}
                                </Button>
                            </div>
                        </div>

                        <div className="p-4 space-y-4">
                            {courseError ? <div className="p-3 border rounded text-sm text-red-600">{courseError}</div> : null}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <div className="text-xs font-medium mb-1">Course code</div>
                                    <Input value={courseEditing.code || ""} onChange={(e) => updateCourseField("code", e.target.value)} />
                                </div>
                                <div>
                                    <div className="text-xs font-medium mb-1">Course name</div>
                                    <Input value={courseEditing.name || ""} onChange={(e) => updateCourseField("name", e.target.value)} />
                                </div>

                                <div>
                                    <div className="text-xs font-medium mb-1">Delivery mode</div>
                                    <Select value={courseEditing.deliveryMode || "Classroom"} onValueChange={(v) => updateCourseField("deliveryMode", v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Classroom">Classroom</SelectItem>
                                            <SelectItem value="Online">Online</SelectItem>
                                            <SelectItem value="Blended">Blended</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <div className="text-xs font-medium mb-1">Default location</div>
                                    <Input value={courseEditing.location || ""} onChange={(e) => updateCourseField("location", e.target.value)} />
                                </div>

                                <div className="sm:col-span-2">
                                    <div className="text-xs font-medium mb-1">Tags (comma separated)</div>
                                    <Input
                                        value={(courseEditing.tags || []).join(", ")}
                                        onChange={(e) => updateCourseField("tags", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <div className="text-xs font-medium mb-1">Notes</div>
                                    <Input value={courseEditing.notes || ""} onChange={(e) => updateCourseField("notes", e.target.value)} />
                                </div>
                            </div>

                            <div className="text-xs text-muted-foreground">
                                Courses are reusable definitions. Intakes reference courses and set dates, pricing, and capacity.
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* INTAKE EDITOR */}
            {editorOpen && editing ? (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-background rounded-lg shadow-lg w-full max-w-3xl border">
                        <div className="p-4 border-b flex items-center justify-between">
                            <div className="font-semibold">{editing.id ? "Edit Intake" : "New Intake"}</div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setEditorOpen(false)}>Close</Button>
                                <Button onClick={saveIntake} disabled={saveIntakeMutation.isPending}>
                                    {saveIntakeMutation.isPending ? "Saving..." : "Save"}
                                </Button>
                            </div>
                        </div>

                        <div className="p-4 space-y-4">
                            {formError ? <div className="p-3 border rounded text-sm text-red-600">{formError}</div> : null}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                    <div className="text-xs font-medium mb-1">Course</div>
                                    {coursesQuery.isLoading ? (
                                        <div className="text-sm text-muted-foreground">Loading courses...</div>
                                    ) : (
                                        <Select
                                            value={editing.courseId || ""}
                                            onValueChange={(v) => {
                                                updateEditingField("courseId", v);
                                                const c = (coursesQuery.data || []).find((x) => x.id === v);
                                                if (c) {
                                                    updateEditingField("course", {
                                                        code: c.code || "",
                                                        name: c.name || "",
                                                        deliveryMode: c.deliveryMode || "Classroom",
                                                        location: c.location || "",
                                                    });
                                                }
                                            }}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                                            <SelectContent>
                                                {(coursesQuery.data || []).map((c) => (
                                                    <SelectItem key={c.id} value={c.id}>
                                                        {c.code} - {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                    <div className="mt-2 flex gap-2">
                                        <Button type="button" variant="outline" onClick={openCreateCourse}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Course
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs font-medium mb-1">Capacity</div>
                                    <Input
                                        type="number"
                                        value={editing.capacity ?? 0}
                                        onChange={(e) => updateEditingField("capacity", e.target.value)}
                                    />
                                </div>

                                <div>
                                    <div className="text-xs font-medium mb-1">Price (AUD)</div>
                                    <Input
                                        type="number"
                                        value={editing.pricing?.amount ?? 0}
                                        onChange={(e) => updateEditingField("pricing.amount", e.target.value)}
                                    />
                                </div>

                                <DatePickerField
                                    label="Enrolment opens"
                                    value={editing.dates?.enrolmentOpenAt || ""}
                                    onChange={(v) => updateEditingField("dates.enrolmentOpenAt", v)}
                                />

                                <DatePickerField
                                    label="Enrolment closes"
                                    value={editing.dates?.enrolmentCloseAt || ""}
                                    onChange={(v) => updateEditingField("dates.enrolmentCloseAt", v)}
                                />

                                <DatePickerField
                                    label="Start date"
                                    value={editing.dates?.startAt || ""}
                                    onChange={(v) => updateEditingField("dates.startAt", v)}
                                />

                                <DatePickerField
                                    label="End date"
                                    value={editing.dates?.endAt || ""}
                                    onChange={(v) => updateEditingField("dates.endAt", v)}
                                />

                                <div>
                                    <div className="text-xs font-medium mb-1">State</div>
                                    <Select value={editing.state || "OPEN"} onValueChange={(v) => updateEditingField("state", v)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="OPEN">OPEN</SelectItem>
                                            <SelectItem value="CLOSED">CLOSED</SelectItem>
                                            <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <div className="text-xs font-medium mb-1">Tags (comma separated)</div>
                                    <Input
                                        value={(editing.tags || []).join(", ")}
                                        onChange={(e) => updateEditingField("tags", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-medium mb-1">Eligibility notes</div>
                                <Input
                                    value={editing.eligibility?.notes || ""}
                                    onChange={(e) => updateEditingField("eligibility.notes", e.target.value)}
                                />
                            </div>

                            <div className="text-xs text-muted-foreground">
                                Intakes are used by campaigns and the public enquiry form. Closing an intake prevents new enquiries from general mode.
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
