// src/pages/Landing.jsx
import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveEntity, hasActiveEntity, clearActiveEntity } from "@/lib/activeEntity";

export default function Landing() {
    const navigate = useNavigate();
    const active = useMemo(() => getActiveEntity(), []);

    useEffect(() => {
        // If an entity is already selected, go straight into the app
        if (hasActiveEntity()) {
            navigate("/Dashboard", { replace: true });
        }
    }, [navigate]);

    function LandingSignOutButton() {
        const navigate = useNavigate();
        const { logout } = useAuth();


        const handleSelect = () => {
            navigate("/Launchpad");
        };

        const handleContinue = () => {
            navigate("/Dashboard", { replace: true });
        };

        const handleChangeBusinessUnit = () => {
            clearActiveEntity();
            navigate("/Launchpad", { replace: true });
        };


        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
                <div className="w-full max-w-xl">
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black/50 backdrop-blur">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <Building2 className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <div className="font-bold text-xl">Impact Central</div>
                                <div className="text-xs text-slate-400">Select a business unit to continue</div>

                            </div>
                        </div>

                        {active?.name ? (
                            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                                <div className="text-sm text-slate-300">
                                    Current business unit:{" "}
                                    <span className="font-semibold text-white">{active.name}</span>
                                </div>

                                <div className="mt-3 flex gap-2">
                                    <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleContinue}>
                                        Continue <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        className="bg-slate-800 hover:bg-slate-700 text-white"
                                        onClick={handleChangeBusinessUnit}
                                    >
                                        Change business unit
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                                <div>
                                    <div className="font-semibold">Enter workspace</div>
                                    <div className="text-xs text-slate-400">Choose the business unit you are allocated to.</div>

                                </div>

                                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSelect}>
                                    Select <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </div>

                        )}
                    </div>
                </div>
            </div>
        );
    }
}