// src/pages/Settings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Bell, Clock, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import PageHeader from "@/components/ui/PageHeader.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

import { doc, setDoc } from "firebase/firestore";
import { db } from "@/firebase";

import { ensureFcmTokenSaved } from "@/lib/ensureFcmTokenSaved";

function canUseBrowserNotifications() {
    return typeof window !== "undefined" && "Notification" in window;
}

function getBrowserNotificationPermissionSafe() {
    if (!canUseBrowserNotifications()) return "unsupported";
    return Notification.permission; // "default" | "granted" | "denied"
}

async function ensureNotificationPermission() {
    if (!canUseBrowserNotifications()) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
        return await Notification.requestPermission();
    } catch {
        return "denied";
    }
}

export default function Settings() {
    const [settings, setSettings] = useState({
        daily_digest_enabled: true,
        daily_digest_time: "08:00",
        phone: "",
        // Notification preferences
        notify_training_reminders: true,
        notify_employment_milestones: true,
        notify_overdue_tasks: true,
        notify_new_case_notes: true,
        notify_task_assignments: true,
        notify_upcoming_intakes: true,
        // Browser popups (in-app)
        browser_notifications_enabled: false,
    });

    const [saved, setSaved] = useState(false);
    const queryClient = useQueryClient();

    const { data: user, isLoading } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    useEffect(() => {
        if (!user) return;

        setSettings({
            daily_digest_enabled: user.daily_digest_enabled !== false,
            daily_digest_time: user.daily_digest_time || "08:00",
            phone: user.phone || "",
            notify_training_reminders: user.notify_training_reminders !== false,
            notify_employment_milestones: user.notify_employment_milestones !== false,
            notify_overdue_tasks: user.notify_overdue_tasks !== false,
            notify_new_case_notes: user.notify_new_case_notes !== false,
            notify_task_assignments: user.notify_task_assignments !== false,
            notify_upcoming_intakes: user.notify_upcoming_intakes !== false,
            browser_notifications_enabled: user.browser_notifications_enabled === true,
        });
    }, [user]);

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            // Persist to base44 user profile (PATCH)
            await base44.auth.updateMe(data);

            // Also persist to Firestore User/{id}
            if (user?.id) {
                await setDoc(doc(db, "User", user.id), data, { merge: true });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUser"] });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        },
    });

    // ✅ Immediate persist for browser notifications toggle + save FCM token when enabling
    const handleToggleBrowserNotifications = async (checked) => {
        let nextValue = checked;

        // Turning ON → request permission
        if (checked) {
            const perm = await ensureNotificationPermission();
            if (perm !== "granted") nextValue = false;
        }

        // Update UI immediately
        setSettings((prev) => ({ ...prev, browser_notifications_enabled: nextValue }));

        // Persist immediately so NotificationListener sees it right away
        saveMutation.mutate({ browser_notifications_enabled: nextValue });

        // If enabling, ensure token is saved (best-effort)
        if (nextValue && user?.id) {
            try {
                await ensureFcmTokenSaved({ uid: user.id });
            } catch (e) {
                console.error("Failed to ensure FCM token saved:", e);
            }
        }
    };

    const handleSave = () => {
        saveMutation.mutate(settings);
    };

    const browserPerm = useMemo(() => getBrowserNotificationPermissionSafe(), []);
    const isBrowserSupported = canUseBrowserNotifications();

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto">
            <PageHeader title="Settings" subtitle="Manage your account preferences" />

            <div className="space-y-6">
                {/* Profile */}
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Profile
                        </CardTitle>
                        <CardDescription className="text-slate-400">Your account information</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-slate-300">Name</Label>
                            <Input
                                value={user?.full_name || ""}
                                disabled
                                className="bg-slate-800 border-slate-700 text-slate-400"
                            />
                        </div>
                        <div>
                            <Label className="text-slate-300">Email</Label>
                            <Input
                                value={user?.email || ""}
                                disabled
                                className="bg-slate-800 border-slate-700 text-slate-400"
                            />
                        </div>
                        <div>
                            <Label className="text-slate-300">Role</Label>
                            <Input
                                value={user?.app_role || "ClientCaseWorker"}
                                disabled
                                className="bg-slate-800 border-slate-700 text-slate-400"
                            />
                        </div>
                        <div>
                            <Label className="text-slate-300">Phone Number</Label>
                            <Input
                                value={settings.phone}
                                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                                className="bg-slate-800 border-slate-700 text-white"
                                placeholder="Enter your phone number"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Notifications */}
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white flex items-center gap-2">
                            <Bell className="h-5 w-5" />
                            Notifications
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            Configure your notification preferences
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-white">Daily Digest Email</Label>
                                <p className="text-sm text-slate-400">
                                    Receive a daily summary of your participants and tasks
                                </p>
                            </div>
                            <Switch
                                checked={settings.daily_digest_enabled}
                                onCheckedChange={(checked) =>
                                    setSettings({ ...settings, daily_digest_enabled: checked })
                                }
                            />
                        </div>

                        {settings.daily_digest_enabled && (
                            <div>
                                <Label className="text-slate-300 flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Digest Time
                                </Label>
                                <Input
                                    type="time"
                                    value={settings.daily_digest_time}
                                    onChange={(e) =>
                                        setSettings({ ...settings, daily_digest_time: e.target.value })
                                    }
                                    className="bg-slate-800 border-slate-700 text-white w-32 mt-2"
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    The time when you'll receive your daily digest email
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-white">Upcoming Intakes</Label>
                                <p className="text-sm text-slate-400">Alerts when intakes are starting soon</p>
                            </div>
                            <Switch
                                checked={settings.notify_upcoming_intakes}
                                onCheckedChange={(checked) =>
                                    setSettings({ ...settings, notify_upcoming_intakes: checked })
                                }
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <Label className="text-white">Browser Pop-up Notifications</Label>
                                <p className="text-sm text-slate-400">
                                    Show pop-up notifications (when the app is open)
                                </p>

                                {!isBrowserSupported && (
                                    <p className="text-xs text-amber-400 mt-1">
                                        This browser does not support notifications.
                                    </p>
                                )}

                                {isBrowserSupported && browserPerm === "denied" && (
                                    <p className="text-xs text-amber-400 mt-1">
                                        Notifications are blocked in your browser settings. Enable them for this site
                                        to use popups.
                                    </p>
                                )}
                            </div>

                            <Switch
                                checked={settings.browser_notifications_enabled}
                                onCheckedChange={handleToggleBrowserNotifications}
                            />
                        </div>

                        <div className="border-t border-slate-700 pt-4 mt-4">
                            <h4 className="text-white font-medium mb-4">Notification Types</h4>

                            <div className="space-y-4">
                                {[
                                    ["notify_training_reminders", "Training Reminders", "Upcoming training sessions and deadlines"],
                                    ["notify_employment_milestones", "Employment Milestones", "4, 13, and 26 week milestone reminders"],
                                    ["notify_overdue_tasks", "Overdue Tasks", "Alerts when tasks become overdue"],
                                    ["notify_new_case_notes", "New Case Notes", "When case notes are added to your participants"],
                                    ["notify_task_assignments", "Task Assignments", "When new tasks are assigned to you"],
                                ].map(([key, title, desc]) => (
                                    <div key={key} className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-white">{title}</Label>
                                            <p className="text-sm text-slate-400">{desc}</p>
                                        </div>
                                        <Switch
                                            checked={settings[key]}
                                            onCheckedChange={(checked) =>
                                                setSettings({ ...settings, [key]: checked })
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Save Button */}
                <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                >
                    {saved ? (
                        <>
                            <Check className="h-4 w-4 mr-2" />
                            Saved!
                        </>
                    ) : saveMutation.isPending ? (
                        "Saving..."
                    ) : (
                        <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Settings
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
