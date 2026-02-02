// src/pages/Login.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

import loginBg from "@/assets/login-2-bg.jpg";
import logoImg from "@/assets/logo-2.png";

export default function Login() {
    const { login, user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [form, setForm] = useState({ email: "", password: "" });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const from = useMemo(() => location.state?.from?.pathname || "/", [location.state]);

    useEffect(() => {
        // Navigate only after AuthContext has the Firestore profile loaded
        if (!loading && user) {
            navigate(from, { replace: true });
        }
    }, [loading, user, from, navigate]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        try {
            await login(form.email, form.password);
            // DO NOT navigate here. Wait for AuthContext to populate `user`.
        } catch (err) {
            console.error(err);
            setError("Could not sign in. Check your email and password.");
            setSubmitting(false);
        }
    }

    const disabled = submitting || loading;

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4"
            style={{
                backgroundImage: `url(${loginBg})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            <div className="absolute inset-0 bg-slate-950/70" />
            <div className="relative z-10 max-w-md w-full">
                <div className="flex flex-col items-center mb-6">
                    <img
                        src={logoImg}
                        alt="Impact Central"
                        className="h-16 w-auto object-contain drop-shadow"
                    />
                    <h1 className="text-lg font-bold text-white mb-4">Impact Central</h1>
                    <h3 className="text-lg font-small text-white">Where Change Happens</h3>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black/60 backdrop-blur">
                    <h2 className="text-lg font-medium text-white mb-4">Sign in</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                autoComplete="email"
                                value={form.email}
                                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                placeholder="Email"
                                required
                                disabled={disabled}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-200 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                autoComplete="current-password"
                                value={form.password}
                                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                                className="w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/70"
                                placeholder="••••••••"
                                required
                                disabled={disabled}
                            />
                        </div>

                        {error && (
                            <p className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 rounded-md px-2 py-1">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={disabled}
                            className="w-full inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {disabled ? "Signing in..." : "Sign in"}
                        </button>
                    </form>

                    <div className="mt-4 border-t border-slate-800 pt-3">
                        <p className="text-[11px] text-slate-300/80">
                            Roles (Client Case Worker, Contracts Admin, Manager) are assigned by
                            a system administrator after your first sign in.
                        </p>
                    </div>
                </div>

                <div className="mt-4 text-[11px] leading-relaxed text-white/90">
                    We acknowledge all Aboriginal and Torres Strait Islander as the Traditional Custodians
                    of these lands and pay our respects to Elders past and present. This Country has always
                    been a place of teaching, learning and knowledge sharing, and that continues today. We
                    honour the enduring connection of Aboriginal and Torres Strait Islander peoples to this
                    land, culture and community. We recognise the ongoing presence and contributions of
                    Aboriginal and Torres Strait Islander peoples and commit to listening, learning and
                    walking together.
                </div>
            </div>
        </div>
    );
}
