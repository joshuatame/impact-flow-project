// File: scripts/auto-fix-compat-from-tree.mjs
/**
 * Auto-create compat re-export stubs based on your NEW CASEWORK tree.
 *
 * Inputs:
 *   - unresolved-imports.json (created by scripts/find-unresolved-imports.mjs)
 *
 * Outputs:
 *   - Creates missing stub files under:
 *       src/components/**  (for "@/components/...")
 *       src/pages/**       (for "@/pages/...")
 *     that re-export the matching file from:
 *       src/businessUnits/CASEWORK/**
 *
 * Usage:
 *   node scripts/find-unresolved-imports.mjs
 *   node scripts/auto-fix-compat-from-tree.mjs
 *   node scripts/find-unresolved-imports.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

const CASEWORK_ROOT = path.join(SRC, "businessUnits", "CASEWORK");
const CASEWORK_PAGES = path.join(CASEWORK_ROOT, "pages");
const CASEWORK_PUBLIC = path.join(CASEWORK_ROOT, "public");
const CASEWORK_COMPONENTS = path.join(CASEWORK_ROOT, "components");

const REPORT_PATH = path.join(ROOT, "unresolved-imports.json");

const CODE_EXTS = [".js", ".jsx", ".ts", ".tsx", ".json"];

async function exists(p) {
    try {
        await fs.stat(p);
        return true;
    } catch {
        return false;
    }
}

async function isFile(p) {
    try {
        const st = await fs.stat(p);
        return st.isFile();
    } catch {
        return false;
    }
}

async function isDir(p) {
    try {
        const st = await fs.stat(p);
        return st.isDirectory();
    } catch {
        return false;
    }
}

async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}

function toPosix(p) {
    return p.split(path.sep).join("/");
}

function stripQueryHash(spec) {
    return spec.split("?")[0].split("#")[0];
}

function specToAbsInSrc(spec) {
    // "@/x/y" -> "<root>/src/x/y"
    const clean = stripQueryHash(spec);
    if (!clean.startsWith("@/")) return null;
    return path.join(SRC, clean.slice(2));
}

function absToAtSpecifier(absPath) {
    // "<root>/src/x/y" -> "@/x/y"
    const rel = path.relative(SRC, absPath);
    return `@/${toPosix(rel)}`;
}

async function readJson(p) {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
}

async function walkFiles(dir, out = []) {
    if (!(await exists(dir))) return out;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walkFiles(p, out);
        else out.push(p);
    }
    return out;
}

function normalizeNoExt(p) {
    const ext = path.extname(p);
    if (!ext) return p;
    return p.slice(0, -ext.length);
}

async function resolveByBaseWithExt(baseAbs) {
    // baseAbs may or may not include extension
    if (path.extname(baseAbs)) {
        return (await isFile(baseAbs)) ? baseAbs : null;
    }
    for (const ext of CODE_EXTS) {
        const candidate = baseAbs + ext;
        if (await isFile(candidate)) return candidate;
    }
    if (await isDir(baseAbs)) {
        for (const ext of CODE_EXTS) {
            const candidate = path.join(baseAbs, "index" + ext);
            if (await isFile(candidate)) return candidate;
        }
    }
    return null;
}

async function moduleHasDefaultExport(fileAbs) {
    const code = await fs.readFile(fileAbs, "utf8").catch(() => "");
    return /\bexport\s+default\b/.test(code);
}

function scoreCandidate(candidateAbs, preferDirs = []) {
    const rel = toPosix(path.relative(CASEWORK_ROOT, candidateAbs)).toLowerCase();
    let score = 0;

    for (const d of preferDirs) {
        if (rel.includes(d.toLowerCase())) score += 10;
    }

    // Prefer shorter paths (more direct match)
    score += Math.max(0, 20 - rel.split("/").length);

    return score;
}

async function indexCasework() {
    const all = await walkFiles(CASEWORK_ROOT);
    const files = all.filter((p) => CODE_EXTS.includes(path.extname(p)));

    const byRel = new Map();
    const byBase = new Map();

    for (const abs of files) {
        const rel = toPosix(path.relative(CASEWORK_ROOT, abs));
        byRel.set(rel, abs);

        const base = path.basename(abs);
        if (!byBase.has(base)) byBase.set(base, []);
        byBase.get(base).push(abs);
    }

    return { byRel, byBase };
}

function candidateStubPathForSpecifier(spec, targetAbs) {
    // Create stub in src/pages or src/components matching spec path
    const stubBaseAbs = specToAbsInSrc(spec);
    if (!stubBaseAbs) return null;

    const targetExt = path.extname(targetAbs) || ".js";

    // If spec already includes ext, keep it. Otherwise use target ext.
    if (path.extname(stubBaseAbs)) return stubBaseAbs;

    return stubBaseAbs + targetExt;
}

async function writeStub(stubAbs, targetAbs) {
    const targetSpec = absToAtSpecifier(targetAbs);
    const hasDefault = await moduleHasDefaultExport(targetAbs);

    const content = hasDefault
        ? `export { default } from "${targetSpec}";\nexport * from "${targetSpec}";\n`
        : `export * from "${targetSpec}";\n`;

    await ensureDir(path.dirname(stubAbs));
    await fs.writeFile(stubAbs, content, "utf8");
}

function getBasenameFromSpecifier(spec) {
    const clean = stripQueryHash(spec);
    const last = clean.split("/").pop() || "";
    if (!last) return "";
    // If spec has no ext, we can try matching any ext later
    return last;
}

async function findTargetForComponent(spec, index) {
    // "@/components/x/y" -> CASEWORK/components/x/y (direct)
    // special: "@/components/participant-detail/*" -> CASEWORK/components/participants/*
    const clean = stripQueryHash(spec);

    const direct = clean.replace(/^@\/components\//, "");
    const directBase = path.join(CASEWORK_COMPONENTS, direct);
    const directResolved = await resolveByBaseWithExt(directBase);
    if (directResolved) return directResolved;

    if (clean.startsWith("@/components/participant-detail/")) {
        const rest = clean.replace(/^@\/components\/participant-detail\//, "");
        const aliasBase = path.join(CASEWORK_COMPONENTS, "participants", rest);
        const aliasResolved = await resolveByBaseWithExt(aliasBase);
        if (aliasResolved) return aliasResolved;
    }

    // fallback: search by basename within CASEWORK/components
    const base = getBasenameFromSpecifier(clean);
    const baseWithExt = path.extname(base) ? base : null;

    // If no ext in spec, try any ext by looking up "Name.jsx" and "Name.js" etc.
    const candidates = [];
    if (baseWithExt) {
        candidates.push(...(index.byBase.get(base) || []));
    } else {
        for (const ext of CODE_EXTS) {
            const k = base + ext;
            candidates.push(...(index.byBase.get(k) || []));
        }
    }

    const inComponents = candidates.filter((p) => toPosix(p).includes(toPosix(CASEWORK_COMPONENTS)));
    if (inComponents.length === 0) return null;

    // Prefer exact subfolder match by name if possible
    const prefer = ["components"];
    const best = inComponents
        .map((p) => ({ p, s: scoreCandidate(p, prefer) }))
        .sort((a, b) => b.s - a.s)[0];

    return best?.p || null;
}

async function findTargetForPage(spec, index) {
    // "@/pages/X" -> find X in CASEWORK/pages/** or CASEWORK/public/**
    const clean = stripQueryHash(spec);
    const baseName = getBasenameFromSpecifier(clean);
    if (!baseName) return null;

    const candidates = [];

    const hasExt = Boolean(path.extname(baseName));
    if (hasExt) {
        candidates.push(...(index.byBase.get(baseName) || []));
    } else {
        for (const ext of CODE_EXTS) {
            candidates.push(...(index.byBase.get(baseName + ext) || []));
        }
    }

    const inPagesOrPublic = candidates.filter((p) => {
        const pp = toPosix(p);
        return pp.includes(toPosix(CASEWORK_PAGES)) || pp.includes(toPosix(CASEWORK_PUBLIC));
    });

    if (inPagesOrPublic.length === 0) return null;

    const prefer = ["pages/forms", "pages/dashboard", "pages/detailed", "pages", "public"];
    const best = inPagesOrPublic
        .map((p) => ({ p, s: scoreCandidate(p, prefer) }))
        .sort((a, b) => b.s - a.s)[0];

    return best?.p || null;
}

async function fixAdminTabsTypo() {
    // Known: src/components/admin/tabs/SetingsTab.jsx exists; import expects SettingsTab.jsx
    const setings = path.join(SRC, "components", "admin", "tabs", "SetingsTab.jsx");
    const settings = path.join(SRC, "components", "admin", "tabs", "SettingsTab.jsx");

    if ((await isFile(setings)) && !(await isFile(settings))) {
        await ensureDir(path.dirname(settings));
        await fs.writeFile(settings, `export { default } from "./SetingsTab.jsx";\nexport * from "./SetingsTab.jsx";\n`, "utf8");
        return true;
    }
    return false;
}

async function main() {
    if (!(await exists(REPORT_PATH))) {
        console.error("Missing unresolved-imports.json. Run: node scripts/find-unresolved-imports.mjs");
        process.exit(2);
    }

    const report = await readJson(REPORT_PATH);
    const items = [];

    for (const [file, list] of Object.entries(report.files || {})) {
        for (const it of list) items.push({ file, spec: it.specifier });
    }

    const index = await indexCasework();

    let created = 0;
    let skipped = 0;
    let unresolved = 0;

    for (const { spec } of items) {
        const clean = stripQueryHash(spec);

        if (!clean.startsWith("@/components/") && !clean.startsWith("@/pages/")) {
            skipped += 1;
            continue;
        }

        let target = null;
        if (clean.startsWith("@/components/")) target = await findTargetForComponent(clean, index);
        if (clean.startsWith("@/pages/")) target = await findTargetForPage(clean, index);

        if (!target) {
            unresolved += 1;
            continue;
        }

        const stubAbs = candidateStubPathForSpecifier(clean, target);
        if (!stubAbs) {
            unresolved += 1;
            continue;
        }

        // If stub already exists (any extension), skip
        const stubNoExt = normalizeNoExt(stubAbs);
        let stubExists = false;
        for (const ext of CODE_EXTS) {
            if (await isFile(stubNoExt + ext)) {
                stubExists = true;
                break;
            }
        }
        if (stubExists) {
            skipped += 1;
            continue;
        }

        await writeStub(stubAbs, target);
        created += 1;
        console.log(`STUB: ${clean} -> ${absToAtSpecifier(target)}`);
    }

    const typoFixed = await fixAdminTabsTypo();

    console.log(`\nDone.`);
    console.log(`Created stubs: ${created}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Still unresolved (needs manual): ${unresolved}`);
    console.log(`Admin tabs typo stub created: ${typoFixed ? "yes" : "no"}\n`);

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});