// src/pages/systemAdmin/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, where, limit, Timestamp, getCountFromServer } from "firebase/firestore";
import { db } from "@/firebase";
import { Panel, CardShell } from "./_ui.jsx";
import StatsCard from "@/components/ui/StatsCard.jsx";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

function dayKey(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function formatDayLabel(iso) {
    const [y, m, d] = String(iso).split("-").map((x) => Number(x));
    if (!y || !m || !d) return iso;
    return `${d}/${m}`;
}

function buildDaysBack(nDays) {
    const out = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = nDays - 1; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        out.push({ iso: dayKey(d), label: formatDayLabel(dayKey(d)) });
    }
    return out;
}

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [stats, setStats] = useState({
        users: 0,
        entities: 0,
        invitesPending: 0,
        activity30: 0,
    });

    const [activityByDay, setActivityByDay] = useState([]);
    const [activityByType, setActivityByType] = useState([]);
    const [usersByRole, setUsersByRole] = useState([]);

    const days14 = useMemo(() => buildDaysBack(14), []);

    useEffect(() => {
        let alive = true;

        async function run() {
            setLoading(true);
            setError("");

            try {
                const usersCount = await getCountFromServer(collection(db, "User"));
                const entitiesCount = await getCountFromServer(collection(db, "businessEntities"));
                const invitesPendingCount = await getCountFromServer(
                    query(collection(db, "userInviteRequests"), where("status", "==", "Pending"))
                );

                const since30 = new Date();
                since30.setDate(since30.getDate() - 30);
                const activity30Count = await getCountFromServer(
                    query(collection(db, "ActivityLog"), where("createdAt", ">=", Timestamp.fromDate(since30)))
                );

                const since14 = new Date();
                since14.setDate(since14.getDate() - 14);
                since14.setHours(0, 0, 0, 0);

                const activityQ = query(
                    collection(db, "ActivityLog"),
                    where("createdAt", ">=", Timestamp.fromDate(since14)),
                    orderBy("createdAt", "asc"),
                    limit(2500)
                );

                const activitySnap = await getDocs(activityQ);

                const byDay = new Map(days14.map((d) => [d.iso, 0]));
                const byType = new Map();

                activitySnap.docs.forEach((docSnap) => {
                    const a = docSnap.data() || {};
                    const ts = a.createdAt?.toDate ? a.createdAt.toDate() : null;
                    if (!ts) return;

                    const k = dayKey(ts);
                    if (byDay.has(k)) byDay.set(k, (byDay.get(k) || 0) + 1);

                    const t = String(a.activity_type || "unknown");
                    byType.set(t, (byType.get(t) || 0) + 1);
                });

                const byDaySeries = days14.map((d) => ({
                    day: d.label,
                    count: byDay.get(d.iso) || 0,
                }));

                const byTypeSeries = Array.from(byType.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([type, count]) => ({ type, count }));

                // Users by role (sample up to 2000; avoids huge reads)
                const usersSnap = await getDocs(query(collection(db, "User"), orderBy("created_at", "desc"), limit(2000)));
                const roles = new Map();
                usersSnap.docs.forEach((d) => {
                    const u = d.data() || {};
                    const role = String(u.app_role || "Unknown");
                    roles.set(role, (roles.get(role) || 0) + 1);
                });

                const rolesSeries = Array.from(roles.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([role, count]) => ({ role, count }));

                if (!alive) return;

                setStats({
                    users: usersCount.data().count || 0,
                    entities: entitiesCount.data().count || 0,
                    invitesPending: invitesPendingCount.data().count || 0,
                    activity30: activity30Count.data().count || 0,
                });

                setActivityByDay(byDaySeries);
                setActivityByType(byTypeSeries);
                setUsersByRole(rolesSeries);
            } catch (e) {
                console.error(e);
                if (!alive) return;
                setError("Could not load platform activity.");
            } finally {
                if (alive) setLoading(false);
            }
        }

        run();
        return () => {
            alive = false;
        };
    }, [days14]);

    if (loading) return <LoadingSpinner />;
    if (error) {
        return (
            <Panel title="System Admin" subtitle="Platform activity dashboard">
                <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            </Panel>
        );
    }

    return (
        <Panel title="System Admin Dashboard" subtitle="All platform activity — live from Firestore">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatsCard title="Users" value={stats.users} subtitle="Total user profiles" />
                <StatsCard title="Entities" value={stats.entities} subtitle="Business units" />
                <StatsCard title="Invites Pending" value={stats.invitesPending} subtitle="Awaiting approval" />
                <StatsCard title="Activity (30d)" value={stats.activity30} subtitle="ActivityLog entries" />
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
                <CardShell>
                    <div className="text-sm font-semibold text-white">Activity (last 14 days)</div>
                    <div className="mt-3 min-w-0 overflow-hidden">
                        <ChartContainer
                            className="h-[280px]"
                            config={{ count: { label: "Events", color: "hsl(var(--primary))" } }}
                        >
                            <LineChart data={activityByDay} margin={{ left: 12, right: 12 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Line dataKey="count" type="monotone" stroke="var(--color-count)" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ChartContainer>
                    </div>
                </CardShell>

                <CardShell>
                    <div className="text-sm font-semibold text-white">Top activity types</div>
                    <div className="mt-3 min-w-0 overflow-hidden">
                        <ChartContainer
                            className="h-[280px]"
                            config={{ count: { label: "Count", color: "hsl(var(--primary))" } }}
                        >
                            <BarChart data={activityByType} margin={{ left: 12, right: 12 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="type" tickLine={false} axisLine={false} interval={0} height={50} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Bar dataKey="count" fill="var(--color-count)" radius={6} />
                            </BarChart>
                        </ChartContainer>
                    </div>
                </CardShell>
            </div>

            <div className="mt-6">
                <CardShell>
                    <div className="text-sm font-semibold text-white">Users by role (sample)</div>
                    <div className="mt-3 min-w-0 overflow-hidden">
                        <ChartContainer
                            className="h-[320px]"
                            config={{ count: { label: "Users", color: "hsl(var(--primary))" } }}
                        >
                            <PieChart>
                                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                                <Legend />
                                <Pie data={usersByRole} dataKey="count" nameKey="role" innerRadius={70} outerRadius={110}>
                                    {usersByRole.map((_, idx) => (
                                        <Cell key={String(idx)} fill={`hsl(var(--primary) / ${0.15 + (idx % 6) * 0.12})`} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ChartContainer>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                        For performance, this chart samples up to 2000 users (most recent).
                    </div>
                </CardShell>
            </div>
        </Panel>
    );
}