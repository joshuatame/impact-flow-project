export const BUSINESS_UNIT_CONFIG = {
    Casework: { showDex: true },
    Programs: { showDex: false },
    RTO: { showDex: false },
    LabourHire: { showDex: false },
    // add your real types here (must match businessEntities.type exactly)
};

export function getBusinessUnitConfig(type) {
    return BUSINESS_UNIT_CONFIG[type] || { showDex: false };
}
