// ===============================================
// File: scripts/find-unresolved-imports.mjs
// ===============================================
/**
 * Find unresolved imports in src/**.
 *
 * Usage:
 *   node scripts/find-unresolved-imports.mjs
 *
 * Output:
 *   - prints unresolved imports
 *   - writes unresolved-imports.json at repo root
 *
 * Notes:
 * - Treats "@/..." as "<repo>/src/..."
 * - Ignores bare package imports (e.g. "react", "lucide-react")
 * - Checks extensions: .js .jsx .ts .tsx .json and index.* variants
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const EXTS = [".js", ".jsx", ".ts", ".tsx", ".json"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".vite", ".git"]);

function isBareImport(spec) {
    return !spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("@/");
}

function stripQueryHash(p) {
    return p.split("?")[0].split("#")[0];
}

async function fileExists(p) {
    try {
        const st = await fs.stat(p);
        return st.isFile();
    } catch {
        return false;
    }
}

async function dirExists(p) {
    try {
        const st = await fs.stat(p);
        return st.isDirectory();
    } catch {
        return false;
    }
}

async function resolveWithExtensions(basePath) {
    if (path.extname(basePath)) {
        if (await fileExists(basePath)) return basePath;
        return null;
    }

    for (const ext of EXTS) {
        const candidate = basePath + ext;
        if (await fileExists(candidate)) return candidate;
    }

    if (await dirExists(basePath)) {
        for (const ext of EXTS) {
            const candidate = path.join(basePath, "index" + ext);
            if (await fileExists(candidate)) return candidate;
        }
    }

    return null;
}

function extractImportSpecifiers(code) {
    const specs = new Set();

    const fromRe = /\b(?:import|export)\s+[^;]*?\sfrom\s+['"]([^'"]+)['"]/g;
    const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const reqRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    for (const re of [fromRe, dynRe, reqRe]) {
        let m;
        // eslint-disable-next-line no-cond-assign
        while ((m = re.exec(code))) {
            const spec = m[1];
            if (spec) specs.add(spec);
        }
    }

    return [...specs];
}

async function walk(dir) {
    const out = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...(await walk(p)));
        else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
}

function toPosix(p) {
    return p.split(path.sep).join("/");
}

function resolveSpecifier(spec, fromFile) {
    const clean = stripQueryHash(spec);

    if (isBareImport(clean)) return null;

    if (clean.startsWith("@/")) {
        const rel = clean.slice(2);
        return path.join(SRC_DIR, rel);
    }

    return path.resolve(path.dirname(fromFile), clean);
}

async function main() {
    const files = await walk(SRC_DIR);
    const unresolved = [];

    for (const file of files) {
        const code = await fs.readFile(file, "utf8");
        const specs = extractImportSpecifiers(code);

        for (const spec of specs) {
            const base = resolveSpecifier(spec, file);
            if (!base) continue;

            const resolved = await resolveWithExtensions(base);
            if (!resolved) {
                unresolved.push({
                    file: toPosix(path.relative(ROOT, file)),
                    specifier: spec,
                    attemptedBase: toPosix(path.relative(ROOT, base)),
                });
            }
        }
    }

    const byFile = unresolved.reduce((acc, item) => {
        acc[item.file] ??= [];
        acc[item.file].push({ specifier: item.specifier, attemptedBase: item.attemptedBase });
        return acc;
    }, {});

    const fileCount = Object.keys(byFile).length;
    const total = unresolved.length;

    console.log(`\nUnresolved imports: ${total} (in ${fileCount} files)\n`);
    for (const [f, items] of Object.entries(byFile).sort()) {
        console.log(`- ${f}`);
        for (const it of items) console.log(`    • ${it.specifier}   (base: ${it.attemptedBase})`);
    }

    const outPath = path.join(ROOT, "unresolved-imports.json");
    await fs.writeFile(outPath, JSON.stringify({ total, files: byFile }, null, 2), "utf8");
    console.log(`\nWrote: ${toPosix(path.relative(ROOT, outPath))}\n`);

    process.exit(total ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(2);
});