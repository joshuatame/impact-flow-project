/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/lib/rates.js  (CREATE THIS FILE)
 **************************************************************************************************/
export function formatMoney(n) {
    const v = Number(n || 0);
    return v.toLocaleString(undefined, { style: "currency", currency: "AUD" });
}

export function dayKeyToLabel(k) {
    switch (k) {
        case "weekday":
            return "Weekday";
        case "saturday":
            return "Saturday";
        case "sunday":
            return "Sunday";
        case "publicHoliday":
            return "Public holiday";
        default:
            return String(k || "Day");
    }
}

function roundTo(value, step) {
    const v = Number(value || 0);
    const s = Number(step || 0);
    if (!s) return v;
    return Math.round(v / s) * s;
}

/**
 * awardRateTable (shape)
 * {
 *   rates: {
 *     [classification]: {
 *       weekday: number, saturday: number, sunday: number, publicHoliday: number
 *     }
 *   },
 *   effectiveFrom: "YYYY-MM-DD",
 *   awardId, awardCode?
 * }
 *
 * marginRule (shape)
 * { type: "percentage"|"fixed"|"blended", percentage?: 0.25, fixedPerHour?: 8, roundingStep?: 0.05 }
 */
export function computeRateSnapshot({ awardRateTable, marginRule, classification, effectiveFromISO }) {
    if (!awardRateTable) throw new Error("Missing awardRateTable");
    if (!marginRule) throw new Error("Missing marginRule");
    if (!classification) throw new Error("Missing classification");

    const rates = awardRateTable?.rates || {};
    const base = rates?.[classification];
    if (!base) throw new Error(`No base rates for classification "${classification}"`);

    const dayTypes = ["weekday", "saturday", "sunday", "publicHoliday"];
    const pay = {};
    const bill = {};

    const type = String(marginRule.type || "percentage");
    const pct = Number(marginRule.percentage || 0);
    const fixed = Number(marginRule.fixedPerHour || 0);
    const roundingStep = marginRule.roundingStep != null ? Number(marginRule.roundingStep) : 0.05;

    dayTypes.forEach((d) => {
        const basePay = Number(base?.[d] ?? 0);
        if (!basePay) {
            pay[d] = 0;
            bill[d] = 0;
            return;
        }
        pay[d] = roundTo(basePay, roundingStep);

        let client = basePay;
        if (type === "percentage") client = basePay * (1 + pct);
        else if (type === "fixed") client = basePay + fixed;
        else if (type === "blended") client = basePay * (1 + pct) + fixed;

        bill[d] = roundTo(client, roundingStep);
    });

    return {
        version: "v1",
        source: {
            awardId: awardRateTable.awardId || null,
            awardCode: awardRateTable.awardCode || null,
            awardRateTableId: awardRateTable.id || null,
            marginRuleId: marginRule.id || null,
            effectiveFromISO: effectiveFromISO || awardRateTable.effectiveFrom || null,
            classification,
        },
        pay,
        bill,
        roundingStep,
        marginRule: {
            type,
            percentage: pct,
            fixedPerHour: fixed,
        },
    };
}
