/**************************************************************************************************
 * FILE: src/businessUnits/LABOURHIRE/api/labourHireApi.js  (REPLACE ENTIRE FILE)
 **************************************************************************************************/
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { httpsCallable, getFunctions } from "firebase/functions";

import { auth, db, storage } from "../../../firebase";

const BU = "LABOURHIRE";

/* ================================================================================================
 * Helpers
 * ================================================================================================ */
function requireUid(user) {
    const u = user || auth.currentUser;
    const uid = u?.uid;
    if (!uid) throw new Error("Not signed in.");
    return uid;
}

function nowIso() {
    return new Date().toISOString();
}

function withAuditPatch(patch, user) {
    const uid = requireUid(user);
    return {
        ...(patch || {}),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
    };
}

function baseCreate(user, extra = {}) {
    const uid = requireUid(user);
    return {
        businessUnit: BU,
        createdAt: serverTimestamp(),
        createdBy: uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        ...extra,
    };
}

async function getDocData(ref) {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
}

function token32() {
    try {
        const a = new Uint8Array(16);
        crypto.getRandomValues(a);
        return Array.from(a)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    } catch {
        return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
    }
}

function addDaysIso(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString();
}

/* ================================================================================================
 * WF CONNECT USER CONTEXT
 * ================================================================================================ */

/**
 * wfConnectUsers/{uid}
 * { uid, entityId, portal, roles: [], candidateId?, hiringCompanyId? }
 */
export async function getWfConnectUser(uid) {
    if (!uid) throw new Error("Missing uid.");
    return await getDocData(doc(db, "wfConnectUsers", uid));
}

// ✅ Create / update wfConnectUsers/{uid}
// Used so SystemAdmin can bootstrap LabourHire manager access even if no LH config exists yet.
// ✅ Create / update wfConnectUsers/{uid}
// Used so SystemAdmin can bootstrap LabourHire manager access even if no LH config exists yet.
export async function upsertWfConnectUser({
    uid,
    entityId,
    portal, // "manager" | "company" | "candidate"
    roles = [],
    candidateId = null,
    hiringCompanyId = null,
    user,
}) {
    const actorUid = requireUid(user);
    const targetUid = uid || actorUid;

    const ref = doc(db, "wfConnectUsers", targetUid);

    const payload = {
        uid: targetUid,
        businessUnit: BU,
        entityId: entityId || null,
        portal: portal || null,
        roles: Array.isArray(roles) ? roles : [],
        candidateId: candidateId || null,
        hiringCompanyId: hiringCompanyId || null,
        ...withAuditPatch({}, user),
    };

    // If doc doesn't exist yet, merge will create it.
    await setDoc(ref, payload, { merge: true });
    return true;
}

/**
 * Determines current portal from wfConnectUsers doc.
 * IMPORTANT: manager roles MUST win.
 * @returns {"candidate"|"company"|"manager"|null}
 */
export async function getCurrentPortal() {
    const uid = requireUid();
    const wf = await getWfConnectUser(uid);
    if (!wf) return null;

    const roles = Array.isArray(wf.roles) ? wf.roles : [];

    // ✅ Manager wins no matter what portal field says
    if (roles.includes("LabourHireManager") || roles.includes("Admin") || roles.includes("SystemAdmin")) {
        return "manager";
    }
    if (roles.includes("CandidateUser")) return "candidate";
    if (roles.includes("CompanyUser")) return "company";

    // fallback to portal string ONLY if roles not present
    const portal = String(wf.portal || "").toLowerCase();
    if (portal === "candidate" || portal === "company" || portal === "manager") return portal;

    return null;
}

export async function getCandidateForCurrentUser() {
    const uid = requireUid();
    const wf = await getWfConnectUser(uid);
    if (!wf?.candidateId) throw new Error("No candidate linked to this user.");
    const c = await getDocData(doc(db, "candidates", wf.candidateId));
    if (!c) throw new Error("Candidate record not found.");
    return c;
}

export async function getHiringCompanyForCurrentUser() {
    const uid = requireUid();
    const wf = await getWfConnectUser(uid);
    if (!wf?.hiringCompanyId) throw new Error("No hiring company linked to this user.");
    const c = await getDocData(doc(db, "hiringCompanies", wf.hiringCompanyId));
    if (!c) throw new Error("Hiring company record not found.");
    return c;
}

/* ================================================================================================
 * INVITES (Candidate + Company)
 * ================================================================================================ */

/**
 * candidateInvites/{token}
 * companyInvites/{token}
 * Returns {_kind: "candidate"|"company"} for caller validation.
 */
export async function getInviteByToken(token) {
    if (!token) return null;

    const cand = await getDocData(doc(db, "candidateInvites", token));
    if (cand) return { ...cand, _kind: "candidate", token };

    const comp = await getDocData(doc(db, "companyInvites", token));
    if (comp) return { ...comp, _kind: "company", token };

    return null;
}

export async function markInviteUsed({ token, kind, user }) {
    if (!token) throw new Error("Missing token.");
    const uid = requireUid(user);

    const col = kind === "company" ? "companyInvites" : "candidateInvites";
    const ref = doc(db, col, token);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Invite not found.");

    await updateDoc(ref, {
        usedAt: serverTimestamp(),
        usedBy: uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
    });

    return true;
}

/**
 * Manager helper: create candidate invite doc and return token + url.
 */
export async function createCandidateInvite({ entityId, candidateId, email, expiresInDays = 7, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!candidateId) throw new Error("Missing candidateId.");
    if (!email) throw new Error("Missing email.");

    const uid = requireUid(user);
    const token = token32();

    await setDoc(
        doc(db, "candidateInvites", token),
        {
            businessUnit: BU,
            entityId,
            email,
            candidateId,
            expiresAt: addDaysIso(expiresInDays),
            createdAt: serverTimestamp(),
            createdBy: uid,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
        },
        { merge: true }
    );

    const url = `${window.location.origin}/labourhire/candidate/onboard/${token}`;
    return { token, url };
}

/**
 * Manager helper: create company invite doc and return token + url.
 */
export async function createCompanyInvite({ entityId, hiringCompanyId, email, expiresInDays = 7, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!hiringCompanyId) throw new Error("Missing hiringCompanyId.");
    if (!email) throw new Error("Missing email.");

    const uid = requireUid(user);
    const token = token32();

    await setDoc(
        doc(db, "companyInvites", token),
        {
            businessUnit: BU,
            entityId,
            email,
            hiringCompanyId,
            expiresAt: addDaysIso(expiresInDays),
            createdAt: serverTimestamp(),
            createdBy: uid,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
        },
        { merge: true }
    );

    const url = `${window.location.origin}/labourhire/company/onboard/${token}`;
    return { token, url };
}

/**
 * Optional (safe to call only if deployed)
 */
export async function sendInviteEmail({ kind, email, url }) {
    const fn = httpsCallable(getFunctions(), "wfConnectSendInviteEmail");
    const res = await fn({ kind, email, url });
    return res?.data || { ok: true };
}

/* ================================================================================================
 * CANDIDATES
 * ================================================================================================ */

export async function getCandidate(candidateId) {
    if (!candidateId) return null;
    return await getDocData(doc(db, "candidates", candidateId));
}

export async function createCandidate({ entityId, data = {}, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    const payload = {
        entityId,
        businessUnit: BU,
        status: data.status || "onboarding",
        profile: data.profile || {},
        checklist: data.checklist || { resume: false, id: false, tickets: false, licence: false },
        share: data.share || { enabled: true, allowCompanyIds: [] },
        ...baseCreate(user),
    };
    const ref = await addDoc(collection(db, "candidates"), payload);
    return ref.id;
}

export async function upsertCandidate({ entityId, candidateId, data, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!candidateId) throw new Error("Missing candidateId.");
    const ref = doc(db, "candidates", candidateId);

    await setDoc(
        ref,
        {
            businessUnit: BU,
            entityId,
            ...withAuditPatch(data || {}, user),
        },
        { merge: true }
    );

    return candidateId;
}

export async function listCandidates({ entityId, limitCount = 300 }) {
    if (!entityId) throw new Error("Missing entityId.");
    const qy = query(
        collection(db, "candidates"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ✅ Compatibility export used by ManagerRoleMatching.jsx */
export async function listCandidatesForEntity({ entityId, limitCount = 300 } = {}) {
    return await listCandidates({ entityId, limitCount });
}

/* ================================================================================================
 * COMPANIES
 * ================================================================================================ */

export async function getHiringCompany(hiringCompanyId) {
    if (!hiringCompanyId) return null;
    return await getDocData(doc(db, "hiringCompanies", hiringCompanyId));
}

export async function createHiringCompany({ entityId, data = {}, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    const payload = {
        entityId,
        businessUnit: BU,
        name: data.name || "New company",
        abn: data.abn || "",
        contacts: data.contacts || [],
        sites: data.sites || [],
        billing: data.billing || {},
        industries: data.industries || [],
        ...baseCreate(user),
    };
    const ref = await addDoc(collection(db, "hiringCompanies"), payload);
    return ref.id;
}

export async function listHiringCompanies({ entityId, limitCount = 300 }) {
    if (!entityId) throw new Error("Missing entityId.");
    const qy = query(
        collection(db, "hiringCompanies"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ================================================================================================
 * COMPANY: CANDIDATE PRESENTATIONS
 * ================================================================================================ */

export async function listCandidatePresentationsForCompany({ entityId, hiringCompanyId, limitCount = 200 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!hiringCompanyId) throw new Error("Missing hiringCompanyId.");

    const qy = query(
        collection(db, "candidatePresentations"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("hiringCompanyId", "==", hiringCompanyId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );

    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * ✅ Manager: present candidates to a company (bulk)
 * Creates docs in candidatePresentations.
 */
export async function createCandidatePresentations({ entityId, hiringCompanyId, candidateIds = [], user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!hiringCompanyId) throw new Error("Missing hiringCompanyId.");
    const uid = requireUid(user);

    const ids = Array.isArray(candidateIds) ? candidateIds.filter(Boolean) : [];
    if (!ids.length) return { count: 0 };

    let count = 0;
    for (const candidateId of ids) {
        const payload = {
            entityId,
            businessUnit: BU,
            hiringCompanyId,
            candidateId,
            status: "presented",
            audit: [
                {
                    at: nowIso(),
                    by: uid,
                    action: "presented",
                    note: "",
                },
            ],
            ...baseCreate(user),
        };
        await addDoc(collection(db, "candidatePresentations"), payload);
        count += 1;
    }
    return { count };
}

// ================================================================================================
// COMPANY: PRESENTATION DECISIONS (ADD THIS EXPORT)
// ================================================================================================
export async function updatePresentationDecision({
    entityId,
    presentationId,
    decision, // "accepted" | "declined" | "shortlisted" | etc
    note = "",
    user,
}) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!presentationId) throw new Error("Missing presentationId.");
    if (!decision) throw new Error("Missing decision.");

    const uid = requireUid(user);
    const ref = doc(db, "candidatePresentations", presentationId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Presentation not found.");

        const cur = snap.data() || {};
        const audit = Array.isArray(cur.audit) ? cur.audit : [];

        audit.push({
            at: nowIso(),
            by: uid,
            action: "decision",
            decision,
            note: String(note || ""),
        });

        tx.update(ref, {
            entityId,
            decision,
            decisionNote: String(note || ""),
            decidedAt: serverTimestamp(),
            decidedBy: uid,
            audit,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
        });
    });

    return true;
}

/* ================================================================================================
 * CANDIDATE DOCUMENTS (Storage + metadata in Firestore)
 * ================================================================================================ */

export async function listDocumentsForCandidate({ entityId, candidateId, limitCount = 200 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!candidateId) throw new Error("Missing candidateId.");

    const qy = query(
        collection(db, "candidateDocuments"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("candidateId", "==", candidateId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );

    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function uploadCandidateDocument({ entityId, candidateId, file, kind = "resume", user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!candidateId) throw new Error("Missing candidateId.");
    if (!file) throw new Error("Missing file.");

    const uid = requireUid(user);

    const safeName = String(file.name || "document").replace(/[^\w.\-() ]+/g, "_");
    const path = `wfconnect/${entityId}/candidates/${candidateId}/${kind}/${Date.now()}_${safeName}`;
    const sref = storageRef(storage, path);

    await uploadBytes(sref, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { businessUnit: BU, entityId, candidateId, kind, uploadedBy: uid },
    });

    const downloadUrl = await getDownloadURL(sref);

    const meta = {
        businessUnit: BU,
        entityId,
        candidateId,
        kind,
        fileName: safeName,
        size: file.size || null,
        contentType: file.type || null,
        storagePath: path,
        downloadUrl,
        ...baseCreate(user),
    };

    const docRef = await addDoc(collection(db, "candidateDocuments"), meta);
    return docRef.id;
}

/* ================================================================================================
 * PLACEMENTS
 * ================================================================================================ */

export async function listPlacementsForCandidate({ entityId, candidateId, statusList = ["active"], limitCount = 200 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!candidateId) throw new Error("Missing candidateId.");

    const filters = [
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("candidateId", "==", candidateId),
    ];

    if (Array.isArray(statusList) && statusList.length) {
        filters.push(where("status", "in", statusList.slice(0, 10)));
    }

    const qy = query(collection(db, "placements"), ...filters, orderBy("createdAt", "desc"), limit(limitCount));
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listPlacementsForCompany({ entityId, hiringCompanyId, statusList = ["active"], limitCount = 300 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!hiringCompanyId) throw new Error("Missing hiringCompanyId.");

    const filters = [
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("hiringCompanyId", "==", hiringCompanyId),
    ];

    if (Array.isArray(statusList) && statusList.length) {
        filters.push(where("status", "in", statusList.slice(0, 10)));
    }

    const qy = query(collection(db, "placements"), ...filters, orderBy("createdAt", "desc"), limit(limitCount));
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ✅ ManagerDashboard.jsx helper */
export async function listActivePlacements({ entityId, limitCount = 300 } = {}) {
    return await listPlacementsForEntity({ entityId, statusList: ["active"], limitCount });
}

async function listPlacementsForEntity({ entityId, statusList = ["active"], limitCount = 300 }) {
    if (!entityId) throw new Error("Missing entityId.");

    const filters = [where("businessUnit", "==", BU), where("entityId", "==", entityId)];
    if (Array.isArray(statusList) && statusList.length) {
        filters.push(where("status", "in", statusList.slice(0, 10)));
    }

    const qy = query(collection(db, "placements"), ...filters, orderBy("createdAt", "desc"), limit(limitCount));
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ================================================================================================
 * TIMESHEETS (Weeks)
 * ================================================================================================ */

export async function getTimesheetWeekById(timesheetId) {
    if (!timesheetId) return null;
    return await getDocData(doc(db, "timesheetWeeks", timesheetId));
}

export async function upsertTimesheetWeek({ entityId, timesheetId, patch, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!timesheetId) throw new Error("Missing timesheetId.");

    const uid = requireUid(user);
    const ref = doc(db, "timesheetWeeks", timesheetId);

    await setDoc(
        ref,
        {
            businessUnit: BU,
            entityId,
            ...withAuditPatch(patch || {}, user),
            _lastPatchedAtIso: nowIso(),
            _lastPatchedBy: uid,
        },
        { merge: true }
    );

    return timesheetId;
}

/**
 * Status transitions (soft-enforced)
 * draft, submitted, returned, approved_by_company, approved_by_manager, sent_to_payroll, paid
 */
export async function transitionTimesheetStatus({ timesheetId, nextStatus, note = "", user }) {
    if (!timesheetId) throw new Error("Missing timesheetId.");
    if (!nextStatus) throw new Error("Missing nextStatus.");

    const uid = requireUid(user);
    const ref = doc(db, "timesheetWeeks", timesheetId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Timesheet not found.");
        const cur = snap.data();
        const current = String(cur.status || "draft");

        const allowed = {
            draft: ["submitted"],
            submitted: ["returned", "approved_by_company"],
            returned: ["submitted"],
            approved_by_company: ["approved_by_manager", "returned"],
            approved_by_manager: ["sent_to_payroll"],
            sent_to_payroll: ["paid"],
            paid: [],
        };

        const ok = (allowed[current] || []).includes(nextStatus) || current === nextStatus;
        if (!ok) throw new Error(`Invalid transition: ${current} -> ${nextStatus}`);

        const audit = Array.isArray(cur.audit) ? cur.audit : [];
        audit.push({ at: nowIso(), by: uid, action: "status_change", from: current, to: nextStatus, note: String(note || "") });

        tx.update(ref, { status: nextStatus, audit, updatedAt: serverTimestamp(), updatedBy: uid });
    });

    return true;
}

export async function listTimesheetsForCompany({ entityId, hiringCompanyId, weekStartISO, statusIn = ["submitted", "returned"], limitCount = 500 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!hiringCompanyId) throw new Error("Missing hiringCompanyId.");
    if (!weekStartISO) throw new Error("Missing weekStartISO.");

    const qy = query(
        collection(db, "timesheetWeeks"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("hiringCompanyId", "==", hiringCompanyId),
        where("weekStartISO", "==", weekStartISO),
        where("status", "in", (statusIn || []).slice(0, 10)),
        orderBy("updatedAt", "desc"),
        limit(limitCount)
    );

    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** ✅ ManagerDashboard.jsx helper */
export async function listTimesheetsForManager({ entityId, weekStartISO, statusIn = ["submitted", "approved_by_company", "approved_by_manager", "sent_to_payroll"], limitCount = 800 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!weekStartISO) throw new Error("Missing weekStartISO.");

    const qy = query(
        collection(db, "timesheetWeeks"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("weekStartISO", "==", weekStartISO),
        where("status", "in", (statusIn || []).slice(0, 10)),
        orderBy("updatedAt", "desc"),
        limit(limitCount)
    );

    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchTimesheetsForManager(
    { entityId, weekStartISO, statusIn = ["submitted", "approved_by_company", "approved_by_manager", "sent_to_payroll"], limitCount = 800 },
    onData,
    onError
) {
    try {
        if (!entityId) throw new Error("Missing entityId.");
        if (!weekStartISO) throw new Error("Missing weekStartISO.");

        const qy = query(
            collection(db, "timesheetWeeks"),
            where("businessUnit", "==", BU),
            where("entityId", "==", entityId),
            where("weekStartISO", "==", weekStartISO),
            where("status", "in", (statusIn || []).slice(0, 10)),
            orderBy("updatedAt", "desc"),
            limit(limitCount)
        );

        return onSnapshot(
            qy,
            (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (err) => onError?.(err)
        );
    } catch (e) {
        onError?.(e);
        return () => { };
    }
}

/* ================================================================================================
 * AWARDS CATALOG + INTERPRETATIONS
 * ================================================================================================ */

export async function listAwardsCatalog({ limitCount = 2000 } = {}) {
    const qy = query(collection(db, "awardsCatalog"), orderBy("name", "asc"), limit(limitCount));
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ awardCode: d.id, ...d.data() }));
}

async function tryFetchFwcAwardsList() {
    const url = "https://www.fwc.gov.au/document-search/modern-awards-list";
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`FWC fetch failed: ${res.status}`);
    const html = await res.text();

    const docu = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(docu.querySelectorAll("a[href]"));

    const rows = [];
    for (const a of links) {
        const text = (a.textContent || "").trim();
        const href = a.getAttribute("href") || "";
        const codeMatch = (text.match(/MA\d{6}/) || href.match(/MA\d{6}/) || [])[0];
        if (!codeMatch) continue;

        const name = text.replace(codeMatch, "").replace(/[\[\]\(\)\-–—]+/g, " ").trim() || text.trim();
        const awardHtmlUrl = href.startsWith("http") ? href : `https://www.fwc.gov.au${href}`;

        rows.push({ awardCode: codeMatch, name: name || codeMatch, awardHtmlUrl, source: "fwc_live_fetch", updatedAt: serverTimestamp() });
    }

    const map = new Map();
    for (const r of rows) map.set(r.awardCode, r);
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function seedCatalogDefaults() {
    return [
        { awardCode: "MA000020", name: "Building and Construction General On-site Award 2020", awardHtmlUrl: "https://www.fwc.gov.au/document-search/modern-awards-list", source: "seed" },
        { awardCode: "MA000009", name: "Hospitality Industry (General) Award 2020", awardHtmlUrl: "https://www.fwc.gov.au/document-search/modern-awards-list", source: "seed" },
        { awardCode: "MA000016", name: "Clerks—Private Sector Award 2020", awardHtmlUrl: "https://www.fwc.gov.au/document-search/modern-awards-list", source: "seed" },
    ];
}

export async function syncAwardsCatalog() {
    // 1) Functions
    try {
        const fn = httpsCallable(getFunctions(), "wfConnectSyncAwardsCatalog");
        const res = await fn({});
        return res?.data || { count: 0, mode: "functions" };
    } catch {
        // 2) Client fetch from FWC (often blocked by CORS)
        try {
            const rows = await tryFetchFwcAwardsList();
            let count = 0;
            for (const a of rows) {
                const ref = doc(db, "awardsCatalog", a.awardCode);
                const existing = await getDoc(ref);
                if (!existing.exists()) count += 1;
                await setDoc(ref, a, { merge: true });
            }
            return { count, mode: "client_fwc_fetch" };
        } catch (e) {
            // 3) Seed fallback
            const defaults = seedCatalogDefaults();
            let count = 0;
            for (const a of defaults) {
                const ref = doc(db, "awardsCatalog", a.awardCode);
                const existing = await getDoc(ref);
                if (!existing.exists()) count += 1;
                await setDoc(ref, { ...a, updatedAt: serverTimestamp() }, { merge: true });
            }
            return { count, mode: "seed_fallback", error: e?.message || String(e) };
        }
    }
}

export async function interpretAward(awardCode) {
    if (!awardCode) throw new Error("Missing awardCode.");

    try {
        const fn = httpsCallable(getFunctions(), "wfConnectInterpretAward");
        const res = await fn({ awardCode });
        return res?.data || { ok: true, mode: "functions" };
    } catch {
        const cat = await getDocData(doc(db, "awardsCatalog", awardCode));
        const ref = doc(db, "awardInterpretations", awardCode);

        const fallback = {
            awardCode,
            awardHtmlUrl: cat?.awardHtmlUrl || null,
            summary:
                "Fallback interpretation. For detailed clauses/allowances/minimum rates, deploy Functions (AI interpreter). This provides compliance defaults for timesheets.",
            complianceDefaults: {
                breakRequiredAfterHours: 5,
                minBreakHours: 0.5,
                maxDailyHours: 12,
                overtimeDailyAfterHours: 8,
                overtimeWeeklyAfterHours: 38,
            },
            minimumRates: {
                note: "Populate via AI interpreter / rate tables.",
                classifications: {},
            },
            allowances: [],
            updatedAt: serverTimestamp(),
            source: "fallback",
        };

        await setDoc(ref, fallback, { merge: true });
        return { ok: true, mode: "fallback" };
    }
}

export async function getAwardInterpretation(awardCode) {
    if (!awardCode) return null;
    return await getDocData(doc(db, "awardInterpretations", awardCode));
}

/* ================================================================================================
 * ENTITY-SCOPED AWARDS + RATE TABLES + MARGINS
 * ================================================================================================ */

export async function listAwards({ entityId, limitCount = 300 }) {
    if (!entityId) throw new Error("Missing entityId.");
    const qy = query(
        collection(db, "awards"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createAward({ entityId, name, industry, classifications = [], awardCode, sourceUrl, complianceDefaults, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!name) throw new Error("Missing name.");

    const payload = {
        entityId,
        businessUnit: BU,
        name,
        industry: industry || "general",
        classifications: Array.isArray(classifications) ? classifications : [],
        awardCode: awardCode || null,
        sourceUrl: sourceUrl || null,
        complianceDefaults: complianceDefaults || null,
        ...baseCreate(user),
    };

    const ref = await addDoc(collection(db, "awards"), payload);
    return ref.id;
}

export async function updateAwardComplianceDefaults({ awardId, entityId, complianceDefaults, user }) {
    if (!awardId) throw new Error("Missing awardId.");
    if (!entityId) throw new Error("Missing entityId.");
    const ref = doc(db, "awards", awardId);
    await updateDoc(ref, withAuditPatch({ complianceDefaults: complianceDefaults || null }, user));
    return true;
}

export async function listAwardRateTables({ entityId, awardId, limitCount = 200 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!awardId) throw new Error("Missing awardId.");

    const qy = query(
        collection(db, "awardRateTables"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("awardId", "==", awardId),
        orderBy("effectiveFrom", "desc"),
        limit(limitCount)
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listMarginRules({ entityId, limitCount = 200 }) {
    if (!entityId) throw new Error("Missing entityId.");
    const qy = query(
        collection(db, "marginRules"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ================================================================================================
 * QUOTES
 * ================================================================================================ */

export async function createQuote({ entityId, payload, user }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!payload?.hiringCompanyId) throw new Error("Missing hiringCompanyId.");

    const docPayload = {
        entityId,
        businessUnit: BU,
        status: "sent",
        ...payload,
        ...baseCreate(user),
    };

    const ref = await addDoc(collection(db, "quotes"), docPayload);
    return ref.id;
}

export async function listQuotesForCompany({ entityId, hiringCompanyId, limitCount = 300 }) {
    if (!entityId) throw new Error("Missing entityId.");
    if (!hiringCompanyId) throw new Error("Missing hiringCompanyId.");

    const qy = query(
        collection(db, "quotes"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        where("hiringCompanyId", "==", hiringCompanyId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );
    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function setQuoteStatus({ quoteId, nextStatus, note = "", user }) {
    if (!quoteId) throw new Error("Missing quoteId.");
    const uid = requireUid(user);

    const ref = doc(db, "quotes", quoteId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Quote not found.");
        const cur = snap.data();
        const current = String(cur.status || "sent");

        const allowed = { sent: ["accepted", "declined"], accepted: [], declined: [] };
        if (!((allowed[current] || []).includes(nextStatus) || current === nextStatus)) {
            throw new Error(`Invalid transition: ${current} -> ${nextStatus}`);
        }

        const audit = Array.isArray(cur.audit) ? cur.audit : [];
        audit.push({ at: nowIso(), by: uid, action: "status_change", from: current, to: nextStatus, note: String(note || "") });

        tx.update(ref, { status: nextStatus, audit, updatedAt: serverTimestamp(), updatedBy: uid });
    });

    return true;
}

/** ✅ Compatibility export used by CompanyQuotes.jsx */
export async function transitionQuoteStatus(args) {
    return await setQuoteStatus(args);
}

export async function listQuotesForEntity({ entityId, limitCount = 500 } = {}) {
    if (!entityId) throw new Error("Missing entityId.");

    const qy = query(
        collection(db, "quotes"),
        where("businessUnit", "==", BU),
        where("entityId", "==", entityId),
        orderBy("createdAt", "desc"),
        limit(limitCount)
    );

    const snap = await getDocs(qy);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * ✅ Manager: watch all quotes for an entity
 */
export function watchQuotesForEntity({ entityId, limitCount = 500 } = {}, onData, onError) {
    try {
        if (!entityId) throw new Error("Missing entityId.");

        const qy = query(
            collection(db, "quotes"),
            where("businessUnit", "==", BU),
            where("entityId", "==", entityId),
            orderBy("createdAt", "desc"),
            limit(limitCount)
        );

        return onSnapshot(
            qy,
            (snap) => onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (err) => onError?.(err)
        );
    } catch (e) {
        onError?.(e);
        return () => { };
    }
}