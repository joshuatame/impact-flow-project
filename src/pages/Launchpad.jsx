// FILE: src/pages/Launchpad.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where, documentId } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Building2, ArrowLeft } from "lucide-react";
import { setActiveEntity } from "@/lib/activeEntity";



function getUid(user) {
    return user?.uid || user?.user_id || user?.id || null;
}

function isSystemAdmin(user) {
    return user?.app_role === "SystemAdmin";
}

async function fetchAllActiveEntities() {
    const q = query(collection(db, "businessEntities"), where("active", "==", true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchEntitiesByIds(ids) {
    if (!ids.length) return [];

    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

    const out = [];
    for (const chunk of chunks) {
        const q = query(collection(db, "businessEntities"), where(documentId(), "in", chunk));
        const snap = await getDocs(q);
        out.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    return out.filter((e) => e?.active);
}

export default function Launchpad() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const uid = useMemo(() => getUid(user), [user]);
    const [loading, setLoading] = useState(true);
    const [entities, setEntities] = useState([]);
    const [error, setError] = useState("");
    const [brokenLogos, setBrokenLogos] = useState(() => new Set());

    useEffect(() => {
        let alive = true;

        async function run() {
            setError("");
            setLoading(true);

            if (!user || !uid) {
                setError("User profile not available yet.");
                setEntities([]);
                setLoading(false);
                return;
            }

            try {
                let list = [];

                if (isSystemAdmin(user)) {
                    list = await fetchAllActiveEntities();
                } else {
                    const access = user?.entity_access || {};
                    const allowedIds = Object.entries(access)
                        .filter(([, v]) => v?.active)
                        .map(([entityId]) => entityId);

                    list = await fetchEntitiesByIds(allowedIds);
                }

                if (!alive) return;

                setEntities(list);

                if (list.length === 1) {
                    const e = list[0];
                    setActiveEntity({ id: e.id, type: e.type || "", name: e.name || "" });
                    navigate("/Dashboard", { replace: true });
                    return;
                }

                setLoading(false);
            } catch (err) {
                console.error(err);
                if (!alive) return;
                setError("Could not load business units.");
                setEntities([]);
                setLoading(false);
            }
        }

        run();
        return () => {
            alive = false;
        };
    }, [user, uid, navigate]);

    function selectEntity(e) {
        setActiveEntity({ id: e.id, type: e.type || "", name: e.name || "" });
        navigate("/Dashboard", { replace: true });
    }

    function markLogoBroken(entityId) {
        setBrokenLogos((prev) => {
            const next = new Set(prev);
            next.add(entityId);
            return next;
        });
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white px-4">
            <div className="max-w-5xl mx-auto py-8">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <div className="font-bold text-xl">Launchpad</div>
                            <div className="text-xs text-slate-400">Select the business unit you want to work in.</div>
                        </div>
                    </div>

                    <Button
                        variant="secondary"
                        className="bg-slate-800 hover:bg-slate-700 text-white"
                        onClick={() => navigate("/Landing")}
                        type="button"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                    </Button>
                   
                </div>

                {error ? (
                    <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="mt-6 text-sm text-slate-400">Loading business units…</div>
                ) : entities.length ? (
                    <div className="mt-6 space-y-3">
                        {/* ✅ SystemAdmin tile goes HERE: above the entities grid */}
                        {isSystemAdmin(user) ? (
                            <button
                                type="button"
                                onClick={() => navigate("/SystemAdmin/dashboard")}
                                className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 transition-colors p-4"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
                                        <span className="font-bold">SA</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold truncate">System Admin</div>
                                        <div className="mt-1 text-xs text-slate-400">Global admin portal</div>
                                        <div className="mt-3 text-xs text-rose-300">Open</div>
                                    </div>
                                </div>
                            </button>
                        ) : null}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {entities.map((e) => {
                                const hasLogo = Boolean(e?.logo_url) && !brokenLogos.has(e.id);

                                return (
                                    <button
                                        key={e.id}
                                        type="button"
                                        onClick={() => selectEntity(e)}
                                        className="text-left rounded-2xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900 transition-colors p-4"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="h-12 w-12 shrink-0 rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden flex items-center justify-center">
                                                {hasLogo ? (
                                                    <img
                                                        src={e.logo_url}
                                                        alt={`${e.name || "Business Unit"} logo`}
                                                        className="h-full w-full object-cover"
                                                        loading="lazy"
                                                        onError={() => markLogoBroken(e.id)}
                                                    />
                                                ) : (
                                                    <Building2 className="h-5 w-5 text-slate-300" />
                                                )}

                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="font-semibold truncate">{e.name || "Business Unit"}</div>
                                                <div className="mt-1 text-xs text-slate-400">{e.type || "UNKNOWN"}</div>
                                                <div className="mt-3 text-xs text-blue-300">Enter</div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                        <div className="font-semibold text-white">No business units found.</div>
                        <div className="mt-1 text-xs text-slate-400">
                            {isSystemAdmin(user)
                                ? "As SystemAdmin, create one in Admin → Business Entities."
                                        : "Ask a SystemAdmin to allocate you to a business unit."}
                                    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                                    <Button
                                        variant="secondary"
                                        className="bg-slate-800 hover:bg-slate-700 text-white"
                                        onClick={async () => {
                                            await logout();
                                            navigate("/login", { replace: true });
                                        }}
                                        type="button"
                                    >
                                        Sign out
                                        </Button>
                                    </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
