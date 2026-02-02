/**************************************************************************************************
 * FILE: src/pages/Layout.jsx  (REPLACE ENTIRE FILE)
 * Fixes:
 * - Forces entityType to LABOURHIRE when on /labourhire/*
 * - Active highlighting works for "page" values that are real paths (contain "/")
 * - Uses stable keys: item.page || item.name
 **************************************************************************************************/
import React, { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import {
    Settings,
    Menu,
    X,
    LogOut,
    ChevronDown,
    Building2,
    ClipboardCheck,
    Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import QuickAddMenu from "@/components/QuickAddMenu.jsx";
import ApprovalBadge from "@/components/ApprovalBadge.jsx";
import TaskBadge from "@/components/TaskBadge.jsx";
import ForumBadge from "@/components/ForumBadge.jsx";
import PendingRequestsBadge from "@/components/PendingRequestsBadge.jsx";
import NotificationBell from "@/components/NotificationBell.jsx";
import NotificationListener from "@/components/NotificationListener.jsx";
import { Toaster } from "@/components/ui/toaster";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/context/AuthContext";
import FCMForegroundListener from "@/components/FCMForegroundListener.jsx";

import { getActiveEntity, clearActiveEntity } from "@/lib/activeEntity";
import { getNavItemsForEntityType, getEntityTypeSubtitle } from "@/businessUnits/sidebars/getSidebarForEntityType";

function isApproverRole(role) {
    return role === "SystemAdmin" || role === "Manager" || role === "ContractsAdmin";
}

function normalizePathPage(page) {
    const p = String(page || "").replace(/^\/+/, "");
    return `/${p}`;
}

function isPathPage(page) {
    return String(page || "").includes("/");
}

export default function Layout({ children, currentPageName }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
    const [sidebarAccountMenuOpen, setSidebarAccountMenuOpen] = useState(false);

    const [activeEntityState, setActiveEntityState] = useState(() => getActiveEntity() || null);

    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { user, logout } = useAuth();

    useEffect(() => {
        const onStorage = () => setActiveEntityState(getActiveEntity() || null);

        window.addEventListener("storage", onStorage);
        setActiveEntityState(getActiveEntity() || null);

        return () => window.removeEventListener("storage", onStorage);
    }, [location.pathname]);

    const handleLogout = () => logout();

    const prefetchResources = () => {
        queryClient.prefetchQuery({
            queryKey: ["resources"],
            queryFn: () => base44.entities.Resource.list("-created_date", 1000),
            staleTime: 5 * 60 * 1000,
        });
    };

    const viewAsRole = user?.view_as_role || null;
    const realRole = user?.app_role;
    const effectiveRoleForUI = viewAsRole || realRole;

    const isApprover = isApproverRole(realRole);
    const canApprove = isApprover;

    // ✅ FORCE LabourHire sidebar for /labourhire/* regardless of active entity selection
    const forcedEntityType = location.pathname.startsWith("/labourhire") ? "LABOURHIRE" : null;

    const activeEntityType = forcedEntityType || activeEntityState?.type || "";
    const subtitle = activeEntityState?.name || getEntityTypeSubtitle(activeEntityType);

    const navItems = useMemo(() => getNavItemsForEntityType(activeEntityType), [activeEntityType]);

    const allNavItems = useMemo(() => {
        const extras = [
            {
                name: "Pending Requests",
                icon: ClipboardCheck,
                page: "WorkflowApprovals",
                badge: "PendingRequestsBadge",
            },
            ...(isApprover ? [{ name: "Admin", icon: Settings, page: "Admin" }] : []),
        ];
        return [...navItems, ...extras];
    }, [navItems, isApprover]);

    const getInitials = (name) => {
        if (!name) return "U";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    const handleSwitchBusinessUnit = () => {
        setMobileAccountMenuOpen(false);
        setSidebarAccountMenuOpen(false);

        clearActiveEntity();

        requestAnimationFrame(() => {
            window.location.assign("/Launchpad");
        });
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <NotificationListener />
            <FCMForegroundListener />
            <Toaster />

            <style>{`
        :root {
          --background: 222.2 84% 4.9%;
          --foreground: 210 40% 98%;
          --card: 222.2 84% 6%;
          --card-foreground: 210 40% 98%;
          --popover: 222.2 84% 6%;
          --popover-foreground: 210 40% 98%;
          --primary: 217.2 91.2% 59.8%;
          --primary-foreground: 222.2 47.4% 11.2%;
          --secondary: 217.2 32.6% 17.5%;
          --secondary-foreground: 210 40% 98%;
          --muted: 217.2 32.6% 17.5%;
          --muted-foreground: 215 20.2% 65.1%;
          --accent: 217.2 32.6% 17.5%;
          --accent-foreground: 210 40% 98%;
          --destructive: 0 62.8% 30.6%;
          --destructive-foreground: 210 40% 98%;
          --border: 217.2 32.6% 17.5%;
          --input: 217.2 32.6% 17.5%;
          --ring: 224.3 76.3% 48%;
          --radius: 0.75rem;
        }
        body { background-color: rgb(2, 6, 23); }
      `}</style>

            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-b border-slate-800">
                <div className="flex items-center justify-between px-4 h-16">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(true)}
                        className="text-slate-400 hover:text-white hover:bg-slate-800"
                        type="button"
                    >
                        <Menu className="h-6 w-6" />
                    </Button>

                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex flex-col leading-tight">
                            <span className="font-semibold text-lg">ImpactCentral</span>
                            <span className="text-[10px] text-slate-400">{subtitle}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <NotificationBell />
                        {canApprove && <ApprovalBadge />}

                        <DropdownMenu open={mobileAccountMenuOpen} onOpenChange={setMobileAccountMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="rounded-full" type="button">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-slate-700 text-sm">
                                            {getInitials(user?.full_name)}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-56 bg-slate-900 border-slate-800">
                                <DropdownMenuItem className="text-slate-300" disabled>
                                    {user?.email}
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    className="text-slate-200"
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        handleSwitchBusinessUnit();
                                    }}
                                >
                                    <Repeat className="mr-2 h-4 w-4" />
                                    Switch business unit
                                </DropdownMenuItem>

                                <DropdownMenuSeparator className="bg-slate-800" />

                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        handleLogout();
                                    }}
                                    className="text-red-400 focus:text-red-400"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed top-0 left-0 z-50 h-full w-72 bg-slate-900/95 backdrop-blur-xl border-r border-slate-800 transition-transform duration-300 ease-in-out",
                    "lg:translate-x-0",
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between px-6 h-20 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <Building2 className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <span className="font-bold text-xl">ImpactCentral</span>
                                <p className="text-xs text-slate-500">{subtitle}</p>
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden text-slate-400 hover:text-white"
                            type="button"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="px-4 pt-4">
                        <QuickAddMenu />
                    </div>

                    <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
                        {allNavItems.map((item) => {
                            const target = isPathPage(item.page) ? normalizePathPage(item.page) : createPageUrl(item.page);
                            const isActive = isPathPage(item.page)
                                ? location.pathname.startsWith(target)
                                : currentPageName === item.page;

                            const isResources = item.page === "Resources";

                            return (
                                <Link
                                    key={item.page || item.name}
                                    to={target}
                                    onClick={() => setSidebarOpen(false)}
                                    onMouseEnter={isResources ? prefetchResources : undefined}
                                    className={cn(
                                        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                                        isActive
                                            ? "bg-blue-600/20 text-blue-400 shadow-lg shadow-blue-500/10"
                                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                                    )}
                                >
                                    <item.icon className={cn("h-5 w-5", isActive && "text-blue-400")} />
                                    <span className="font-medium flex-1">{item.name}</span>
                                    {item.badge === "TaskBadge" && <TaskBadge />}
                                    {item.badge === "ForumBadge" && <ForumBadge />}
                                    {item.badge === "PendingRequestsBadge" && <PendingRequestsBadge />}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-slate-800">
                        <DropdownMenu open={sidebarAccountMenuOpen} onOpenChange={setSidebarAccountMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800/50 transition-colors"
                                >
                                    <Avatar className="h-10 w-10">
                                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-600 text-white">
                                            {getInitials(user?.full_name)}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="flex-1 text-left">
                                        <p className="font-medium text-sm text-white">{user?.full_name || "User"}</p>
                                        <p className="text-xs text-slate-500">{effectiveRoleForUI || "Member"}</p>
                                    </div>

                                    <ChevronDown className="h-4 w-4 text-slate-500" />
                                </button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end" className="w-56 bg-slate-900 border-slate-800">
                                <DropdownMenuItem asChild>
                                    <Link to={createPageUrl("Settings")} className="cursor-pointer">
                                        <Settings className="mr-2 h-4 w-4" />
                                        Settings
                                    </Link>
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                    className="text-slate-200"
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        handleSwitchBusinessUnit();
                                    }}
                                >
                                    <Repeat className="mr-2 h-4 w-4" />
                                    Switch business unit
                                </DropdownMenuItem>

                                <DropdownMenuSeparator className="bg-slate-800" />

                                <DropdownMenuItem
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        handleLogout();
                                    }}
                                    className="text-red-400 focus:text-red-400"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </aside>

            <main className="lg:ml-72 min-h-screen">
                <div className="pt-16 lg:pt-0">{children}</div>
            </main>

            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-area-bottom">
                <div className="flex items-center justify-around py-2">
                    {navItems.slice(0, 4).map((item) => {
                        const target = isPathPage(item.page) ? normalizePathPage(item.page) : createPageUrl(item.page);
                        const isActive = isPathPage(item.page)
                            ? location.pathname.startsWith(target)
                            : currentPageName === item.page;

                        return (
                            <Link
                                key={item.page || item.name}
                                to={target}
                                className={cn(
                                    "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors",
                                    isActive ? "text-blue-400" : "text-slate-500"
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                <span className="text-xs font-medium">{item.name}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}