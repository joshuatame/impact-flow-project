// src/components/admin/SystemSettingsPanel.jsx
import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebase";


/**
 * IMPORTANT:
 * - Dropdown settings are seeded ONCE into Firestore (systemSettings/*) if missing.
 * - After seeding, UI reads/writes ONLY from Firestore.
 */

const DEFAULT_DROPDOWN_SETTINGS = [
    {
        setting_key: "industry_types",
        setting_name: "Industry Types",
        setting_type: "dropdown_options",
        options: [
            "Accommodation & Food Services",
            "Administrative & Support Services",
            "Agriculture, Forestry & Fishing",
            "Arts & Recreation Services",
            "Construction",
            "Education & Training",
            "Electricity, Gas, Water & Waste Services",
            "Financial & Insurance Services",
            "Health Care & Social Assistance",
            "Information Media & Telecommunications",
            "Manufacturing",
            "Mining",
            "Other Services",
            "Professional, Scientific & Technical Services",
            "Public Administration & Safety",
            "Rental, Hiring & Real Estate Services",
            "Retail Trade",
            "Security",
            "Transport, Postal & Warehousing",
            "Wholesale Trade",
            "Youth & Community Services",
            "Other",
        ],
    },
    {
        setting_key: "case_note_locations",
        setting_name: "Case Note Locations",
        setting_type: "dropdown_options",
        options: [
            "Organisation Outlet / Office",
            "Client's Residence",
            "Community Venue",
            "Partner Organisation",
            "Telephone",
            "Video",
            "Online Service",
            "Healthcare Facility",
            "Education Facility",
            "Justice Facility",
        ],
    },
    {
        setting_key: "referral_sources",
        setting_name: "Referral Sources",
        setting_type: "dropdown_options",
        options: [
            "Self Referral",
            "Community Organisation",
            "Government Agency",
            "Education Provider",
            "Employer",
            "Family/Friend",
            "Other",
        ],
    },
];

// Seed-only defaults (written to Firestore once if doc missing)
const DEFAULT_ONBOARDING_TASKS = [
    { title: "Complete Intake Survey", task_type: "Survey", priority: "High", due_days: 1 },
    { title: "Confirm Consent & Privacy", task_type: "Consent", priority: "High", due_days: 1 },
    { title: "Add Emergency Contact Details", task_type: "Emergency Contact", priority: "High", due_days: 2 },
    { title: "Upload ID Documents", task_type: "Document Upload", priority: "High", due_days: 3 },
    { title: "Create Initial Action Plan", task_type: "Action Plan", priority: "Medium", due_days: 7 },
    { title: "Schedule First Appointment", task_type: "Appointment", priority: "Medium", due_days: 7 },
    { title: "Record Baseline Employment Status", task_type: "Employment Baseline", priority: "Medium", due_days: 7 },
    { title: "Set Participant Goals", task_type: "Goals", priority: "Medium", due_days: 7 },
    { title: "Initial Case Note", task_type: "Case Note", priority: "Medium", due_days: 7 },
];

async function ensureDefaultsExist() {
    // Dropdown settings
    for (const s of DEFAULT_DROPDOWN_SETTINGS) {
        const ref = doc(db, "systemSettings", s.setting_key);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            await setDoc(ref, { ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
    }

    // Onboarding tasks setting (seed once)
    const onboardingRef = doc(db, "systemSettings", "onboarding_tasks");
    const onboardingSnap = await getDoc(onboardingRef);
    if (!onboardingSnap.exists()) {
        await setDoc(onboardingRef, {
            setting_key: "onboarding_tasks",
            setting_name: "Onboarding Tasks",
            setting_type: "json",
            value: DEFAULT_ONBOARDING_TASKS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }
}

const ALLOWED_TASK_PRIORITIES = new Set(["Low", "Medium", "High"]);
const validateOnboardingTasks = (value) => {
    const errors = [];
    if (!Array.isArray(value)) return { ok: false, errors: ["Tasks must be an array."] };
    if (value.length === 0) return { ok: false, errors: ["At least one task is required."] };
    if (value.length > 200) errors.push("Too many tasks (max 200).");

    value.forEach((t, idx) => {
        if (!t || typeof t !== "object") {
            errors.push(`Task #${idx + 1}: must be an object.`);
            return;
        }
        const title = String(t.title || "").trim();
        const taskType = String(t.task_type || "").trim();
        const priority = String(t.priority || "Medium").trim();
        const dueDaysRaw = t.due_days;

        if (!title) errors.push(`Task #${idx + 1}: title is required.`);
        if (!taskType) errors.push(`Task #${idx + 1}: task_type is required.`);
        if (title.length > 140) errors.push(`Task #${idx + 1}: title too long (max 140).`);
        if (taskType.length > 80) errors.push(`Task #${idx + 1}: task_type too long (max 80).`);

        if (priority && !ALLOWED_TASK_PRIORITIES.has(priority)) {
            errors.push(`Task #${idx + 1}: priority must be Low, Medium, or High.`);
        }

        if (dueDaysRaw != null) {
            const n = Number(dueDaysRaw);
            if (!Number.isFinite(n) || n < 0 || n > 365 || Math.floor(n) !== n) {
                errors.push(`Task #${idx + 1}: due_days must be an integer 0-365.`);
            }
        }
    });

    return { ok: errors.length === 0, errors };
};

export default function SystemSettingsPanel() {
    const [editingKey, setEditingKey] = useState(null);
    const [newOption, setNewOption] = useState("");
    const [jsonDraft, setJsonDraft] = useState("");
    const [jsonError, setJsonError] = useState("");

    const [taskDraft, setTaskDraft] = useState({
        title: "",
        task_type: "",
        priority: "Medium",
        due_days: 7,
    });

    const queryClient = useQueryClient();

    const { data: systemSettings = [], isLoading } = useQuery({
        queryKey: ["systemSettingsFirestore"],
        queryFn: async () => {
            await ensureDefaultsExist();

            const snap = await getDocs(collection(db, "systemSettings"));
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

            // Stable order: defaults first, onboarding_tasks next, then rest
            const orderKeys = [
                ...DEFAULT_DROPDOWN_SETTINGS.map((s) => s.setting_key),
                "onboarding_tasks",
            ];
            const orderMap = new Map(orderKeys.map((k, i) => [k, i]));
            items.sort((a, b) => {
                const ai = orderMap.has(a.setting_key) ? orderMap.get(a.setting_key) : 999;
                const bi = orderMap.has(b.setting_key) ? orderMap.get(b.setting_key) : 999;
                if (ai !== bi) return ai - bi;
                return String(a.setting_name || "").localeCompare(String(b.setting_name || ""));
            });

            return items;
        },
        staleTime: 60_000,
    });

    const updateSetting = useMutation({
        mutationFn: async ({ setting_key, data }) => {
            const ref = doc(db, "systemSettings", setting_key);
            await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["systemSettingsFirestore"] });
            setEditingKey(null);
        },
    });

    const startEditing = (setting) => {
        if (editingKey === setting.setting_key) {
            setEditingKey(null);
            setJsonError("");
            return;
        }

        setEditingKey(setting.setting_key);
        setNewOption("");
        setJsonError("");

        if (setting.setting_type === "json") {
            setJsonDraft(JSON.stringify(setting.value ?? [], null, 2));
            setTaskDraft({ title: "", task_type: "", priority: "Medium", due_days: 7 });
        }
    };

    const addOption = (setting) => {
        const opt = newOption.trim();
        if (!opt) return;

        const existing = Array.isArray(setting.options) ? setting.options : [];
        const exists = existing.some((x) => String(x || "").toLowerCase() === opt.toLowerCase());
        if (exists) {
            setNewOption("");
            return;
        }

        updateSetting.mutate({
            setting_key: setting.setting_key,
            data: { options: [...existing, opt] },
        });
        setNewOption("");
    };

    const removeOption = (setting, optionToRemove) => {
        const existing = Array.isArray(setting.options) ? setting.options : [];
        const updated = existing.filter((o) => o !== optionToRemove);

        updateSetting.mutate({
            setting_key: setting.setting_key,
            data: { options: updated },
        });
    };

    const onboardingSetting = useMemo(
        () => systemSettings.find((s) => s.setting_key === "onboarding_tasks"),
        [systemSettings]
    );

    const onboardingTasks = useMemo(() => {
        const raw = onboardingSetting?.value;
        return Array.isArray(raw) ? raw : [];
    }, [onboardingSetting]);

    const saveOnboardingTasks = (tasks) => {
        const res = validateOnboardingTasks(tasks);
        if (!res.ok) {
            setJsonError(res.errors.join(" "));
            return;
        }
        setJsonError("");
        updateSetting.mutate({ setting_key: "onboarding_tasks", data: { value: tasks } });
    };

    const handleAddTask = () => {
        const next = {
            title: String(taskDraft.title || "").trim(),
            task_type: String(taskDraft.task_type || "").trim(),
            priority: String(taskDraft.priority || "Medium").trim(),
            due_days: taskDraft.due_days == null ? null : Number(taskDraft.due_days),
        };

        const nextList = [...onboardingTasks, next];
        saveOnboardingTasks(nextList);
        setTaskDraft({ title: "", task_type: "", priority: "Medium", due_days: 7 });
    };

    const handleDeleteTask = (idx) => {
        const nextList = onboardingTasks.filter((_, i) => i !== idx);
        saveOnboardingTasks(nextList);
    };

    const saveJsonSetting = (setting) => {
        try {
            const parsed = JSON.parse(jsonDraft || "null");

            if (setting.setting_key === "onboarding_tasks") {
                const res = validateOnboardingTasks(parsed);
                if (!res.ok) {
                    setJsonError(res.errors.join(" "));
                    return;
                }
            } else if (!Array.isArray(parsed)) {
                setJsonError("JSON must be an array.");
                return;
            }

            setJsonError("");
            updateSetting.mutate({ setting_key: setting.setting_key, data: { value: parsed } });
        } catch {
            setJsonError("Invalid JSON.");
        }
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            {/* System tools shortcuts */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-white">System Tools</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        <Link to={createPageUrl("SurveyBuilder")}>
                            <Button type="button" className="bg-blue-600 hover:bg-blue-700">
                                Survey Builder
                            </Button>
                        </Link>

                        <Link to={createPageUrl("PdfTemplateAdmin")}>
                            <Button
                                type="button"
                                variant="outline"
                                className="border-slate-700 text-slate-200 hover:bg-slate-800"
                            >
                                PDF Template Admin
                            </Button>
                        </Link>
                    </div>

                    <p className="text-xs text-slate-400 mt-3">Shortcuts to key system tools.</p>
                </CardContent>
            </Card>

            {/* Settings cards */}
            {systemSettings.map((setting) => (
                <Card key={setting.setting_key} className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center justify-between">
                            <span>{setting.setting_name}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditing(setting)}
                                className="text-slate-400"
                                type="button"
                            >
                                <Edit className="h-4 w-4" />
                            </Button>
                        </CardTitle>
                    </CardHeader>

                    <CardContent>
                        {setting.setting_type === "dropdown_options" && (
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    {(setting.options || []).map((option, idx) => (
                                        <Badge key={idx} className="bg-slate-700 text-white px-3 py-1">
                                            {option}
                                            {editingKey === setting.setting_key && (
                                                <button
                                                    onClick={() => removeOption(setting, option)}
                                                    className="ml-2 text-red-400 hover:text-red-300"
                                                    type="button"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </Badge>
                                    ))}
                                </div>

                                {editingKey === setting.setting_key && (
                                    <div className="flex gap-2 mt-3">
                                        <div className="flex-1">
                                            <Label className="text-slate-300">Add option</Label>
                                            <Input
                                                value={newOption}
                                                onChange={(e) => setNewOption(e.target.value)}
                                                placeholder="Add new option..."
                                                className="bg-slate-800 border-slate-700 text-white"
                                                onKeyDown={(e) => e.key === "Enter" && addOption(setting)}
                                            />
                                        </div>

                                        <div className="flex items-end">
                                            <Button
                                                type="button"
                                                onClick={() => addOption(setting)}
                                                className="bg-blue-600 hover:bg-blue-700"
                                                disabled={!newOption.trim() || updateSetting.isPending}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {setting.setting_type === "json" && (
                            <div className="space-y-4">
                                {editingKey !== setting.setting_key ? (
                                    <div className="text-slate-400 text-sm">
                                        {setting.setting_key === "onboarding_tasks"
                                            ? `Tasks configured: ${(setting.value || []).length}`
                                            : "JSON setting"}
                                    </div>
                                ) : (
                                    <>
                                        {setting.setting_key === "onboarding_tasks" ? (
                                            <div className="space-y-4">
                                                <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 space-y-3">
                                                    <p className="text-white font-semibold">Add Onboarding Task</p>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                            <Label className="text-slate-300">Title *</Label>
                                                            <Input
                                                                value={taskDraft.title}
                                                                onChange={(e) =>
                                                                    setTaskDraft((s) => ({ ...s, title: e.target.value }))
                                                                }
                                                                className="bg-slate-800 border-slate-700 text-white"
                                                                placeholder="e.g., Complete Intake Survey"
                                                            />
                                                        </div>

                                                        <div>
                                                            <Label className="text-slate-300">Task Type *</Label>
                                                            <Input
                                                                value={taskDraft.task_type}
                                                                onChange={(e) =>
                                                                    setTaskDraft((s) => ({ ...s, task_type: e.target.value }))
                                                                }
                                                                className="bg-slate-800 border-slate-700 text-white"
                                                                placeholder="e.g., Survey"
                                                            />
                                                        </div>

                                                        <div>
                                                            <Label className="text-slate-300">Priority</Label>
                                                            <Select
                                                                value={taskDraft.priority}
                                                                onValueChange={(v) =>
                                                                    setTaskDraft((s) => ({ ...s, priority: v }))
                                                                }
                                                            >
                                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                                                    <SelectItem value="Low">Low</SelectItem>
                                                                    <SelectItem value="Medium">Medium</SelectItem>
                                                                    <SelectItem value="High">High</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div>
                                                            <Label className="text-slate-300">Due Days</Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={365}
                                                                value={taskDraft.due_days}
                                                                onChange={(e) =>
                                                                    setTaskDraft((s) => ({ ...s, due_days: e.target.value }))
                                                                }
                                                                className="bg-slate-800 border-slate-700 text-white"
                                                            />
                                                        </div>
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        onClick={handleAddTask}
                                                        className="bg-blue-600 hover:bg-blue-700"
                                                        disabled={
                                                            updateSetting.isPending ||
                                                            !String(taskDraft.title || "").trim() ||
                                                            !String(taskDraft.task_type || "").trim()
                                                        }
                                                    >
                                                        <Plus className="h-4 w-4 mr-2" />
                                                        Add Task
                                                    </Button>
                                                </div>

                                                <div className="bg-slate-800/20 border border-slate-800 rounded-xl p-4 space-y-3">
                                                    <p className="text-white font-semibold">Current Tasks</p>

                                                    {onboardingTasks.length === 0 ? (
                                                        <div className="text-slate-400 text-sm">No tasks configured.</div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {onboardingTasks.map((t, idx) => (
                                                                <div
                                                                    key={`${t.title}-${idx}`}
                                                                    className="flex items-start justify-between gap-3 bg-slate-900/40 border border-slate-800 rounded-lg p-3"
                                                                >
                                                                    <div className="space-y-1">
                                                                        <div className="text-white text-sm font-medium">{t.title}</div>
                                                                        <div className="text-slate-400 text-xs">
                                                                            Type: {t.task_type} · Priority: {t.priority || "Medium"} · Due:{" "}
                                                                            {t.due_days ?? "—"} day(s)
                                                                        </div>
                                                                    </div>

                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="text-red-400 hover:text-red-300"
                                                                        onClick={() => handleDeleteTask(idx)}
                                                                        disabled={updateSetting.isPending}
                                                                        title="Delete task"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {jsonError && (
                                                        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                                                            {jsonError}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="border-slate-700 text-slate-200"
                                                            onClick={() => startEditing(setting)}
                                                            disabled={updateSetting.isPending}
                                                        >
                                                            Done
                                                        </Button>

                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="border-slate-700 text-slate-200"
                                                            onClick={() =>
                                                                setJsonDraft(JSON.stringify(onboardingTasks, null, 2))
                                                            }
                                                            disabled={updateSetting.isPending}
                                                        >
                                                            Load Raw JSON
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <Label className="text-slate-300">Raw JSON (optional)</Label>
                                                    <textarea
                                                        value={jsonDraft}
                                                        onChange={(e) => setJsonDraft(e.target.value)}
                                                        className="w-full min-h-[220px] bg-slate-800 border border-slate-700 text-white rounded-md p-3 font-mono text-xs"
                                                    />

                                                    {jsonError && (
                                                        <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                                                            {jsonError}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            className="bg-blue-600 hover:bg-blue-700"
                                                            onClick={() => saveJsonSetting(setting)}
                                                            disabled={updateSetting.isPending}
                                                        >
                                                            Save JSON
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <Label className="text-slate-300">JSON Value</Label>
                                                <textarea
                                                    value={jsonDraft}
                                                    onChange={(e) => setJsonDraft(e.target.value)}
                                                    className="w-full min-h-[260px] bg-slate-800 border border-slate-700 text-white rounded-md p-3 font-mono text-xs"
                                                />

                                                {jsonError && (
                                                    <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                                                        {jsonError}
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        className="bg-blue-600 hover:bg-blue-700"
                                                        onClick={() => saveJsonSetting(setting)}
                                                        disabled={updateSetting.isPending}
                                                    >
                                                        Save
                                                    </Button>

                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="border-slate-700 text-slate-200"
                                                        onClick={() => startEditing(setting)}
                                                        disabled={updateSetting.isPending}
                                                    >
                                                        Done
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
