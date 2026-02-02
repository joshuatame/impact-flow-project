/**************************************************************************************************
 * FILE: src/businessUnits/sidebars/LabourhireSidebar.jsx  (REPLACE ENTIRE FILE)
 * IMPORTANT: Layout.jsx expects: { name, icon, page, badge? }
 * We set `page` to real paths (NO leading slash) so createPageUrl works safely.
 **************************************************************************************************/
import { LayoutDashboard, Building2, Users, Clock, FileText } from "lucide-react";

export const labourhireNavItems = [
    { name: "Dashboard", icon: LayoutDashboard, page: "labourhire/manager/dashboard" },
    { name: "Companies", icon: Building2, page: "labourhire/manager/companies" },
    { name: "Candidates", icon: Users, page: "labourhire/manager/candidates" },
    { name: "Timesheets", icon: Clock, page: "labourhire/manager/timesheets" },
    { name: "Quotes", icon: FileText, page: "labourhire/manager/quotes" },
];

// Layout does NOT render this component; it only consumes `labourhireNavItems`.
export default function LabourhireSidebar() {
    return null;
}

