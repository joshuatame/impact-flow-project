/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/components/PortalSwitchButton.jsx  (REPLACE ENTIRE FILE)
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.jsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.jsx";
import { Badge } from "@/components/ui/badge.jsx";

const KEY = "wfconnect_portal_override";
const NONE = "__none__"; // Radix SelectItem value must NOT be ""

export function getPortalOverride() {
    try {
        return localStorage.getItem(KEY) || "";
    } catch {
        return "";
    }
}

export function setPortalOverride(value) {
    try {
        if (!value) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, value);
    } catch {
        // ignore
    }
}

function goToPortal(nav, p) {
    if (p === "manager") nav("/labourhire/manager/dashboard");
    else if (p === "company") nav("/labourhire/company/dashboard");
    else if (p === "candidate") nav("/labourhire/candidate/profile");
    else nav("/labourhire");
}

function fromSelectValue(v) {
    return v === NONE ? "" : v;
}

function toSelectValue(v) {
    return v && v.length ? v : NONE;
}

export default function PortalSwitchButton({ resolvedPortal }) {
    const nav = useNavigate();
    const [val, setVal] = useState(toSelectValue(getPortalOverride()));

    const currentLabel = useMemo(() => {
        const override = fromSelectValue(val);
        const rp = resolvedPortal || "";
        return override ? `Override: ${override}` : rp ? `Portal: ${rp}` : "Portal";
    }, [val, resolvedPortal]);

    useEffect(() => {
        setVal(toSelectValue(getPortalOverride()));
    }, []);

    return (
        <div className="fixed bottom-4 right-4 z-[9999]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 backdrop-blur p-3 shadow-xl w-[260px] space-y-2">
                <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Portal switch</div>
                    <Badge variant="secondary">{currentLabel}</Badge>
                </div>

                <Select value={val} onValueChange={(v) => setVal(v)}>
                    <SelectTrigger className="h-9">
                        <SelectValue placeholder="Choose override…" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>(no override)</SelectItem>
                        <SelectItem value="manager">manager</SelectItem>
                        <SelectItem value="company">company</SelectItem>
                        <SelectItem value="candidate">candidate</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                            const override = fromSelectValue(val);
                            setPortalOverride(override);

                            const p = override || resolvedPortal || "manager";
                            goToPortal(nav, p);
                        }}
                    >
                        Apply
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setPortalOverride("");
                            setVal(NONE);
                            goToPortal(nav, resolvedPortal || "manager");
                        }}
                    >
                        Clear
                    </Button>
                </div>

                <div className="text-xs text-slate-400">
                    Overrides are stored in <code>localStorage</code> for testing/admin navigation.
                </div>
            </div>
        </div>
    );
}
