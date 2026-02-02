/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/lib/timesheets.js  (REPLACE ENTIRE FILE)
 **************************************************************************************************/
import {
    addDays,
    differenceInMinutes,
    format,
    isAfter,
    isBefore,
    isSameDay,
    parseISO,
    startOfDay,
} from "date-fns";

/**
 * LabourHire Timesheets Utilities
 *
 * - All functions are pure (no IO)
 * - Dates can be ISO strings, Firestore Timestamp, or Date objects
 */

/* ================================================================================================
 * Internal date helpers
 * ================================================================================================ */
function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === "string") return parseISO(v);
    if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
    try {
        return new Date(v);
    } catch {
        return null;
    }
}

/**
 * Exported because other modules may rely on it.
 * Returns YYYY-MM-DD for Date-like input. If already string, returns it unchanged.
 */
export function toISODate(d) {
    if (typeof d === "string") return d;
    const dt = toDate(d);
    if (!dt) return null;
    return format(dt, "yyyy-MM-dd");
}

/* ================================================================================================
 * Shifts
 * ================================================================================================ */
export function normalizeShift(shift) {
    const start = toDate(shift?.start || shift?.startAt || shift?.startTime);
    const end = toDate(shift?.end || shift?.endAt || shift?.endTime);

    return {
        ...shift,
        start,
        end,
        startDate: start ? startOfDay(start) : null,
        endDate: end ? startOfDay(end) : null,
        startISO: start ? start.toISOString() : null,
        endISO: end ? end.toISOString() : null,
        dateISO: start ? toISODate(start) : null,
    };
}

export function getShiftMinutes(shift) {
    const s = normalizeShift(shift);
    if (!s.start || !s.end) return 0;
    const mins = differenceInMinutes(s.end, s.start);
    return Math.max(0, mins);
}

export function getShiftHours(shift, decimals = 2) {
    const mins = getShiftMinutes(shift);
    const hours = mins / 60;
    const factor = Math.pow(10, decimals);
    return Math.round(hours * factor) / factor;
}

export function clampShiftToDay(shift, day) {
    const s = normalizeShift(shift);
    const d = toDate(day);
    if (!s.start || !s.end || !d) return s;

    const dayStart = startOfDay(d);
    const dayEnd = addDays(dayStart, 1);

    const start = isBefore(s.start, dayStart) ? dayStart : s.start;
    const end = isAfter(s.end, dayEnd) ? dayEnd : s.end;

    return normalizeShift({ ...shift, start, end });
}

export function splitShiftByDay(shift) {
    const s = normalizeShift(shift);
    if (!s.start || !s.end) return [];

    const out = [];
    let cursor = s.start;

    while (cursor && isBefore(cursor, s.end)) {
        const dayStart = startOfDay(cursor);
        const dayEnd = addDays(dayStart, 1);
        const end = isAfter(s.end, dayEnd) ? dayEnd : s.end;

        out.push(
            normalizeShift({
                ...shift,
                start: cursor,
                end,
                _split: true,
            })
        );

        cursor = end;
    }

    return out;
}

export function groupShiftsByDate(shifts) {
    const map = new Map();
    (Array.isArray(shifts) ? shifts : []).forEach((raw) => {
        const s = normalizeShift(raw);
        if (!s.start) return;
        const key = s.dateISO || "unknown";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
    });

    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateISO, items]) => ({ dateISO, items }));
}

export function sumHours(shifts, decimals = 2) {
    const total = (Array.isArray(shifts) ? shifts : []).reduce(
        (acc, s) => acc + getShiftHours(s, 6),
        0
    );
    const factor = Math.pow(10, decimals);
    return Math.round(total * factor) / factor;
}

export function getOverlappingMinutes(a, b) {
    const A = normalizeShift(a);
    const B = normalizeShift(b);
    if (!A.start || !A.end || !B.start || !B.end) return 0;

    const start = isAfter(A.start, B.start) ? A.start : B.start;
    const end = isBefore(A.end, B.end) ? A.end : B.end;

    if (!start || !end || !isBefore(start, end)) return 0;
    return differenceInMinutes(end, start);
}

export function hasOverlap(a, b) {
    return getOverlappingMinutes(a, b) > 0;
}

export function sortByStart(shifts) {
    return (Array.isArray(shifts) ? shifts : [])
        .map(normalizeShift)
        .sort((x, y) => (x.start?.getTime?.() || 0) - (y.start?.getTime?.() || 0));
}

export function filterByDay(shifts, day) {
    const d = toDate(day);
    if (!d) return [];
    return (Array.isArray(shifts) ? shifts : []).filter((s) => {
        const ns = normalizeShift(s);
        if (!ns.start) return false;
        return isSameDay(ns.start, d);
    });
}

export function validateShift(shift) {
    const s = normalizeShift(shift);
    if (!s.start || !s.end) return { ok: false, reason: "Missing start or end." };
    if (!isBefore(s.start, s.end)) return { ok: false, reason: "End must be after start." };
    return { ok: true };
}

export function summarizeDay(shifts, day) {
    const items = filterByDay(shifts, day);
    const totalHours = sumHours(items);
    return { dateISO: toISODate(day), count: items.length, totalHours, items: sortByStart(items) };
}

/* ================================================================================================
 * Week + Timesheet helpers (this is what ManagerDashboard.jsx expects)
 * ================================================================================================ */
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_ORDER_KEYS = DAY_ORDER;

export function startOfWeekISO(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay(); // 0 Sun, 1 Mon...
    const diff = (day === 0 ? -6 : 1) - day; // move to Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return toISODate(d);
}

export function addDaysISO(weekStartISO, days) {
    const d = new Date(`${weekStartISO}T00:00:00`);
    d.setDate(d.getDate() + Number(days || 0));
    d.setHours(0, 0, 0, 0);
    return toISODate(d);
}

export function emptyDays() {
    return DAY_ORDER.reduce((acc, k) => {
        acc[k] = { hours: 0, breakHours: 0, notes: "" };
        return acc;
    }, {});
}

export function calcTotals(days) {
    const safeDays = days || emptyDays();
    let hours = 0;
    let breaks = 0;

    DAY_ORDER.forEach((k) => {
        hours += Number(safeDays?.[k]?.hours || 0);
        breaks += Number(safeDays?.[k]?.breakHours || 0);
    });

    const payableHours = Math.max(0, hours - breaks);

    return {
        hours: Number(hours.toFixed(2)),
        breaks: Number(breaks.toFixed(2)),
        payableHours: Number(payableHours.toFixed(2)),
    };
}

export function validateTimesheet(days) {
    const errs = [];
    DAY_ORDER.forEach((k) => {
        const h = Number(days?.[k]?.hours || 0);
        const b = Number(days?.[k]?.breakHours || 0);
        if (h < 0 || b < 0) errs.push(`${k}: negative values not allowed`);
        if (b > h) errs.push(`${k}: break hours cannot exceed hours`);
        if (h > 24) errs.push(`${k}: hours > 24 seems invalid`);
        if (b > 8) errs.push(`${k}: break hours > 8 seems invalid`);
    });
    return { ok: errs.length === 0, errors: errs };
}

export function canEdit(status) {
    return status === "draft" || status === "returned";
}

export function allowedNextStatuses(status, actor) {
    const by = actor; // "candidate" | "company" | "manager"
    if (by === "candidate") {
        if (status === "draft" || status === "returned") return ["submitted"];
        return [];
    }
    if (by === "company") {
        if (status === "submitted") return ["approved_by_company", "returned"];
        return [];
    }
    if (by === "manager") {
        if (status === "approved_by_company") return ["approved_by_manager"];
        if (status === "approved_by_manager") return ["sent_to_payroll"];
        if (status === "sent_to_payroll") return ["paid"];
        return [];
    }
    return [];
}

export function dayLabel(k) {
    const m = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
    return m[k] || k;
}

/* ================================================================================================
 * Award compliance (minimal viable)
 * ================================================================================================ */
export function getDefaultAwardComplianceConfig() {
    return {
        breakRequiredAfterHours: 5,
        minBreakHours: 0.5,
        maxDailyHours: 12,
        overtimeDailyAfterHours: 8,
    };
}

export function checkAwardCompliance({ days, awardConfig }) {
    const cfg = { ...getDefaultAwardComplianceConfig(), ...(awardConfig || {}) };
    const issues = [];

    DAY_ORDER.forEach((k) => {
        const h = Number(days?.[k]?.hours || 0);
        const b = Number(days?.[k]?.breakHours || 0);

        if (h >= cfg.breakRequiredAfterHours && b < cfg.minBreakHours) {
            issues.push(
                `${k}: break must be at least ${cfg.minBreakHours}h when working ${cfg.breakRequiredAfterHours}h+`
            );
        }
        if (h > cfg.maxDailyHours) {
            issues.push(`${k}: daily hours exceed ${cfg.maxDailyHours}h (award limit)`);
        }
    });

    return { ok: issues.length === 0, issues, config: cfg };
}
