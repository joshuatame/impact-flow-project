import React from "react";
import {
    Shield,
    Users,
    Database,
    ClipboardList,
    FileText,
    Upload,
    Mail,
    Settings,
    BookOpen,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/ui/PageHeader.jsx";

import UsersTab from "@/components/admin/tabs/UsersTab.jsx";
import ReportsExportsTab from "@/components/admin/tabs/ReportsExportsTab.jsx";
import DexTab from "@/components/admin/tabs/DexTab.jsx";
import SurveysTab from "@/components/admin/tabs/SurveysTab.jsx";
import PdfTab from "@/components/admin/tabs/PdfTab.jsx";
import BulkUploadTab from "@/components/admin/tabs/BulkUploadTab.jsx";
import EmailsTab from "@/components/admin/tabs/EmailsTab.jsx";
import SettingsTab from "@/components/admin/tabs/SettingsTab.jsx";
import IntakesTab from "@/components/admin/tabs/IntakesTab.jsx";
import GuideTab from "@/components/admin/tabs/GuideTab.jsx";

export default function AdminTabsPage({ entityId, entityType, config }) {
    return (
        <div className="p-4 md:p-8 space-y-6">
            <PageHeader
                title="Admin"
                subtitle={`Manage this business unit (${entityType})`}
                icon={Shield}
            />

            <Tabs defaultValue="users" className="w-full">
                <TabsList className="bg-slate-900/50 border border-slate-800">
                    <TabsTrigger value="users" className="data-[state=active]:bg-slate-800">
                        <Users className="h-4 w-4 mr-2" />
                        Users
                    </TabsTrigger>

                    <TabsTrigger value="reports" className="data-[state=active]:bg-slate-800">
                        <Database className="h-4 w-4 mr-2" />
                        Reports / Exports
                    </TabsTrigger>

                    {config?.showDex && (
                        <TabsTrigger value="dex" className="data-[state=active]:bg-slate-800">
                            <Database className="h-4 w-4 mr-2" />
                            DEX
                        </TabsTrigger>
                    )}

                    <TabsTrigger value="surveys" className="data-[state=active]:bg-slate-800">
                        <ClipboardList className="h-4 w-4 mr-2" />
                        Surveys
                    </TabsTrigger>

                    <TabsTrigger value="pdf" className="data-[state=active]:bg-slate-800">
                        <FileText className="h-4 w-4 mr-2" />
                        PDFs
                    </TabsTrigger>

                    <TabsTrigger value="bulkUpload" className="data-[state=active]:bg-slate-800">
                        <Upload className="h-4 w-4 mr-2" />
                        Bulk Upload
                    </TabsTrigger>

                    <TabsTrigger value="emails" className="data-[state=active]:bg-slate-800">
                        <Mail className="h-4 w-4 mr-2" />
                        Emails
                    </TabsTrigger>

                    <TabsTrigger value="settings" className="data-[state=active]:bg-slate-800">
                        <Settings className="h-4 w-4 mr-2" />
                        Settings
                    </TabsTrigger>

                    <TabsTrigger value="intakes" className="data-[state=active]:bg-slate-800">
                        <BookOpen className="h-4 w-4 mr-2" />
                        Intakes
                    </TabsTrigger>

                    <TabsTrigger value="guide" className="data-[state=active]:bg-slate-800">
                        <FileText className="h-4 w-4 mr-2" />
                        Guide
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="users">
                    <UsersTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                <TabsContent value="reports">
                    <ReportsExportsTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                {config?.showDex && (
                    <TabsContent value="dex">
                        <DexTab entityId={entityId} entityType={entityType} />
                    </TabsContent>
                )}

                <TabsContent value="surveys">
                    <SurveysTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                <TabsContent value="pdf">
                    <PdfTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                <TabsContent value="bulkUpload">
                    <BulkUploadTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                <TabsContent value="emails">
                    <EmailsTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                <TabsContent value="settings">
                    <SettingsTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                <TabsContent value="intakes">
                    <IntakesTab entityId={entityId} entityType={entityType} />
                </TabsContent>

                <TabsContent value="guide">
                    <GuideTab entityType={entityType} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
