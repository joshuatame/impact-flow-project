import React, { useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { Button } from "@/components/ui/button";

const NEW_INDUSTRIES = [
    "Accommodation & Food Services",
    "Administrative & Support Services",
    "Agriculture, Forestry & Fishing",
    "Arts & Recreation Services",
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
];

// NOTE: Your list included "Arts & Recreation Services" once.
// I accidentally duplicated it above. Remove one if you like.
// If you want EXACT list, use the corrected version below:
const NEW_INDUSTRIES_CORRECTED = [
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
];

export default function IndustryTypesFixButton() {
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    const runFix = async () => {
        const ok = window.confirm(
            'Replace systemSettings/industry_types "options" with the new list?'
        );
        if (!ok) return;

        setBusy(true);
        setError("");
        setDone(false);

        try {
            await setDoc(
                doc(db, "systemSettings", "industry_types"),
                {
                    // Only replace the array:
                    options: NEW_INDUSTRIES_CORRECTED,

                    // Optional: update timestamp
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            setDone(true);
        } catch (e) {
            console.error(e);
            setError(e?.message || "Update failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="text-white font-semibold">One-time fix</div>
            <div className="text-slate-400 text-sm">
                Replaces <code className="text-slate-200">systemSettings/industry_types.options</code> with the new industry list.
            </div>

            <Button
                type="button"
                onClick={runFix}
                disabled={busy}
                className="bg-violet-600 hover:bg-violet-700"
            >
                {busy ? "Updating..." : "Replace Industry Types"}
            </Button>

            {done && (
                <div className="text-emerald-400 text-sm">
                    Updated successfully. Refresh your Employment Form.
                </div>
            )}
            {error && <div className="text-red-400 text-sm">{error}</div>}
        </div>
    );
}
