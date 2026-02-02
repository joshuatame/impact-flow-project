import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/firebase";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";

export default function RedirectRoute() {
    const { code } = useParams();
    const navigate = useNavigate();
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;

        async function run() {
            try {
                if (!code) throw new Error("Missing code.");

                // Log click server-side and get landing params.
                const callable = httpsCallable(functions, "rtoResolveCodeForClientRedirect");
                const res = await callable({ code });

                const data = res.data || {};
                const qs = new URLSearchParams();

                qs.set("code", code);
                if (data.intakeId) qs.set("intakeId", data.intakeId);
                if (data.campaignId) qs.set("campaignId", data.campaignId);
                if (data.campaignLinkId) qs.set("campaignLinkId", data.campaignLinkId);
                if (data.sourceChannel) qs.set("sourceChannel", data.sourceChannel);
                if (data.bdUserId) qs.set("bdUserId", data.bdUserId);
                if (data.qrVariant) qs.set("qrVariant", data.qrVariant);

                if (data.utmDefaults) {
                    for (const [k, v] of Object.entries(data.utmDefaults)) {
                        if (v) qs.set(k, v);
                    }
                }

                if (!cancelled) {
                    navigate(`/enquiry?${qs.toString()}`, { replace: true });
                }
            } catch (e) {
                if (!cancelled) setError(e?.message || "Failed to redirect.");
            }
        }

        run();
        return () => {
            cancelled = true;
        };
    }, [code, navigate]);

    return (
        <div className="p-10 flex flex-col items-center gap-3">
            {error ? (
                <div className="border rounded p-4 text-sm text-red-600 max-w-lg">{error}</div>
            ) : (
                <>
                    <LoadingSpinner />
                    <div className="text-sm text-muted-foreground">Redirecting...</div>
                </>
            )}
        </div>
    );
}
