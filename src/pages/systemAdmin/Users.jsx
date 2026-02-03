/**************************************************************************************************
 * FILE: src/pages/systemAdmin/Users.jsx
 * ADD: click user -> load activity daily/weekly/monthly/to-date with chart + table
 *
 * Assumptions:
 * - You have a collection "ActivityLog" with fields:
 *   actor_id, activity_type, message, createdAt (Firestore Timestamp)
 * - Adjust field names if yours differ.
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function toKeyYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}
function bucketDaily(logs, daysBack = 30) {
    const today = startOfDay(new Date());
    const start = addDays(today, -daysBack + 1);
    const map = new Map();
    for (let i = 0; i < daysBack; i++) map.set(toKeyYmd(addDays(start, i)), 0);
    logs.forEach((l) => {
        const dt = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt);
        const k = toKeyYmd(startOfDay(dt));
        if (map.has(k)) map.set(k, map.get(k) + 1);
    });
    return Array.from(map.entries()).map(([day, count]) => ({ day, count }));
}
function bucketMonthly(logs, monthsBack = 12) {
    const now = new Date();
    const map = new Map();
    for (let i = 0; i < monthsBack; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map.set(k, 0);
    }
    logs.forEach((l) => {
        const dt = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt);
        const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        if (map.has(k)) map.set(k, map.get(k) + 1);
    });
    return Array.from(map.entries()).map(([month, count]) => ({ month, count }));
}

export default function Users() {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [logs, setLogs] = useState([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        async function run() {
            try {
                // adjust collection name if yours differs
                const snap = await getDocs(query(collection(db, "User"), orderBy("created_at", "desc"), limit(200)));
                if (!alive) return;
                setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            } catch (e) {
                console.error(e);
            }
        }
        run();
        return () => { alive = false; };
    }, []);

    async function loadActivityForUser(userId) {
        setBusy(true);
        try {
            const q = query(
                collection(db, "ActivityLog"),
                where("actor_id", "==", userId),
                orderBy("createdAt", "desc"),
                limit(2000)
            );
            const snap = await getDocs(q);
            setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } finally {
            setBusy(false);
        }
    }

    const daily = useMemo(() => bucketDaily(logs, 30), [logs]);
    const monthly = useMemo(() => bucketMonthly(logs, 12), [logs]);

    const totals = useMemo(() => {
        const now = new Date();
        const dayStart = startOfDay(now);
        const weekStart = addDays(dayStart, -((dayStart.getDay() + 6) % 7)); // Monday-start week
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        let today = 0, week = 0, month = 0, toDate = logs.length;

        logs.forEach((l) => {
            const dt = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt);
            if (dt >= dayStart) today += 1;
            if (dt >= weekStart) week += 1;
            if (dt >= monthStart) month += 1;
        });

        return { today, week, month, toDate };
    }, [logs]);

    return (
        <div className="p-6 space-y-4">
            <div className="text-2xl font-semibold">Users</div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="rounded-2xl min-w-0">
                    <CardHeader>
                        <CardTitle>User list</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {users.map((u) => (
                            <button
                                key={u.id}
                                type="button"
                                onClick={async () => {
                                    setSelectedUser(u);
                                    await loadActivityForUser(u.id);
                                }}
                                className="w-full text-left rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 transition-colors p-3"
                            >
                                <div className="font-medium truncate">{u.full_name || u.email || u.id}</div>
                                <div className="text-xs text-slate-400 truncate">{u.email || ""}</div>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl min-w-0 xl:col-span-2">
                    <CardHeader>
                        <CardTitle>
                            Activity {selectedUser ? `— ${selectedUser.full_name || selectedUser.email || selectedUser.id}` : ""}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!selectedUser ? (
                            <div className="text-sm text-slate-400">Select a user to view activity.</div>
                        ) : busy ? (
                            <div className="text-sm text-slate-400">Loading activity…</div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                        <div className="text-xs text-slate-400">Today</div>
                                        <div className="text-xl font-semibold">{totals.today}</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                        <div className="text-xs text-slate-400">This week</div>
                                        <div className="text-xl font-semibold">{totals.week}</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                        <div className="text-xs text-slate-400">This month</div>
                                        <div className="text-xl font-semibold">{totals.month}</div>
                                    </div>
                                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                                        <div className="text-xs text-slate-400">To date</div>
                                        <div className="text-xl font-semibold">{totals.toDate}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <Card className="rounded-2xl min-w-0">
                                        <CardHeader>
                                            <CardTitle>Daily (last 30 days)</CardTitle>
                                        </CardHeader>
                                        <CardContent className="h-64 min-w-0 overflow-hidden">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={daily}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="day" hide />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Bar dataKey="count" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-2xl min-w-0">
                                        <CardHeader>
                                            <CardTitle>Monthly (last 12 months)</CardTitle>
                                        </CardHeader>
                                        <CardContent className="h-64 min-w-0 overflow-hidden">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={monthly}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="month" />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Bar dataKey="count" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card className="rounded-2xl min-w-0">
                                    <CardHeader>
                                        <CardTitle>Activity log (latest)</CardTitle>
                                    </CardHeader>
                                    <CardContent className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-slate-400">
                                                <tr>
                                                    <th className="text-left py-2 pr-2">When</th>
                                                    <th className="text-left py-2 pr-2">Type</th>
                                                    <th className="text-left py-2 pr-2">Message</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {logs.slice(0, 100).map((l) => {
                                                    const dt = l.createdAt?.toDate ? l.createdAt.toDate() : null;
                                                    return (
                                                        <tr key={l.id} className="border-t border-slate-800">
                                                            <td className="py-2 pr-2 whitespace-nowrap text-slate-300">
                                                                {dt ? dt.toLocaleString() : ""}
                                                            </td>
                                                            <td className="py-2 pr-2 text-slate-300">{l.activity_type || ""}</td>
                                                            <td className="py-2 pr-2 text-slate-300">{l.message || ""}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </CardContent>
                                </Card>
                            </>
                        )}

                        <div className="flex justify-end">
                            {selectedUser ? (
                                <Button
                                    variant="secondary"
                                    className="bg-slate-800 hover:bg-slate-700"
                                    onClick={() => {
                                        setSelectedUser(null);
                                        setLogs([]);
                                    }}
                                    type="button"
                                >
                                    Clear
                                </Button>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}