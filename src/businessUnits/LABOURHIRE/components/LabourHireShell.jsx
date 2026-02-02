/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/components/LabourHireShell.jsx  (REPLACE ENTIRE FILE)
 * IMPORTANT:
 * - DO NOT render a second sidebar here.
 * - Your existing Layout.jsx sidebar is the only sidebar.
 **************************************************************************************************/
import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import PortalSwitchButton, { getPortalOverride } from "@/businessUnits/LABOURHIRE/components/PortalSwitchButton.jsx";
import { getCurrentPortal } from "@/businessUnits/LABOURHIRE/api/labourHireApi.js";

export default function LabourHireShell() {
    const nav = useNavigate();
    const loc = useLocation();

    const [resolvedPortal, setResolvedPortal] = useState(null);
    const overridePortal = getPortalOverride();

    const portal = useMemo(() => {
        const o = String(overridePortal || "").toLowerCase();
        if (o === "manager" || o === "company" || o === "candidate") return o;
        return resolvedPortal;
    }, [overridePortal, resolvedPortal]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const p = await getCurrentPortal();
                if (!alive) return;
                setResolvedPortal(p || "manager");
            } catch {
                if (!alive) return;
                setResolvedPortal("manager");
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        // If a user hits /labourhire directly, send them somewhere sensible once portal resolves
        if (!portal) return;
        if (loc.pathname === "/labourhire" || loc.pathname === "/labourhire/") {
            if (portal === "manager") nav("/labourhire/manager/dashboard", { replace: true });
            if (portal === "company") nav("/labourhire/company/dashboard", { replace: true });
            if (portal === "candidate") nav("/labourhire/candidate/profile", { replace: true });
        }
    }, [portal, loc.pathname, nav]);

    return (
        <>
            <Outlet />
            <PortalSwitchButton resolvedPortal={portal || resolvedPortal || "manager"} />
        </>
    );
}