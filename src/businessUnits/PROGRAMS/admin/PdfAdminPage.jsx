import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { FileText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function PdfAdminPage() {
    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    PDF Templates
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                <p className="text-slate-400">
                    Upload and manage PDF templates used for workflow-gated onboarding forms.
                </p>

                <Link to={createPageUrl("PdfTemplateAdmin")}>
                    <Button className="bg-blue-600 hover:bg-blue-700" type="button">
                        <FileText className="h-4 w-4 mr-2" />
                        Open PDF Template Admin
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
}
