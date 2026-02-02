// ================================
// File: src/api/base44Client.js
// ================================

// src/api/base44Client.js
import { auth, db, storage, functions as firebaseFunctions } from "@/firebase";
import { getActiveEntity } from "@/lib/activeEntity";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit as fsLimit,
    addDoc,
    updateDoc,
    deleteDoc,
    setDoc,
    serverTimestamp,
} from "firebase/firestore";

import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";

function parseOrder(order) {
    if (!order) return null;
    const desc = order.startsWith("-");
    const field = desc ? order.slice(1) : order;
    return { field, direction: desc ? "desc" : "asc" };
}

// EMAIL: default from / reply-to for all client-enqueued emails
const DEFAULT_FROM = "admin@impact-central.com.au";
const DEFAULT_REPLY_TO = "admint@impact-central.com.au";

// Email sender used by legacy be.integrations.Core.SendEmail callers
async function sendEmail({ to, subject, html, text, type = "app", from, replyTo } = {}) {
    if (!to) throw new Error("SendEmail: missing `to`");

    return addDoc(collection(db, "mail"), {
        to,
        from: from || DEFAULT_FROM,
        replyTo: replyTo || DEFAULT_REPLY_TO,
        message: {
            subject: subject || "Message",
            ...(html ? { html } : {}),
            ...(text ? { text } : {}),
        },
        createdAt: serverTimestamp(),
        type,
    });
}

async function getCurrentUserProfile() {
    const current = auth.currentUser;

    if (!current) {
        const user = await new Promise((resolve) => {
            const unsub = onAuthStateChanged(auth, (u) => {
                unsub();
                resolve(u || null);
            });
        });
        if (!user) return null;
    }

    const user = auth.currentUser;
    if (!user) return null;

    const userDocRef = doc(db, "User", user.uid);
    const snap = await getDoc(userDocRef);

    if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
    }

    return {
        id: user.uid,
        email: user.email,
        display_name: user.displayName,
    };
}

function buildCreateAuditFields(user) {
    const nowIso = new Date().toISOString();
    return {
        created_date: nowIso,
        updated_date: nowIso,
        created_by_user_id: user?.id || null,
        created_by_email: user?.email || null,
        created_by_name: user?.full_name || user?.display_name || null,
        updated_by_user_id: user?.id || null,
        updated_by_email: user?.email || null,
        updated_by_name: user?.full_name || user?.display_name || null,
    };
}

function buildUpdateAuditFields(user) {
    const nowIso = new Date().toISOString();
    return {
        updated_date: nowIso,
        updated_by_user_id: user?.id || null,
        updated_by_email: user?.email || null,
        updated_by_name: user?.full_name || user?.display_name || null,
    };
}

function stripUndefined(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) out[k] = v;
    }
    return out;
}

function safeFileName(name) {
    return String(name || "file")
        .replace(/[^\w.\-() ]+/g, "_")
        .replace(/\s+/g, "_");
}

// ----------------- ACTIVE ENTITY HELPERS -----------------

function getActiveEntityIdOrEmpty() {
    try {
        return getActiveEntity?.()?.id || "";
    } catch {
        return "";
    }
}

function requireActiveEntityId() {
    const id = getActiveEntityIdOrEmpty();
    if (!id) throw new Error("No active business unit selected.");
    return id;
}

function resolveOptions(opts) {
    return {
        scope: opts?.scope || "entity", // "entity" | "all"
    };
}

function assertEntityIdMatchesActive(docEntityId, activeEntityId) {
    if (docEntityId && docEntityId !== activeEntityId) {
        throw new Error("Record belongs to a different business unit.");
    }
}

// ----------------- HTTP invoker (AI only) -----------------

const FUNCTIONS_BASE_URL =
    import.meta.env.VITE_FUNCTIONS_BASE_URL ||
    "https://australia-southeast1-impact-flow-jpc.cloudfunctions.net";

async function invokeHttp(name, payload = {}) {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

    const res = await fetch(`${FUNCTIONS_BASE_URL}/${name}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(stripUndefined(payload)),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Function ${name} failed with ${res.status}: ${text || "Unknown error"}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    return await res.text();
}

// ----------------- Callable invoker -----------------

async function invokeCallable(name, payload = {}) {
    const fn = httpsCallable(firebaseFunctions, name);
    const res = await fn(payload);
    return res?.data;
}

// ----------------- entity factory -----------------

function createEntity(entityName, options = {}) {
    const collectionName = entityName;
    const entityScoped = options.entityScoped === true;

    function maybeAddEntityConstraint(constraints, opts) {
        const { scope } = resolveOptions(opts);
        if (!entityScoped || scope === "all") return constraints;

        const activeEntityId = getActiveEntityIdOrEmpty();
        if (!activeEntityId) return null; // signal: return []
        return [...constraints, where("entity_id", "==", activeEntityId)];
    }

    async function loadAndCheckEntity(id, opts) {
        const { scope } = resolveOptions(opts);
        if (!entityScoped || scope === "all") return null;

        const activeEntityId = requireActiveEntityId();
        const snap = await getDoc(doc(db, collectionName, id));
        if (!snap.exists()) return null;

        const record = { id: snap.id, ...snap.data() };
        assertEntityIdMatchesActive(record.entity_id, activeEntityId);
        return record;
    }

    return {
        async get(id, opts) {
            if (!id) return null;

            const { scope } = resolveOptions(opts);
            const docRef = doc(db, collectionName, id);
            const snap = await getDoc(docRef);
            if (!snap.exists()) return null;

            const record = { id: snap.id, ...snap.data() };

            if (entityScoped && scope !== "all") {
                const activeEntityId = getActiveEntityIdOrEmpty();
                if (!activeEntityId) return null;
                if (record?.entity_id !== activeEntityId) return null;
            }

            return record;
        },

        async list(order, max, opts) {
            const colRef = collection(db, collectionName);
            let constraints = [];
            const orderInfo = parseOrder(order);

            if (orderInfo) constraints.push(orderBy(orderInfo.field, orderInfo.direction));
            if (max) constraints.push(fsLimit(max));

            const withEntity = maybeAddEntityConstraint(constraints, opts);
            if (withEntity === null) return [];
            constraints = withEntity;

            try {
                const qRef = constraints.length ? query(colRef, ...constraints) : colRef;
                const snap = await getDocs(qRef);
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            } catch (e) {
                if (!orderInfo) throw e;

                // Fallback: drop orderBy, keep entity_id filter + limit
                let fallbackConstraints = [];
                if (max) fallbackConstraints.push(fsLimit(max));

                const withEntityFallback = maybeAddEntityConstraint(fallbackConstraints, opts);
                if (withEntityFallback === null) return [];
                fallbackConstraints = withEntityFallback;

                const fallback = fallbackConstraints.length ? query(colRef, ...fallbackConstraints) : colRef;
                const snap = await getDocs(fallback);
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            }
        },

        async filter(filters = {}, order, max, opts) {
            if (filters && Object.prototype.hasOwnProperty.call(filters, "id")) {
                const id = filters.id;
                const remainingFilters = { ...filters };
                delete remainingFilters.id;

                const record = await this.get(id, opts);
                if (!record) return [];

                for (const [field, value] of Object.entries(remainingFilters)) {
                    if (record[field] !== value) return [];
                }
                return [record];
            }

            const colRef = collection(db, collectionName);
            let constraints = [];

            const merged = { ...(filters || {}) };

            const { scope } = resolveOptions(opts);
            if (entityScoped && scope !== "all") {
                const activeEntityId = getActiveEntityIdOrEmpty();
                if (!activeEntityId) return [];

                if (Object.prototype.hasOwnProperty.call(merged, "entity_id")) {
                    if (merged.entity_id !== activeEntityId) return [];
                } else {
                    merged.entity_id = activeEntityId;
                }
            }

            for (const [field, value] of Object.entries(merged)) {
                constraints.push(where(field, "==", value));
            }

            const orderInfo = parseOrder(order);
            if (orderInfo) constraints.push(orderBy(orderInfo.field, orderInfo.direction));
            if (max) constraints.push(fsLimit(max));

            try {
                const qRef = constraints.length ? query(colRef, ...constraints) : colRef;
                const snap = await getDocs(qRef);
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            } catch (e) {
                if (!orderInfo) throw e;

                // Fallback: drop orderBy, keep filters + limit
                const fallbackConstraints = [];
                for (const [field, value] of Object.entries(merged)) {
                    fallbackConstraints.push(where(field, "==", value));
                }
                if (max) fallbackConstraints.push(fsLimit(max));

                const qFallback = fallbackConstraints.length ? query(colRef, ...fallbackConstraints) : colRef;
                const snap = await getDocs(qFallback);
                return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            }
        },

        async create(data, opts) {
            const { scope } = resolveOptions(opts);
            const user = await getCurrentUserProfile();
            const audit = buildCreateAuditFields(user);

            let entityId = "";
            if (entityScoped && scope !== "all") {
                entityId = requireActiveEntityId();
                assertEntityIdMatchesActive(data?.entity_id, entityId);
            }

            const colRef = collection(db, collectionName);
            const payload = stripUndefined({
                ...data,
                ...(entityScoped && scope !== "all" ? { entity_id: entityId } : {}),
                ...audit,
            });

            const docRef = await addDoc(colRef, payload);
            return { id: docRef.id, ...payload };
        },

        async update(id, data, opts) {
            const user = await getCurrentUserProfile();
            const audit = buildUpdateAuditFields(user);

            if (entityScoped && resolveOptions(opts).scope !== "all") {
                await loadAndCheckEntity(id, opts);
                if (Object.prototype.hasOwnProperty.call(data || {}, "entity_id")) {
                    const activeEntityId = requireActiveEntityId();
                    assertEntityIdMatchesActive(data.entity_id, activeEntityId);
                }
            }

            const docRef = doc(db, collectionName, id);
            const payload = stripUndefined({ ...data, ...audit });
            await updateDoc(docRef, payload);
            return { id, ...payload };
        },

        async upsert(id, data, opts) {
            const { scope } = resolveOptions(opts);
            const user = await getCurrentUserProfile();
            const audit = buildUpdateAuditFields(user);

            let entityId = "";
            if (entityScoped && scope !== "all") {
                entityId = requireActiveEntityId();

                const existingSnap = await getDoc(doc(db, collectionName, id));
                if (existingSnap.exists()) {
                    const existing = { id: existingSnap.id, ...existingSnap.data() };
                    assertEntityIdMatchesActive(existing.entity_id, entityId);
                }

                assertEntityIdMatchesActive(data?.entity_id, entityId);
            }

            const docRef = doc(db, collectionName, id);
            const payload = stripUndefined({
                ...data,
                ...(entityScoped && scope !== "all" ? { entity_id: entityId } : {}),
                ...audit,
            });

            await setDoc(docRef, payload, { merge: true });
            const snap = await getDoc(docRef);
            return { id: snap.id, ...snap.data() };
        },

        async delete(id, opts) {
            if (entityScoped && resolveOptions(opts).scope !== "all") {
                await loadAndCheckEntity(id, opts);
            }

            const docRef = doc(db, collectionName, id);
            await deleteDoc(docRef);
            return { id };
        },
    };
}

// ----------------- entity registry -----------------

const entities = {
    Program: createEntity("Program", { entityScoped: true }),
    Participant: createEntity("Participant", { entityScoped: true }),
    ParticipantProgramEnrollment: createEntity("ParticipantProgramEnrollment", { entityScoped: true }),
    CaseNote: createEntity("CaseNote", { entityScoped: true }),
    FundingRecord: createEntity("FundingRecord", { entityScoped: true }),
    TrainingActivity: createEntity("TrainingActivity", { entityScoped: true }),
    ParticipantTraining: createEntity("ParticipantTraining", { entityScoped: true }),
    ParticipantQuickNote: createEntity("ParticipantQuickNote", { entityScoped: true }),
    ProgramIntake: createEntity("ProgramIntake", { entityScoped: true }),
    CustomReport: createEntity("CustomReport", { entityScoped: true }),
    SavedReport: createEntity("SavedReport", { entityScoped: true }),
    SurveyTemplate: createEntity("SurveyTemplate", { entityScoped: true }),
    SurveyResponse: createEntity("SurveyResponse", { entityScoped: true }),
    EmploymentPlacement: createEntity("EmploymentPlacement", { entityScoped: true }),
    Employer: createEntity("Employer", { entityScoped: true }),
    Task: createEntity("Task", { entityScoped: true }),
    DEXActivityRecord: createEntity("DEXActivityRecord", { entityScoped: true }),
    DEXExportLog: createEntity("DEXExportLog", { entityScoped: true }),
    DexCaseLocationOption: createEntity("DexCaseLocationOption", { entityScoped: true }),
    Document: createEntity("Document", { entityScoped: true }),
    Notification: createEntity("Notification", { entityScoped: true }),
    GoodNewsStory: createEntity("GoodNewsStory", { entityScoped: true }),
    Goal: createEntity("Goal", { entityScoped: true }),
    SystemSettings: createEntity("systemSettings", { entityScoped: false }),
    WorkflowRequest: createEntity("WorkflowRequest", { entityScoped: true }),
    ForumMessage: createEntity("ForumMessage", { entityScoped: true }),
    ForumChannel: createEntity("ForumChannels", { entityScoped: true }),
    ForumPost: createEntity("ForumPost", { entityScoped: true }),
    ActionPlanItem: createEntity("ActionPlanItem", { entityScoped: true }),
    User: createEntity("User", { entityScoped: false }),
    Resource: createEntity("Resource", { entityScoped: true }),

    // PDF Forms
    PdfTemplate: createEntity("PdfTemplate", { entityScoped: true }),
    PdfFormInstance: createEntity("PdfFormInstance", { entityScoped: true }),
};

// ----------------- functions wrapper -----------------

const functionsApi = {
    invoke: invokeCallable,

    dailyDigest: (payload = {}) => invokeCallable("dailyDigest", payload),
    workflowNotifications: (payload = {}) => invokeCallable("workflowNotifications", payload),

    // PDF forms (callable)
    allocatePdfForms: (payload = {}) => invokeCallable("allocatePdfForms", payload),
    submitPdfFormInstance: (payload = {}) => invokeCallable("submitPdfFormInstance", payload),
    generateSignedPdf: (payload = {}) => invokeCallable("generateSignedPdf", payload),
    migratePdfForms: (payload = {}) => invokeCallable("migratePdfForms", payload),
    checkPdfFormsCompleteForWorkflow: (payload = {}) => invokeCallable("checkPdfFormsCompleteForWorkflow", payload),

    // UI compat callables
    allocatePdfFormsForWorkflowRequest: (payload = {}) =>
        invokeCallable("allocatePdfFormsForWorkflowRequest", payload),
    addOptionalPdfInstance: (payload = {}) => invokeCallable("addOptionalPdfInstance", payload),
    generateParticipantPdfPacket: (payload = {}) => invokeCallable("generateParticipantPdfPacket", payload),
    allocateManualPdfFormsForParticipant: (payload = {}) =>
        invokeCallable("allocateManualPdfFormsForParticipant", payload),
    getOrCreateManualPdfFormInstanceForParticipant: (payload = {}) =>
        invokeCallable("getOrCreateManualPdfFormInstanceForParticipant", payload),

    // AI stays HTTP
    invokeLLM: (payload = {}) => invokeHttp("ai", payload),
};

// ----------------- integrations wrapper (Firebase Storage + AI + Email) -----------------

async function uploadFileToFirebase({ file, pathPrefix = "uploads" }) {
    if (!file) throw new Error("No file provided to UploadFile");

    const user = await getCurrentUserProfile();
    const uid = user?.id || "anonymous";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = safeFileName(file.name);
    const fullPath = `${pathPrefix}/${uid}/${ts}_${safe}`;

    const r = storageRef(storage, fullPath);
    await uploadBytes(r, file, {
        contentType: file.type || "application/octet-stream",
    });

    const url = await getDownloadURL(r);

    return {
        file_url: url,
        url,
        storage_path: fullPath,
        file_name: file.name,
        content_type: file.type,
        size: file.size,
    };
}

const integrations = {
    Core: {
        InvokeLLM: async ({ prompt, response_json_schema, model }) => {
            return invokeHttp("ai", { prompt, response_json_schema, model });
        },

        UploadFile: async ({ file, pathPrefix }) => {
            return uploadFileToFirebase({ file, pathPrefix });
        },

        // legacy-compatible email sender (now includes from/replyTo in the mail doc)
        SendEmail: async (payload = {}) => {
            const to = payload.to || payload.email || payload.recipient || payload.recipientEmail;
            const subject = payload.subject || payload.title || "Message";
            const html = payload.html || payload.bodyHtml || payload.messageHtml || payload.body;
            const text = payload.text || payload.bodyText || null;

            return sendEmail({
                to,
                subject,
                html,
                text,
                type: payload.type || "app",
                from: payload.from,
                replyTo: payload.replyTo || payload.reply_to,
            });
        },
    },
};

// ----------------- auth wrapper -----------------

const authApi = {
    async me() {
        return getCurrentUserProfile();
    },

    async updateMe(data) {
        const profile = await getCurrentUserProfile();
        if (!profile) throw new Error("Not authenticated");

        const userDocRef = doc(db, "User", profile.id);
        await setDoc(userDocRef, stripUndefined(data), { merge: true });
        const updated = await getDoc(userDocRef);

        return { id: updated.id, ...updated.data() };
    },

    async login(email, password) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return cred.user;
    },

    async logout() {
        await signOut(auth);
    },
};

export const base44 = {
    auth: authApi,
    entities,
    functions: functionsApi,
    integrations,
};