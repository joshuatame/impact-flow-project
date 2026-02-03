// File: src/components/ui/LoadingSpinner.jsx
import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

function LoadingSpinner({ className, size = "default" }) {
    const sizes = {
        sm: "h-4 w-4",
        default: "h-8 w-8",
        lg: "h-12 w-12",
    };

    return (
        <div className={cn("flex items-center justify-center py-12", className)}>
            <Loader2 className={cn("animate-spin", sizes[size])} />
        </div>
    );
}

export { LoadingSpinner };
export default LoadingSpinner;
