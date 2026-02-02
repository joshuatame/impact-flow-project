// ===============================================
// File: scripts/auto-fix-casework-compat-stubs.mjs
// ===============================================
/**
 * Auto-create CASEWORK compat stubs for missing "@/components/*" imports.
 *
 * It reads unresolved-imports.json and if it finds a missing spec like:
 *   "@/components/forum/useForumUnreadCount"
 * it will check whether the CASEWORK equivalent exists:
 *   "src/businessUnits/CASEWORK/components/forum/useForumUnreadCount.(js|jsx|ts|tsx)"
 *
 * If found, it creates:
 *   "src/components/forum/useForumUnreadCount.(js|jsx|ts|tsx)"
 * with re-exports.
 *
 * Usage:
 *   node scripts/find-unresolved-imports.mjs
 *   node scripts/auto-fix-casework-compat-stubs.mjs
 *   node scripts/find-unresolved-imports.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const REPORT = path.join(ROOT, "unresolved-imports.json");

const EXTS = [".js", ".jsx", ".ts", ".tsx"];

async function fileExists(p) {
    try {
        const st = await fs.stat(p);
        return st.isFile();
    } catch {
        return false;
    }
}

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

async function findExistingWithExt(baseAbs) {
    if (path.extname(baseAbs)) return (await fileExists(baseAbs)) ? baseAbs : null;
    for (const ext of EXTS) {
        const p = baseAbs + ext;
        if (await fileExists(p)) return p;
    }
    for (const ext of EXTS) {
        const p = path.join(baseAbs, "index" + ext);
        if (await fileExists(p)) return p;
    }
    return null;
}

async function moduleHasDefaultExport(fileAbs) {
    const code = await fs.readFile(fileAbs, "utf8");
    return /\bexport\s+default\b/.test(code);
}

function toSpecifierFromAbs(absPath) {
    const rel = path.relative(SRC, absPath).split(path.sep).join("/");
    return `@/${rel}`;
}

function replacePrefix(spec, fromPrefix, toPrefix) {
    return spec.startsWith(fromPrefix) ? toPrefix + spec.slice(fromPrefix.length) : spec;
}

async function writeStub(stubAbs, targetAbs) {
    const targetSpec = toSpecifierFromAbs(targetAbs);
    const hasDefault = await moduleHasDefaultExport(targetAbs);

    const content = hasDefault
        ? `export { default } from "${targetSpec}";\nexport * from "${targetSpec}";\n`
        : `export * from "${targetSpec}";\n`;

    await ensureDir(path.dirname(stubAbs));
    await fs.writeFile(stubAbs, content, "utf8");
}

async function main() {
    const raw = await fs.readFile(REPORT, "utf8").catch(() => "");
    if (!raw) {
        console.error("Missing unresolved-imports.json. Run: node scripts/find-unresolved-imports.mjs");
        process.exit(2);
    }

    const report = JSON.parse(raw);
    const all = [];
    for (const [file, items] of Object.entries(report.files || {})) {
        for (const it of items) all.push({ file, specifier: it.specifier });
    }

    // Only fix alias-based component imports that should be CASEWORK-backed for now.
    const candidates = all
        .map((x) => x.specifier)
        .filter((s) => typeof s === "string" && s.startsWith("@/components/"));

    const unique = [...new Set(candidates)];

    let created = 0;
    let skipped = 0;

    for (const spec of unique) {
        // target (CASEWORK)
        const targetSpec = replacePrefix(spec, "@/components/", "@/businessUnits/CASEWORK/components/");
        const targetBaseAbs = path.join(SRC, targetSpec.slice(2)); // remove "@/"
        const targetAbs = await findExistingWithExt(targetBaseAbs);

        if (!targetAbs) {
            skipped += 1;
            continue;
        }

        // stub destination under src/components
        const stubBaseSpec = spec; // "@/components/..."
        const stubBaseAbs = path.join(SRC, stubBaseSpec.slice(2));
        const stubAbs = path.extname(targetAbs)
            ? stubBaseAbs + path.extname(targetAbs)
            : stubBaseAbs + ".js";

        // If stub already exists, skip
        if (await fileExists(stubAbs)) {
            skipped += 1;
            continue;
        }

        await writeStub(stubAbs, targetAbs);
        created += 1;
        console.log(`STUB: ${spec}  ->  ${toSpecifierFromAbs(targetAbs)}`);
    }

    console.log(`\nDone. Created stubs: ${created}. Skipped: ${skipped}.\n`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});