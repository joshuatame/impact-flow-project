/**************************************************************************************************
    * FILE: src/businessUnits/sidebars/getSidebarForEntityType.js
    **************************************************************************************************/
import { caseworkNavItems } from "./CaseworkSidebar.jsx";
import { programsNavItems } from "./ProgramsSidebar.jsx";
import { rtoNavItems } from "./RtoSidebar.jsx";
import { labourhireNavItems } from "./LabourhireSidebar.jsx";
import { systemAdminNavItems } from "./SystemAdminSidebar.jsx";


export function getNavItemsForEntityType(entityType) {
    switch ((entityType || "").toUpperCase()) {
        case "SYSTEMADMIN":
            return systemAdminNavItems;
        case "PROGRAMS":
            return programsNavItems;
        case "RTO":
            return rtoNavItems;
        case "LABOURHIRE":
            return labourhireNavItems;
        case "CASEWORK":
        default:
            return caseworkNavItems;
    }
}

export function getEntityTypeSubtitle(entityType) {
    switch ((entityType || "").toUpperCase()) {
        case "SYSTEMADMIN":
            return "System Administration";
        case "PROGRAMS":
            return "Programs";
        case "RTO":
            return "RTO Lead gen + enrolments";
        case "LABOURHIRE":
            return "Labourhire / Subcontracting";
        case "CASEWORK":
        default:
            return "Case Management";
    }
}