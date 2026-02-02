import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2, ExternalLink, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import PageHeader from "@/components/ui/PageHeader.jsx";
import EmptyState from "@/components/ui/EmptyState.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { cn } from "@/lib/utils";

const priorityColors = {
    low: "bg-slate-500/10 text-slate-400",
    medium: "bg-blue-500/10 text-blue-400",
    high: "bg-amber-500/10 text-amber-400",
    critical: "bg-red-500/10 text-red-400",
};

const typeLabels = {
    upcoming_training: "Training",
    upcoming_employment_milestone: "Milestone",
    overdue_task: "Overdue Task",
    new_case_note: "Case Note",
    task_assigned: "Task Assigned",
    participant_update: "Participant",
    system: "System",
    forum_message: "Forum",
};

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts?.toMillis === "function") return ts.toMillis();
    if (typeof ts?.seconds === "number") return ts.seconds * 1000;
    if (typeof ts === "string") {
        const d = new Date(ts);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (ts instanceof Date) return ts.getTime();
    return 0;
}

function getCreatedMillis(n) {
    return (
        toMillis(n?.created_at) ||
        toMillis(n?.createdAt) ||
        toMillis(n?.created_date) ||
        toMillis(n?.createdDate) ||
        0
    );
}

function isUnread(n) {
    // Support either: status: "Unread" / "Read" OR is_read boolean
    const status = safeText(n?.status || n?.read_status || "").toLowerCase();
    if (status) return status === "unread" || status === "new" || status === "pending";
    if (typeof n?.is_read === "boolean") return !n.is_read;
    if (typeof n?.isRead === "boolean") return !n.isRead;
    return true; // default unread if unknown
}

function getNotificationType(n) {
    return safeText(n?.notification_type || n?.type || n?.kind || "system");
}

function getNotificationPriority(n) {
    const p = safeText(n?.priority || "low").toLowerCase();
    return priorityColors[p] ? p : "low";
}

function getNotificationTitle(n) {
    return safeText(n?.title) || "Notification";
}

function getNotificationBody(n) {
    // Support your older "message" and newer "body"
    return safeText(n?.body || n?.message || n?.content || "");
}

function formatBrisbaneDateTime(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    // Example output: "January 16, 2026 at 3:05 PM"
    const parts = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Brisbane",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).formatToParts(d);

    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    const month = get("month");
    const day = get("day");
    const year = get("year");
    const hour = get("hour");
    const minute = get("minute");
    const dayPeriod = get("dayPeriod");

    return `${month} ${day}, ${year} at ${hour}:${minute} ${dayPeriod}`.trim();
}

export default function Notifications() {
    const [filter, setFilter] = React.useState("all");
    const queryClient = useQueryClient();

    const { data: user } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: notifications = [], isLoading } = useQuery({
        queryKey: ["notifications", user?.id],
        queryFn: async () => {
            const res = await base44.entities.Notification.filter({ user_id: user?.id });
            return Array.isArray(res) ? res : [];
        },
        enabled: !!user?.id,
    });

    const markAsRead = useMutation({
        mutationFn: async (notificationId) => {
            // Set both for compatibility
            await base44.entities.Notification.update(notificationId, { is_read: true, status: "Read" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"], exact: false });
        },
    });

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            const unread = notifications.filter((n) => isUnread(n));
            await Promise.all(
                unread.map((n) => base44.entities.Notification.update(n.id, { is_read: true, status: "Read" }))
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"], exact: false });
        },
    });

    const deleteNotification = useMutation({
        mutationFn: async (notificationId) => {
            await base44.entities.Notification.delete(notificationId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"], exact: false });
        },
    });

    const clearAll = useMutation({
        mutationFn: async () => {
            await Promise.all(notifications.map((n) => base44.entities.Notification.delete(n.id)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"], exact: false });
        },
    });

    if (isLoading) return <LoadingSpinner />;

    const filteredNotifications = (Array.isArray(notifications) ? notifications : [])
        .filter((n) => {
            if (filter === "all") return true;
            if (filter === "unread") return isUnread(n);
            return getNotificationType(n) === filter;
        })
        .sort((a, b) => getCreatedMillis(b) - getCreatedMillis(a));

    const unreadCount = notifications.filter((n) => isUnread(n)).length;

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="Notifications"
                subtitle={`${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
            >
                {unreadCount > 0 && (
                    <Button
                        variant="outline"
                        className="border-slate-700"
                        onClick={() => markAllAsRead.mutate()}
                        disabled={markAllAsRead.isPending}
                    >
                        <Check className="h-4 w-4 mr-2" />
                        Mark all read
                    </Button>
                )}
                {notifications.length > 0 && (
                    <Button
                        variant="outline"
                        className="border-slate-700 text-red-400 hover:text-red-300"
                        onClick={() => clearAll.mutate()}
                        disabled={clearAll.isPending}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear all
                    </Button>
                )}
            </PageHeader>

            <div className="mb-6 flex items-center gap-4">
                <Filter className="h-4 w-4 text-slate-400" />
                <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="all" className="text-white">
                            All notifications
                        </SelectItem>
                        <SelectItem value="unread" className="text-white">
                            Unread only
                        </SelectItem>
                        <SelectItem value="upcoming_training" className="text-white">
                            Training
                        </SelectItem>
                        <SelectItem value="upcoming_employment_milestone" className="text-white">
                            Milestones
                        </SelectItem>
                        <SelectItem value="overdue_task" className="text-white">
                            Overdue Tasks
                        </SelectItem>
                        <SelectItem value="new_case_note" className="text-white">
                            Case Notes
                        </SelectItem>
                        <SelectItem value="task_assigned" className="text-white">
                            Task Assignments
                        </SelectItem>
                        <SelectItem value="forum_message" className="text-white">
                            Forum
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {filteredNotifications.length === 0 ? (
                <EmptyState
                    icon={Bell}
                    title="No notifications"
                    description={
                        filter === "all"
                            ? "You're all caught up! Check back later for updates."
                            : "No notifications match this filter."
                    }
                />
            ) : (
                <div className="space-y-3">
                    {filteredNotifications.map((notification) => {
                        const unread = isUnread(notification);
                        const createdMs = getCreatedMillis(notification);

                        const priority = getNotificationPriority(notification);
                        const type = getNotificationType(notification);
                        const title = getNotificationTitle(notification);
                        const body = getNotificationBody(notification);

                        // Preserve your existing link_url behavior
                        const linkUrl = notification.link_url || notification.linkUrl || null;

                        return (
                            <Card
                                key={notification.id}
                                className={cn(
                                    "bg-slate-900/50 border-slate-800 transition-colors",
                                    unread && "border-l-4 border-l-blue-500"
                                )}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <Badge className={priorityColors[priority]}>{priority}</Badge>
                                                <Badge variant="outline" className="text-slate-400 border-slate-700">
                                                    {typeLabels[type] || safeText(type)}
                                                </Badge>
                                                {unread && <Badge className="bg-blue-500/10 text-blue-400">New</Badge>}
                                            </div>

                                            <h3
                                                className={cn(
                                                    "font-medium",
                                                    unread ? "text-white" : "text-slate-400"
                                                )}
                                            >
                                                {title}
                                            </h3>

                                            {body && (
                                                <p className="text-slate-500 text-sm mt-1 whitespace-pre-wrap">
                                                    {body}
                                                </p>
                                            )}

                                            {createdMs > 0 && (
                                                <p className="text-xs text-slate-600 mt-2">
                                                    {formatBrisbaneDateTime(createdMs)}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {linkUrl && (
                                                <Link to={linkUrl}>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-slate-700"
                                                        onClick={() => markAsRead.mutate(notification.id)}
                                                        disabled={markAsRead.isPending}
                                                    >
                                                        <ExternalLink className="h-4 w-4 mr-1" />
                                                        View
                                                    </Button>
                                                </Link>
                                            )}

                                            {unread && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => markAsRead.mutate(notification.id)}
                                                    disabled={markAsRead.isPending}
                                                    title="Mark read"
                                                >
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                            )}

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-400 hover:text-red-300"
                                                onClick={() => deleteNotification.mutate(notification.id)}
                                                disabled={deleteNotification.isPending}
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
