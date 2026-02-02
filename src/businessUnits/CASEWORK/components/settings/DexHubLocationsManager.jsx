import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, AlertCircle } from "lucide-react";

function safeText(v) {
    return typeof v === "string" ? v : v == null ? "" : String(v);
}

function isActiveRow(row) {
    const st = safeText(row?.status).trim().toLowerCase();
    if (!st) return true;
    return st === "active";
}

/**
 * DexHubLocationsManager
 * - Manages DexCaseLocationOption records
 * - Use in System Settings (the "blank box under onboarding tasks")
 */
export default function DexHubLocationsManager() {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [error, setError] = useState("");

    const { data: locations = [], isLoading } = useQuery({
        queryKey: ["dexHubLocations"],
        queryFn: () => base44.entities.DexCaseLocationOption.list("-created_date", 500),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    });

    const active = useMemo(() => {
        const arr = Array.isArray(locations) ? locations : [];
        return arr
            .filter(isActiveRow)
            .sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name)));
    }, [locations]);

    const addMutation = useMutation({
        mutationFn: async () => {
            setError("");
            const trimmed = safeText(name).trim();
            if (!trimmed) throw new Error("Enter a hub location name.");

            const exists = active.some(
                (x) => safeText(x?.name).trim().toLowerCase() === trimmed.toLowerCase()
            );
            if (exists) throw new Error("That hub location already exists.");

            await base44.entities.DexCaseLocationOption.create({
                name: trimmed,
                status: "Active",
            });
        },
        onSuccess: async () => {
            setName("");
            await queryClient.invalidateQueries({ queryKey: ["dexHubLocations"] });
        },
        onError: (e) => setError(e?.message || "Failed to add hub location."),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            setError("");
            if (!id) return;
            // Hard delete is fine since you're purging pre-prod anyway.
            await base44.entities.DexCaseLocationOption.delete(id);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["dexHubLocations"] });
        },
        onError: (e) => setError(e?.message || "Failed to delete hub location."),
    });

    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white">DEX Hub Locations</CardTitle>
                <p className="text-sm text-slate-400">
                    These populate the “DEX Hub Location” dropdown when enrolling participants into
                    DEX-reportable programs.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {error ? (
                    <Alert className="bg-red-500/10 border-red-500/20">
                        <AlertCircle className="h-4 w-4 text-red-400" />
                        <AlertDescription className="text-red-300">{error}</AlertDescription>
                    </Alert>
                ) : null}

                <div className="flex gap-2">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Add hub location (e.g., South Hub)"
                        className="bg-slate-800 border-slate-700 text-white"
                    />
                    <Button
                        type="button"
                        onClick={() => addMutation.mutate()}
                        disabled={addMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add
                    </Button>
                </div>

                {isLoading ? (
                    <div className="text-slate-400 text-sm">Loading...</div>
                ) : active.length === 0 ? (
                    <div className="text-slate-400 text-sm">No hub locations yet.</div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {active.map((loc) => (
                            <span key={loc.id} className="inline-flex items-center gap-2">
                                <Badge className="bg-slate-800 text-slate-200 border border-slate-700">
                                    {safeText(loc?.name).trim() || "Unnamed"}
                                </Badge>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="text-slate-400 hover:text-red-300"
                                    onClick={() => deleteMutation.mutate(loc.id)}
                                    disabled={deleteMutation.isPending}
                                    title="Delete"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </span>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
