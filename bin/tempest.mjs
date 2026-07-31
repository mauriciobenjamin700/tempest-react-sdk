#!/usr/bin/env node
// tempest — project CLI shipped inside tempest-react-sdk.
//
//   tempest doctor          health-check the current project (à la flutter doctor)
//                           [--no-css] [--no-design] skip an analysis pass
//   tempest lint [paths…]    run ESLint (report only)
//   tempest fix [paths…]     alias imports (../ → @/) + ESLint --fix + Prettier
//   tempest format [paths…]  Prettier --write
//   tempest --help | --version
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aliasImports } from "./lib/alias/index.mjs";
import { describeTypeScript, loadTypeScript } from "./lib/alias/typescript.mjs";
import { readTsconfig } from "./lib/alias/tsconfig.mjs";
import { analyzeCss, applyCssFixes, applyExtraction, planExtraction } from "./lib/css/index.mjs";
import { analyzeDesign } from "./lib/design/index.mjs";
import { checkLucide } from "./lib/doctor/lucide.mjs";
import { generateRegistry, loadIconTables } from "./lib/icons/generate.mjs";
import { generate } from "./lib/openapi/generate.mjs";
import { loadSpec } from "./lib/openapi/load.mjs";

const ROOT = process.cwd();
const SELF_DIR = resolve(fileURLToPath(import.meta.url), "..");

const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
};

function selfVersion() {
    try {
        return (
            JSON.parse(readFileSync(join(SELF_DIR, "..", "package.json"), "utf8")).version ?? "?"
        );
    } catch {
        return "?";
    }
}

/** Resolve a project-local CLI binary (e.g. eslint, prettier). */
function localBin(name) {
    const p = join(ROOT, "node_modules", ".bin", name);
    return existsSync(p) ? p : null;
}

function run(bin, args) {
    const res = spawnSync(bin, args, { stdio: "inherit", cwd: ROOT });
    return res.status ?? 1;
}

function readJSON(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------- doctor ----

function fmt(status, label, detail) {
    const mark =
        status === "ok"
            ? `${c.green}✓${c.reset}`
            : status === "warn"
              ? `${c.yellow}!${c.reset}`
              : `${c.red}✗${c.reset}`;
    const tail = detail ? ` ${c.dim}— ${detail}${c.reset}` : "";
    return `  [${mark}] ${label}${tail}`;
}

function fileIncludes(path, needle) {
    try {
        return readFileSync(path, "utf8").includes(needle);
    } catch {
        return false;
    }
}

function firstExisting(paths) {
    return paths.find((p) => existsSync(join(ROOT, p))) ?? null;
}

/** Version string from an installed package's package.json, or null. */
function installedVersion(name) {
    return readJSON(join(ROOT, "node_modules", name, "package.json"))?.version ?? null;
}

/** Major version number from a semver string, or null. */
function major(version) {
    if (!version) return null;
    const m = /(\d+)\./.exec(String(version).replace(/^[^\d]*/, ""));
    return m ? Number(m[1]) : null;
}

/**
 * True when `name` has a **nested** copy under tempest-react-sdk — meaning two
 * physical instances load at runtime. Silent killer for React (invalid-hook /
 * dispatcher null) and for context-based libs (react-query, zustand, RHF,
 * router): providers and consumers end up in different module instances.
 */
function nestedDupe(name) {
    return existsSync(join(ROOT, "node_modules", "tempest-react-sdk", "node_modules", name));
}

/**
 * Recursively collect source text (bounded) to scan for import usage, and note
 * whether any test file exists. Returns `{ text, hasTests }`.
 */
function scanSources() {
    const roots = ["src", "app"].map((d) => join(ROOT, d)).filter(existsSync);
    let text = "";
    let hasTests = false;
    let budget = 4000; // file cap — keep the doctor fast on big trees
    const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
    const walk = (dir) => {
        if (budget <= 0) return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (budget <= 0) return;
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const full = join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (exts.has(e.name.slice(e.name.lastIndexOf(".")))) {
                budget -= 1;
                if (/\.(test|spec)\./.test(e.name)) hasTests = true;
                try {
                    text += readFileSync(full, "utf8");
                } catch {
                    /* ignore */
                }
            }
        }
    };
    roots.forEach(walk);
    return { text, hasTests };
}

/** File mtime in ms, or 0 if unreadable. */
function mtimeMs(path) {
    try {
        return statSync(path).mtimeMs;
    } catch {
        return 0;
    }
}

/** npm's published latest for a package (best-effort, short timeout). */
function npmLatest(name) {
    try {
        const res = spawnSync("npm", ["view", name, "version"], {
            encoding: "utf8",
            timeout: 2500,
        });
        const v = (res.stdout ?? "").trim();
        return /^\d+\.\d+\.\d+/.test(v) ? v : null;
    } catch {
        return null;
    }
}

/** Matches a real `import … from "tempest-react-sdk/<sub>"` (any quote style). */
function importsSubpath(src, sub) {
    return new RegExp(`from\\s*["']tempest-react-sdk/${sub}["']`).test(src);
}

// Vite's built-in `import.meta.env` keys — these don't need the VITE_ prefix.
const BUILTIN_ENV = new Set(["MODE", "DEV", "PROD", "BASE_URL", "SSR"]);

/**
 * `import.meta.env.X` references in source that are neither built-ins nor
 * `VITE_`-prefixed — Vite strips them, so they're `undefined` in the browser.
 */
function envPrefixIssues(src) {
    const found = new Set();
    const re = /import\.meta\.env\.([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(src))) {
        const key = m[1];
        if (!BUILTIN_ENV.has(key) && !key.startsWith("VITE_")) found.add(key);
    }
    return [...found];
}

/** Package-manager lockfiles present in the project root. */
function lockfiles() {
    return [
        ["package-lock.json", "npm"],
        ["yarn.lock", "yarn"],
        ["pnpm-lock.yaml", "pnpm"],
        ["bun.lockb", "bun"],
    ].filter(([f]) => existsSync(join(ROOT, f)));
}

/** Declared deps whose folder is missing from node_modules (install drift). */
function missingInstalled(deps) {
    return Object.keys(deps).filter((name) => {
        const spec = String(deps[name]);
        if (spec.startsWith("workspace:")) return false;
        return !existsSync(join(ROOT, "node_modules", name));
    });
}

/** True when `.gitignore` has a line that ignores `.env`. */
function envIsGitignored() {
    try {
        const lines = readFileSync(join(ROOT, ".gitignore"), "utf8").split(/\r?\n/);
        return lines.some((l) => {
            const s = l.trim();
            return s === ".env" || s === ".env*" || s === "*.local" || s === ".env.local";
        });
    } catch {
        return false;
    }
}

// Optional peer deps required only when the matching subpath/feature is used.
// Matchers target real import statements / JSX props, not incidental mentions.
const OPTIONAL_PEERS = [
    { peer: "recharts", used: (s) => importsSubpath(s, "charts"), why: "charts" },
    { peer: "@tiptap/react", used: (s) => importsSubpath(s, "editor"), why: "editor" },
    { peer: "onnxruntime-web", used: (s) => importsSubpath(s, "vision"), why: "vision" },
    {
        peer: "leaflet",
        // Only when a TrajectoryMap actually receives a tileUrl prop.
        used: (s) => /<TrajectoryMap[^>]*\stileUrl\s*=/.test(s),
        why: "TrajectoryMap tiles",
    },
];

// SDK child-deps that hold module-level state / React context — a second
// instance silently breaks them (two QueryClients, two RHF contexts, etc.).
const STATEFUL_DEPS = [
    "react",
    "react-dom",
    "@tanstack/react-query",
    "zustand",
    "react-hook-form",
    "react-router",
    "react-router-dom",
];

/**
 * Doctor rows for the CSS analysis.
 *
 * Findings are capped per severity because a report nobody reads to the end is a
 * report that hides its own first line. The cap is stated, and the pointer to the
 * uncapped list (`tempest fix --dry-run`) goes with it — a silent truncation
 * would read as "that is all of them".
 *
 * @param {number} [limit] - Findings shown per severity.
 * @returns {Array<[status: string, label: string, detail?: string]>} Check rows.
 */
function cssChecks(limit = 6) {
    let analysis;
    try {
        analysis = analyzeCss({ root: ROOT, targets: ["."], selfDir: SELF_DIR });
    } catch (err) {
        return [["warn", "CSS analysis failed", String(err?.message ?? err)]];
    }
    if (analysis.stats.files === 0) return [];

    const rows = [["section", "Stylesheets"]];
    rows.push([
        "info",
        `${analysis.stats.files} stylesheet(s) · ${analysis.stats.rules} rules · ${analysis.stats.declarations} declarations`,
        analysis.tokens.source ? "" : "SDK token table not found — token checks skipped",
    ]);
    if (analysis.truncated) {
        rows.push([
            "info",
            "file cap reached",
            "only the first 600 stylesheets were analyzed — narrow the run with `tempest fix <path> --dry-run`",
        ]);
    }

    const status = { error: "fail", warn: "warn", info: "info" };
    let hidden = 0;
    for (const severity of ["error", "warn", "info"]) {
        const group = analysis.findings.filter((f) => f.severity === severity);
        for (const f of group.slice(0, limit)) {
            rows.push([status[severity], `${f.file}:${f.line}`, f.message]);
        }
        hidden += Math.max(0, group.length - limit);
    }
    if (hidden > 0) {
        rows.push([
            "info",
            `${hidden} more CSS finding(s) not shown`,
            "run `tempest fix --dry-run` for the full list",
        ]);
    }
    if (analysis.findings.length === 0) {
        rows.push(["ok", "no CSS problems found"]);
    } else {
        const fixable = analysis.findings.filter((f) => f.fixable).length;
        if (fixable > 0) {
            rows.push([
                "info",
                `${fixable} finding(s) are auto-fixable`,
                "run `tempest fix` — it removes only what is provably dead",
            ]);
        }
    }
    for (const skip of analysis.skipped.slice(0, 3)) {
        rows.push(["info", `skipped ${skip.file}`, skip.reason]);
    }
    return rows;
}

/**
 * Doctor rows for the design analysis — the limits and anti-patterns documented
 * under docs/design.
 *
 * Every row is a warning or a note, never a failure: the limits are heuristics
 * with a written escape hatch (`@tempest-limits <rule> — reason`), and failing the
 * exit code on a heuristic is how a tool gets silenced. The hard gates stay with
 * ESLint (`no-explicit-any`) and `tsc --noEmit`.
 *
 * Findings are capped per severity for the same reason as the CSS pass: a report
 * nobody reads to the end hides its own first line. The cap is stated, and the
 * pointer to the full list goes with it.
 *
 * @param {number} [limit] - Findings shown per severity.
 * @returns {Array<[status: string, label: string, detail?: string]>} Check rows.
 */
function designChecks(limit = 6) {
    let analysis;
    try {
        analysis = analyzeDesign({ root: ROOT });
    } catch (err) {
        return [["warn", "design analysis failed", String(err?.message ?? err)]];
    }
    if (analysis.stats.files === 0) return [];

    const { files, codeLines, medianLines, largest } = analysis.stats;
    const rows = [["section", "Design"]];
    rows.push([
        "info",
        `${files} source file(s) · ${codeLines} lines of code · median ${medianLines}`,
        largest ? `largest: ${largest.file} (${largest.lines})` : "",
    ]);
    if (analysis.truncated) {
        rows.push(["info", "file cap reached", "only the first 1200 source files were analyzed"]);
    }

    let hidden = 0;
    for (const severity of ["warn", "info"]) {
        const group = analysis.findings.filter((f) => f.severity === severity);
        for (const f of group.slice(0, limit)) {
            rows.push([severity === "warn" ? "warn" : "info", `${f.file}:${f.line}`, f.message]);
        }
        hidden += Math.max(0, group.length - limit);
    }
    if (hidden > 0) {
        rows.push([
            "info",
            `${hidden} more design finding(s) not shown`,
            "the limits and the escape hatch are documented at /design/limits/",
        ]);
    }
    if (analysis.findings.length === 0) {
        rows.push(["ok", "no design problems found"]);
    }
    if (analysis.waivers.length > 0) {
        rows.push([
            "info",
            `${analysis.waivers.length} limit(s) waived with a written reason`,
            "@tempest-limits markers — nothing to do",
        ]);
    }
    return rows;
}

/**
 * Health-check the project.
 *
 * @param {string[]} [args] - Argv tail. `--no-css` and `--no-design` skip a pass.
 * @returns {number} Exit code: 1 when a check failed, 0 otherwise.
 */
function doctor(args = []) {
    const checks = [];
    const pkg = readJSON(join(ROOT, "package.json"));

    // ── Environment ─────────────────────────────────────────────────────────
    checks.push(["section", "Environment"]);
    const [maj, min] = process.versions.node.split(".").map(Number);
    const nodeOk = maj > 20 || (maj === 20 && min >= 19);
    checks.push([
        nodeOk ? "ok" : "fail",
        `Node ${process.versions.node}`,
        nodeOk ? "" : "requires >= 20.19",
    ]);
    // Even majors are Node LTS lines; odd majors (21, 23…) aren't — avoid in prod.
    if (nodeOk && maj % 2 === 1) {
        checks.push([
            "warn",
            `Node ${maj} is not an LTS line`,
            "odd majors aren't LTS — prefer an even major (20, 22…) for production",
        ]);
    }
    checks.push(["info", `tempest CLI v${selfVersion()}`]);

    if (!pkg) {
        checks.push(["fail", "package.json", "not found — run inside your project root"]);
        return report(checks);
    }

    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const { text: src, hasTests } = scanSources();

    // Toolchain versions.
    const tsV = installedVersion("typescript");
    if (tsV)
        checks.push(
            (major(tsV) ?? 0) >= 5
                ? ["ok", "TypeScript", `v${tsV}`]
                : ["warn", "TypeScript", `v${tsV} — SDK targets 5.x`],
        );
    const viteV = installedVersion("vite");
    if (viteV)
        checks.push(
            (major(viteV) ?? 0) >= 5
                ? ["ok", "Vite", `v${viteV}`]
                : ["warn", "Vite", `v${viteV} — SDK targets 5/6/7`],
        );

    // Node satisfies package.json engines.node's lower bound, if declared.
    const engineNode = pkg.engines?.node;
    const reqMajor = engineNode ? major(engineNode) : null;
    if (reqMajor !== null && maj < reqMajor) {
        checks.push([
            "warn",
            "engines.node",
            `package.json wants "${engineNode}" but you're on ${process.versions.node}`,
        ]);
    }

    // ── Project ─────────────────────────────────────────────────────────────
    checks.push(["section", "Project"]);
    checks.push(["ok", "package.json found"]);
    const sdkInstalled = installedVersion("tempest-react-sdk");

    /**
     * Whether this project has adopted the SDK.
     *
     * When it has not, `doctor` runs in **generic mode**: the checks that only make
     * sense once you use the SDK (its `@/*` alias, `createViteConfig`, the
     * `styles.css` import, its optional peers) drop out, and not having the SDK is
     * reported as information rather than as a defect.
     *
     * Without this the tool is useless on the exact project it should help most —
     * somebody's existing app, being evaluated. It reported two hard failures for the
     * single fact "you have not installed this yet", exited non-zero, and buried the
     * findings that *were* actionable (no lockfile, no plugin-react, no linter) among
     * warnings that were really just the SDK's own conventions.
     */
    const usesSdk = Boolean(deps["tempest-react-sdk"] || sdkInstalled);

    if (usesSdk) {
        checks.push(
            deps["tempest-react-sdk"]
                ? ["ok", "tempest-react-sdk in dependencies", deps["tempest-react-sdk"]]
                : [
                      "warn",
                      "tempest-react-sdk not in dependencies",
                      `installed as v${sdkInstalled} but undeclared — add it to package.json`,
                  ],
        );
        checks.push(
            sdkInstalled
                ? ["ok", "tempest-react-sdk installed", `v${sdkInstalled}`]
                : ["fail", "tempest-react-sdk installed", "run npm install"],
        );
    } else {
        checks.push([
            "info",
            "tempest-react-sdk not installed",
            "checking generic React/Vite health only — `npm i tempest-react-sdk` to adopt it",
        ]);
    }
    const reactV = installedVersion("react");
    checks.push(
        deps.react && deps["react-dom"]
            ? ["ok", "react + react-dom present", reactV ? `v${reactV}` : ""]
            : ["fail", "react + react-dom present", "install react react-dom"],
    );
    if (reactV && (major(reactV) ?? 0) < 18) {
        checks.push(["warn", "react version", `v${reactV} — SDK requires React 18 or 19`]);
    }

    // ── Dependency health (silent bugs) ──────────────────────────────────────
    checks.push(["section", "Dependency health"]);

    // Duplicate / nested instances. Skipped when the SDK is a local file:/link:
    // dependency — its dev node_modules is expected and not shipped to real installs.
    const sdkSpec = String(deps["tempest-react-sdk"] ?? "");
    const linked = sdkSpec.startsWith("file:") || sdkSpec.startsWith("link:");
    if (linked) {
        checks.push(["info", "SDK is a local link", "skipping duplicate-instance check"]);
    } else {
        const dupes = STATEFUL_DEPS.filter(nestedDupe);
        checks.push(
            dupes.length === 0
                ? ["ok", "single instance of React & stateful deps"]
                : [
                      "warn",
                      `duplicate instance: ${dupes.join(", ")}`,
                      "nested copy under tempest-react-sdk — run `npm dedupe` or align versions; two instances break hooks/context",
                  ],
        );

        // lucide-react gets its own check: two copies of it do not break hooks the
        // way a second React does, but they duplicate bytes and can leave the
        // generated icon slug tables pointing at exports the older copy lacks.
        const sdkPkg = readJSON(join(ROOT, "node_modules", "tempest-react-sdk", "package.json"));
        checks.push(
            ...checkLucide({
                appSpec: deps["lucide-react"] ? String(deps["lucide-react"]) : null,
                sdkSpec: sdkPkg?.dependencies?.["lucide-react"]
                    ? String(sdkPkg.dependencies["lucide-react"])
                    : null,
                installedVersion: installedVersion("lucide-react"),
                nestedCopy: nestedDupe("lucide-react"),
            }),
        );
    }

    // Declared-but-not-installed (package.json ↔ node_modules drift).
    const missing = missingInstalled(deps);
    if (missing.length > 0) {
        const shown = missing.slice(0, 8).join(", ");
        checks.push([
            "warn",
            `${missing.length} dependency(ies) not installed`,
            `${shown}${missing.length > 8 ? ", …" : ""} — run npm install`,
        ]);
    } else {
        checks.push(["ok", "all declared dependencies installed"]);
    }

    // App's own peerDependencies unmet.
    const peerDeps = Object.keys(pkg.peerDependencies ?? {});
    const unmetPeers = peerDeps.filter((name) => !installedVersion(name));
    if (unmetPeers.length > 0) {
        checks.push([
            "warn",
            `${unmetPeers.length} peerDependency(ies) unmet`,
            `${unmetPeers.slice(0, 8).join(", ")} — install them or document as optional`,
        ]);
    }

    // @types/react major vs react major.
    const typesReact = installedVersion("@types/react");
    if (typesReact && reactV) {
        checks.push(
            major(typesReact) === major(reactV)
                ? ["ok", "@types/react matches react", `v${major(reactV)}`]
                : [
                      "warn",
                      "@types/react mismatch",
                      `@types/react v${major(typesReact)} vs react v${major(reactV)} — align them`,
                  ],
        );
    }

    // Optional peers for used subpaths.
    for (const { peer, used, why } of OPTIONAL_PEERS) {
        if (used(src) && !installedVersion(peer)) {
            checks.push([
                "warn",
                `${peer} missing (used by ${why})`,
                `you import ${why} but ${peer} isn't installed — npm i ${peer}`,
            ]);
        }
    }

    // SDK up to date (online, best-effort).
    if (sdkInstalled) {
        const latest = npmLatest("tempest-react-sdk");
        if (latest && latest !== sdkInstalled) {
            const behind = (major(latest) ?? 0) > (major(sdkInstalled) ?? 0);
            checks.push([
                behind ? "warn" : "info",
                "tempest-react-sdk update available",
                `installed v${sdkInstalled} · latest v${latest}`,
            ]);
        } else if (latest) {
            checks.push(["ok", "tempest-react-sdk up to date", `v${latest}`]);
        }
    }

    // ── TypeScript ────────────────────────────────────────────────────────────
    const tsc = readTsconfig({ root: ROOT, ts: loadTypeScript(ROOT) });
    if (tsc) {
        checks.push(["section", "TypeScript"]);
        /*
         * TypeScript 7 installs under the same package name and does not ship the
         * classic compiler API — it lives behind `typescript/unstable/*` with a
         * different shape. The tsconfig checks below keep working (they fall back to
         * a JSONC-tolerant parse), but the codemods cannot run, and saying so here is
         * better than each pass reporting it as if TypeScript were missing.
         */
        const tsInstall = describeTypeScript(ROOT);
        if (tsInstall.status === "api-unavailable") {
            checks.push([
                "info",
                `typescript ${tsInstall.version} has no classic compiler API`,
                "`tempest fix` skips the alias and --extract-css codemods — they need the TypeScript 6 API; every other pass runs",
            ]);
        }
        const co = tsc.compilerOptions;
        // The `@/*` alias is the SDK's convention, not a health property: a project
        // that has not adopted the SDK is not wrong for lacking it.
        if (usesSdk) {
            checks.push(
                co.paths?.["@/*"]
                    ? ["ok", 'tsconfig "@/*" alias']
                    : ["warn", 'tsconfig "@/*" alias', 'add "paths": { "@/*": ["./src/*"] }'],
            );
        }
        const mr = String(co.moduleResolution ?? "").toLowerCase();
        checks.push(
            ["bundler", "node16", "nodenext"].includes(mr)
                ? ["ok", `moduleResolution: ${co.moduleResolution}`]
                : [
                      "warn",
                      `moduleResolution: ${co.moduleResolution ?? "(unset)"}`,
                      usesSdk
                          ? 'use "bundler" — otherwise subpath types (tempest-react-sdk/br, /charts…) won\'t resolve'
                          : 'use "bundler" — a bundled app needs it for any package that ships subpath exports',
                  ],
        );
        checks.push(
            String(co.jsx ?? "").toLowerCase() === "react-jsx"
                ? ["ok", 'jsx: "react-jsx"']
                : ["warn", `jsx: ${co.jsx ?? "(unset)"}`, 'set "jsx": "react-jsx"'],
        );
        checks.push(
            co.strict === true
                ? ["ok", "strict mode on"]
                : ["warn", "strict mode off", 'enable "strict": true to catch silent type bugs'],
        );
        if (co.skipLibCheck === false) {
            checks.push([
                "warn",
                "skipLibCheck disabled",
                'set "skipLibCheck": true — avoids type errors leaking from dependencies',
            ]);
        }
        // Tests present but tsconfig restricts `types` and omits vitest globals.
        if (
            hasTests &&
            installedVersion("vitest") &&
            Array.isArray(co.types) &&
            !co.types.some((t) => /vitest/.test(t))
        ) {
            checks.push([
                "warn",
                "vitest globals not in tsconfig types",
                'tests exist but "types" omits vitest — add "vitest/globals" so tsc sees describe/it/expect',
            ]);
        }
    }

    // ── Integration ───────────────────────────────────────────────────────────
    checks.push(["section", "Integration"]);
    const viteCfg = firstExisting(["vite.config.ts", "vite.config.js", "vite.config.mjs"]);
    if (!viteCfg) {
        checks.push(["warn", "vite config", "no vite.config.* found"]);
    } else {
        // `createViteConfig` is a convenience, not a requirement — only worth
        // mentioning to a project that already uses the SDK, and even then as info.
        if (usesSdk) {
            checks.push(
                fileIncludes(join(ROOT, viteCfg), "createViteConfig")
                    ? ["ok", `${viteCfg} uses createViteConfig`]
                    : [
                          "info",
                          `${viteCfg}`,
                          "not using createViteConfig from tempest-react-sdk/vite — optional",
                      ],
            );
        } else {
            checks.push(["ok", `${viteCfg} found`]);
        }
        // React plugin is required for JSX/Fast Refresh in a Vite React app.
        checks.push(
            installedVersion("@vitejs/plugin-react")
                ? ["ok", "@vitejs/plugin-react installed"]
                : [
                      "warn",
                      "@vitejs/plugin-react",
                      "not installed — Vite needs it for JSX/Fast Refresh (npm i -D @vitejs/plugin-react)",
                  ],
        );
    }
    const entry = firstExisting(["src/main.tsx", "src/main.ts", "src/index.tsx", "src/index.ts"]);
    if (usesSdk) {
        // Without the stylesheet every component renders unstyled, so for an SDK
        // project this is a real defect. For anyone else the entry's filename is
        // their business, not ours.
        if (entry) {
            checks.push(
                fileIncludes(join(ROOT, entry), "tempest-react-sdk/styles.css")
                    ? ["ok", `${entry} imports styles.css`]
                    : ["warn", `${entry}`, 'add import "tempest-react-sdk/styles.css"'],
            );
        } else {
            checks.push([
                "warn",
                "app entry",
                "none of src/main.tsx, src/main.ts, src/index.tsx, src/index.ts found — cannot verify the styles.css import",
            ]);
        }
    }
    // styles.css should be imported once — duplicates re-inject the whole sheet.
    const stylesImports = (src.match(/tempest-react-sdk\/styles\.css/g) ?? []).length;
    if (stylesImports > 1) {
        checks.push([
            "warn",
            `styles.css imported ${stylesImports}×`,
            "import it once at the app entry — duplicate imports ship the stylesheet repeatedly",
        ]);
    }

    // ── Stylesheets ───────────────────────────────────────────────────────────
    if (!args.includes("--no-css")) checks.push(...cssChecks());

    // ── Design ────────────────────────────────────────────────────────────────
    if (!args.includes("--no-design")) checks.push(...designChecks());

    // ── Tooling ────────────────────────────────────────────────────────────────
    checks.push(["section", "Tooling"]);
    checks.push(
        firstExisting(["eslint.config.js", "eslint.config.mjs", ".eslintrc.cjs", ".eslintrc.json"])
            ? ["ok", "ESLint config present"]
            : ["warn", "ESLint config", "no eslint config — `tempest fix` needs it"],
    );
    checks.push(
        localBin("eslint")
            ? ["ok", "eslint installed"]
            : ["warn", "eslint installed", "npm i -D eslint"],
    );
    checks.push(
        localBin("prettier")
            ? ["ok", "prettier installed"]
            : ["warn", "prettier installed", "npm i -D prettier"],
    );

    // Lockfile / package manager.
    const locks = lockfiles();
    if (locks.length === 0) {
        checks.push([
            "warn",
            "no lockfile",
            "commit a lockfile (package-lock.json) for reproducible installs",
        ]);
    } else if (locks.length > 1) {
        checks.push([
            "warn",
            `multiple lockfiles: ${locks.map(([, pm]) => pm).join(", ")}`,
            "pick one package manager — mixed lockfiles drift out of sync",
        ]);
    } else {
        checks.push(["ok", `lockfile (${locks[0][1]})`]);
        // package.json edited after the lockfile → likely out of sync.
        const lockFile = locks[0][0];
        if (mtimeMs(join(ROOT, "package.json")) > mtimeMs(join(ROOT, lockFile)) + 1000) {
            checks.push([
                "warn",
                "lockfile may be stale",
                `package.json is newer than ${lockFile} — run npm install to sync it`,
            ]);
        }
    }

    // ── Env & secrets ────────────────────────────────────────────────────────
    checks.push(["section", "Env & secrets"]);
    const hasEnv = existsSync(join(ROOT, ".env"));
    if (hasEnv) {
        checks.push(
            envIsGitignored()
                ? ["ok", ".env is git-ignored"]
                : [
                      "warn",
                      ".env NOT git-ignored",
                      "secrets can be committed — add `.env` to .gitignore now",
                  ],
        );
    } else if (existsSync(join(ROOT, ".env.example"))) {
        checks.push(["warn", ".env", "only .env.example — copy it: cp .env.example .env"]);
    }
    const envIssues = envPrefixIssues(src);
    if (envIssues.length > 0) {
        const shown = envIssues.slice(0, 6).join(", ");
        checks.push([
            "warn",
            "client env without VITE_ prefix",
            `${shown}${envIssues.length > 6 ? ", …" : ""} — Vite only exposes VITE_* to the browser; these are undefined at runtime`,
        ]);
    } else {
        checks.push(["ok", "client env vars use the VITE_ prefix"]);
    }

    /*
     * In generic mode, close with what adoption would actually take. A tool that
     * audits somebody's project and then says nothing about the next step reads as an
     * ad for a product they cannot find the door to.
     */
    if (!usesSdk) {
        checks.push(["section", "Adopting the SDK (optional)"]);
        checks.push(["info", "install", "npm i tempest-react-sdk"]);
        checks.push([
            "info",
            "import the stylesheet once, in your entry",
            'import "tempest-react-sdk/styles.css"',
        ]);
        checks.push([
            "info",
            "not all-or-nothing",
            "one component at a time works — the @/* alias, createViteConfig and the scaffold are all optional",
        ]);
    }

    return report(checks);
}

function report(checks) {
    console.log(`\n${c.bold}${c.cyan}tempest doctor${c.reset} ${c.dim}(${ROOT})${c.reset}`);
    for (const entry of checks) {
        if (entry[0] === "section") {
            console.log(`\n${c.bold}${entry[1]}${c.reset}`);
            continue;
        }
        if (entry[0] === "info") {
            console.log(
                `  [${c.cyan}i${c.reset}] ${entry[1]}${entry[2] ? ` ${c.dim}— ${entry[2]}${c.reset}` : ""}`,
            );
            continue;
        }
        console.log(fmt(entry[0], entry[1], entry[2]));
    }
    const fails = checks.filter((x) => x[0] === "fail").length;
    const warns = checks.filter((x) => x[0] === "warn").length;
    console.log("");
    if (fails)
        console.log(
            `${c.red}✗ ${fails} problem(s)${c.reset}${warns ? `, ${c.yellow}${warns} warning(s)${c.reset}` : ""}.`,
        );
    else if (warns)
        console.log(`${c.yellow}! ${warns} warning(s)${c.reset} — usable, but worth fixing.`);
    else console.log(`${c.green}✓ No issues found.${c.reset}`);
    console.log("");
    return fails ? 1 : 0;
}

// ------------------------------------------------------- lint / fix / fmt ----

function requireBin(name) {
    const bin = localBin(name);
    if (!bin) {
        console.error(
            `${c.red}✗ ${name} not found in node_modules.${c.reset} Install it: ${c.bold}npm i -D ${name}${c.reset}`,
        );
        process.exit(1);
    }
    return bin;
}

/**
 * Split argv into flags and positional paths.
 *
 * Needed because these commands used to hand `rest` straight through as their
 * path list, so `tempest lint --max-warnings 0` counted the flag as a path and
 * ESLint ran with a flag but no pattern. Flags are kept in order for forwarding.
 *
 * @param {string[]} args - The argv tail for the command.
 * @returns {{ flags: string[], paths: string[] }}
 */
function splitArgs(args) {
    const flags = [];
    const paths = [];
    for (const arg of args) (arg.startsWith("-") ? flags : paths).push(arg);
    return { flags, paths };
}

function lint(args) {
    const { flags, paths } = splitArgs(args);
    return run(requireBin("eslint"), [...(paths.length ? paths : ["."]), ...flags]);
}

/** Flags `fix` owns itself; anything else is rejected rather than forwarded. */
const FIX_FLAGS = new Set(["--no-alias", "--no-css", "--dry-run", "--extract-css"]);

/** Flags of `fix` that consume the next argument as their value. */
const FIX_VALUE_FLAGS = new Set(["--css-target", "--css-prefix"]);

/**
 * Split the `fix` argv into flags, flag values and positional paths.
 *
 * `splitArgs` cannot do this: it classifies by leading `-`, so the value of
 * `--css-target src/index.css` would land in the path list and `fix` would run
 * against a single stylesheet instead of the project.
 *
 * @param {string[]} args
 * @returns {{ flags: string[], values: Record<string, string>, paths: string[] }}
 */
function parseFixArgs(args) {
    const flags = [];
    const values = {};
    const paths = [];
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (FIX_VALUE_FLAGS.has(arg)) {
            values[arg] = args[i + 1] ?? "";
            i += 1;
            continue;
        }
        (arg.startsWith("-") ? flags : paths).push(arg);
    }
    return { flags, values, paths };
}

/**
 * Print the alias pass result.
 *
 * @param {object} result - Return value of `aliasImports`.
 * @param {boolean} dryRun - Whether the pass wrote anything.
 * @returns {void}
 */
function reportAlias(result, dryRun) {
    if (result.status === "no-typescript") {
        console.log(
            `${c.yellow}! alias pass skipped${c.reset} ${c.dim}— ${result.reason ?? "typescript não instalado"}${c.reset}`,
        );
        return;
    }
    if (result.status === "no-alias") {
        console.log(
            `${c.yellow}! no path alias found — skipping alias pass${c.reset} ${c.dim}add "paths": { "@/*": ["./src/*"] } to tsconfig.json${c.reset}`,
        );
        return;
    }
    for (const file of result.files) {
        console.log(`  ${file.path} ${c.dim}${file.changes.length}${c.reset}`);
        if (dryRun) {
            for (const ch of file.changes) {
                console.log(`    ${c.dim}${ch.line}:${c.reset} "${ch.from}" → "${ch.to}"`);
            }
        }
    }
    for (const err of result.errors) {
        console.log(`  ${c.red}✗ ${err.path}${c.reset} ${c.dim}${err.message}${c.reset}`);
    }
    if (!result.total) {
        console.log(`  ${c.dim}nothing to convert${c.reset}`);
        return;
    }
    const verb = dryRun ? "would convert" : "converted";
    console.log(
        `  ${c.green}✓${c.reset} ${verb} ${result.total} import(s) in ${result.files.length} file(s)`,
    );
}

/** Prefix for a finding line: red for a browser-visible defect, yellow otherwise. */
function severityMark(severity) {
    if (severity === "error") return `${c.red}✗${c.reset}`;
    return severity === "warn" ? `${c.yellow}!${c.reset}` : `${c.cyan}i${c.reset}`;
}

/**
 * The CSS pass of `fix`: report what the analysis found, then remove the subset
 * that is provably dead.
 *
 * Findings that need a human are printed in full here rather than capped, because
 * `--dry-run` is the review surface — `doctor` is the summary, this is the list
 * you read before letting the tool write. Only the advisory (`info`) tail is
 * capped, since "this could be a token" scales with the size of the project.
 *
 * @param {object} params
 * @param {string[]} params.targets - Positional paths from the command line.
 * @param {boolean} params.dryRun
 * @param {boolean} [params.extract] - Run the opt-in cross-file extraction codemod.
 * @param {string} [params.target] - Global stylesheet to extract into.
 * @param {string} [params.prefix] - Prefix for the extracted class names.
 * @returns {number} Exit status contribution.
 */
function cssPass({ targets, dryRun, extract = false, target, prefix }) {
    console.log(
        `${c.dim}→ css (dedupe declarations · drop dead rules)${dryRun ? " [dry-run]" : ""}${c.reset}`,
    );
    let analysis;
    try {
        analysis = analyzeCss({ root: ROOT, targets, selfDir: SELF_DIR });
    } catch (err) {
        console.log(
            `  ${c.red}✗ analysis failed${c.reset} ${c.dim}${err?.message ?? err}${c.reset}`,
        );
        return 1;
    }
    if (analysis.stats.files === 0) {
        console.log(`  ${c.dim}no stylesheets found${c.reset}`);
        return 0;
    }

    const manual = analysis.findings.filter((f) => !f.fixable);
    const infoLimit = 10;
    let shownInfo = 0;
    let hiddenInfo = 0;
    for (const f of manual) {
        if (f.severity === "info") {
            if (shownInfo >= infoLimit) {
                hiddenInfo += 1;
                continue;
            }
            shownInfo += 1;
        }
        console.log(
            `  [${severityMark(f.severity)}] ${f.file}:${f.line} ${c.dim}${f.message}${c.reset}`,
        );
    }
    if (hiddenInfo > 0) {
        console.log(`  ${c.dim}…+${hiddenInfo} more suggestion(s)${c.reset}`);
    }

    const result = applyCssFixes({ analysis, dryRun });
    for (const file of result.files) {
        console.log(`  ${file.file} ${c.dim}${file.changes.length}${c.reset}`);
        for (const change of file.changes) {
            console.log(`    ${c.dim}${change.line}:${c.reset} ${change.message}`);
        }
    }
    for (const err of result.errors) {
        console.log(`  ${c.red}✗ ${err.file}${c.reset} ${c.dim}${err.message}${c.reset}`);
    }

    if (result.total === 0) {
        console.log(`  ${c.dim}nothing to remove${c.reset}`);
    } else {
        const verb = dryRun ? "would remove" : "removed";
        console.log(
            `  ${c.green}✓${c.reset} ${verb} ${result.total} dead declaration(s)/rule(s) in ${result.files.length} file(s)`,
        );
    }
    if (analysis.counts.error > 0) {
        console.log(
            `  ${c.red}✗ ${analysis.counts.error} CSS syntax error(s)${c.reset} ${c.dim}— those files were not touched; fix them and run again${c.reset}`,
        );
    }

    const extractStatus = extract
        ? extractPass({ targets, dryRun, target, prefix, dedupedFiles: result.files.length })
        : 0;

    return result.errors.length || analysis.counts.error || extractStatus ? 1 : 0;
}

/**
 * The opt-in extraction codemod: a block repeated across CSS Modules becomes one
 * class in the project's global stylesheet, and the `styles.x` that pointed at
 * the local copies become the new class name.
 *
 * The analysis is re-run from disk rather than reused: the dedupe pass that just
 * finished may have rewritten these same files, and every edit here is a splice at
 * a recorded offset. Reusing the stale parse would splice at positions that no
 * longer exist.
 *
 * @param {object} params
 * @param {string[]} params.targets
 * @param {boolean} params.dryRun
 * @param {string} [params.target]
 * @param {string} [params.prefix]
 * @param {number} params.dedupedFiles - Files the dedupe pass touched, for the re-read note.
 * @returns {number} Exit status contribution.
 */
function extractPass({ targets, dryRun, target, prefix, dedupedFiles }) {
    console.log(
        `${c.dim}→ css extract (bloco repetido → classe global)${dryRun ? " [dry-run]" : ""}${c.reset}`,
    );
    let plan;
    try {
        const fresh = analyzeCss({ root: ROOT, targets, selfDir: SELF_DIR });
        if (dedupedFiles > 0 && !dryRun) {
            console.log(`  ${c.dim}re-analisado depois da passada de dedupe${c.reset}`);
        }
        plan = planExtraction({ analysis: fresh, root: ROOT, target, prefix });
    } catch (err) {
        console.log(
            `  ${c.red}✗ extraction failed${c.reset} ${c.dim}${err?.message ?? err}${c.reset}`,
        );
        return 1;
    }

    if (plan.status !== "ok") {
        console.log(`  ${c.yellow}! ${plan.message}${c.reset}`);
        return 0;
    }
    for (const refusal of plan.refusals) {
        console.log(
            `  [${c.yellow}!${c.reset}] ${refusal.file}:${refusal.line} ${c.dim}não extraído — ${refusal.reason}${c.reset}`,
        );
    }
    if (plan.groups.length === 0) {
        console.log(`  ${c.dim}nada a extrair${c.reset}`);
        return 0;
    }

    const result = applyExtraction({ plan, dryRun });
    for (const file of result.files) {
        console.log(`  ${file.file} ${c.dim}${file.changes.length}${c.reset}`);
        for (const change of file.changes) console.log(`    ${c.dim}${change}${c.reset}`);
    }
    for (const err of result.errors) {
        console.log(`  ${c.red}✗ ${err.file}${c.reset} ${c.dim}${err.message}${c.reset}`);
    }
    const verb = dryRun ? "moveria" : "movidas";
    console.log(
        `  ${c.green}✓${c.reset} ${verb} ${result.moved} regra(s) local(is) para ${result.rules} classe(s) em ${plan.target.file}`,
    );
    return result.errors.length ? 1 : 0;
}

function fix(args) {
    const { flags, values, paths } = parseFixArgs(args);
    const unknown = flags.filter((f) => !FIX_FLAGS.has(f));
    if (unknown.length) {
        console.error(
            `${c.red}✗ Unknown flag for fix: ${unknown.join(", ")}${c.reset} — supported: ${[...FIX_FLAGS, ...FIX_VALUE_FLAGS].join(", ")}`,
        );
        return 1;
    }
    const targets = paths.length ? paths : ["."];
    const dryRun = flags.includes("--dry-run");
    const extract = flags.includes("--extract-css");
    if (!extract && (values["--css-target"] || values["--css-prefix"])) {
        console.error(`${c.red}✗ --css-target/--css-prefix só valem com --extract-css.${c.reset}`);
        return 1;
    }

    let aliasStatus = 0;
    if (!flags.includes("--no-alias")) {
        console.log(`${c.dim}→ alias imports (../ → @/)${dryRun ? " [dry-run]" : ""}${c.reset}`);
        const result = aliasImports({ root: ROOT, targets, dryRun });
        reportAlias(result, dryRun);
        aliasStatus = result.status === "error" ? 1 : 0;
    }

    const cssStatus = flags.includes("--no-css")
        ? 0
        : cssPass({
              targets,
              dryRun,
              extract,
              target: values["--css-target"],
              prefix: values["--css-prefix"],
          });

    if (dryRun) return aliasStatus || cssStatus;

    console.log(`${c.dim}→ eslint --fix (sort imports · drop unused · tidy whitespace)${c.reset}`);
    const eslintStatus = run(requireBin("eslint"), [...targets, "--fix"]);
    const prettier = localBin("prettier");
    let prettierStatus = 0;
    if (prettier) {
        console.log(`${c.dim}→ prettier --write${c.reset}`);
        prettierStatus = run(prettier, ["--write", ...targets]);
    } else {
        console.log(`${c.yellow}! prettier not installed — skipping format pass${c.reset}`);
    }
    return aliasStatus || cssStatus || eslintStatus || prettierStatus;
}

function format(args) {
    const { flags, paths } = splitArgs(args);
    return run(requireBin("prettier"), ["--write", ...(paths.length ? paths : ["."]), ...flags]);
}

// -------------------------------------------------------------- gen api ----

/** Parse `--out <dir>` from the argv tail. */
function parseOut(args, fallback) {
    const i = args.indexOf("--out");
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

/**
 * `tempest gen api <url|file> [--out src/api]` — generate Zod schemas, TS types
 * and a service class per route-group from an OpenAPI spec.
 */
async function genApi(args) {
    const source = args.find((a) => !a.startsWith("--") && a !== "api");
    if (!source) {
        console.error(
            `${c.red}✗ Missing OpenAPI source.${c.reset} Usage: tempest gen api <url|file> [--out src/api]`,
        );
        return 1;
    }
    const outDir = resolve(ROOT, parseOut(args, "src/api"));
    console.log(`${c.dim}→ loading ${source}${c.reset}`);
    const doc = await loadSpec(source);
    const { files, tags } = generate(doc);

    for (const [rel, contents] of Object.entries(files)) {
        const dest = join(outDir, rel);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, contents);
    }

    console.log(
        `\n${c.green}✓ Generated${c.reset} ${Object.keys(files).length} files for ${tags.length} route group(s): ${c.bold}${tags.join(", ")}${c.reset}`,
    );
    console.log(`  ${c.dim}out: ${outDir}${c.reset}`);
    const prettier = localBin("prettier");
    if (prettier) {
        console.log(`${c.dim}→ prettier --write ${parseOut(args, "src/api")}${c.reset}`);
        run(prettier, ["--write", parseOut(args, "src/api")]);
    }
    console.log(`\n${c.dim}Inject an ApiClient into a service:${c.reset}`);
    console.log(`  import { createApiClient } from "tempest-react-sdk";`);
    if (tags[0]) {
        const cls = tags[0].replace(/[^a-zA-Z0-9]+(.)?/g, (_, ch) => (ch ? ch.toUpperCase() : ""));
        const Cls = cls.charAt(0).toUpperCase() + cls.slice(1) + "Service";
        console.log(`  import { ${Cls} } from "@/api/${tags[0].toLowerCase()}";`);
        console.log(
            `  const svc = new ${Cls}(createApiClient({ baseURL: import.meta.env.VITE_API_URL }));`,
        );
    }
    return 0;
}

// ------------------------------------------------------------ gen icons ----

/**
 * `tempest gen icons [--out src/icons.generated.ts] [--dir src]` — write a static
 * icon registry from the slugs the project's source mentions.
 *
 * The `tempestIcons()` Vite plugin does the same thing as a virtual module and
 * needs no file; this exists for a project that is not on Vite, or that prefers a
 * registry it can read and commit.
 */
async function genIcons(args) {
    const outRel = parseOut(args, "src/icons.generated.ts");
    const dirIndex = args.indexOf("--dir");
    const dirRel = dirIndex >= 0 && args[dirIndex + 1] ? args[dirIndex + 1] : "src";
    const dir = resolve(ROOT, dirRel);

    let tables;
    try {
        tables = await loadIconTables(SELF_DIR);
    } catch {
        console.error(
            `${c.red}✗ Could not read the icon tables from the installed SDK.${c.reset} Is tempest-react-sdk installed and built?`,
        );
        return 1;
    }

    console.log(`${c.dim}→ scanning ${dirRel}${c.reset}`);
    const { source, slugs, files } = await generateRegistry({
        dir,
        known: tables.known,
        aliases: tables.aliases,
    });

    const dest = resolve(ROOT, outRel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, source);

    console.log(
        `\n${c.green}✓ ${slugs.length} icon(s)${c.reset} from ${files} file(s) → ${c.bold}${outRel}${c.reset}`,
    );
    const prettier = localBin("prettier");
    if (prettier) run(prettier, ["--write", outRel]);
    console.log(`\n${c.dim}Wire it up:${c.reset}`);
    console.log(`  import { IconProvider } from "tempest-react-sdk/icons";`);
    console.log(`  import { icons } from "@/icons.generated";`);
    console.log(`  <IconProvider registry={icons}>…</IconProvider>`);
    return 0;
}

const GEN_TARGETS = { api: genApi, icons: genIcons };

function gen(args) {
    const what = args[0];
    const target = GEN_TARGETS[what];
    if (!target) {
        console.error(
            `${c.red}✗ Unknown gen target: ${what ?? "(none)"}${c.reset} — supported: ${Object.keys(GEN_TARGETS).join(", ")}.`,
        );
        return 1;
    }
    return target(args.slice(1));
}

// ------------------------------------------------------------------ main ----

function usage() {
    console.log(`
${c.bold}${c.cyan}tempest${c.reset} ${c.dim}v${selfVersion()}${c.reset} — project CLI for tempest-react-sdk apps

${c.bold}Usage${c.reset}
  tempest <command> [paths…]

${c.bold}Commands${c.reset}
  ${c.bold}doctor${c.reset}            Health-check the current project
  ${c.bold}lint${c.reset} [paths]      Run ESLint (report only)
  ${c.bold}fix${c.reset} [paths]       Alias imports (../ → @/) + CSS dead-code removal + ESLint --fix
                    (sort imports, remove unused, tidy whitespace) + Prettier
  ${c.bold}format${c.reset} [paths]    Prettier --write
  ${c.bold}gen api${c.reset} <src>    Generate Zod schemas + types + service classes from an OpenAPI spec
                    (e.g. tempest gen api http://127.0.0.1:8000/openapi.json --out src/api)
  ${c.bold}gen icons${c.reset}         Write a static icon registry from the slugs your source uses
                    (e.g. tempest gen icons --out src/icons.generated.ts --dir src)

${c.bold}doctor options${c.reset}
  --no-css          Skip the CSS analysis
  --no-design       Skip the design analysis (file/function size, props count,
                    \`any\`, transport in a component, swallowed errors)

${c.bold}fix options${c.reset}
  --dry-run         List every CSS finding and the imports that would be rewritten;
                    write nothing
  --no-alias        Skip the alias pass
  --no-css          Skip the CSS pass (analysis and dead-code removal)
  --extract-css     Move a declaration block repeated across CSS Modules into the
                    project's global stylesheet and rewrite the styles.x reads that
                    pointed at the local copies (opt-in — it changes what couples
                    to what). Refuses anything it cannot prove safe, with a reason
  --css-target <f>  Global stylesheet to extract into (default: the first of
                    src/styles/globals.css, src/globals.css, src/index.css, …)
  --css-prefix <p>  Prefix for extracted class names (default: u-)

${c.bold}Options${c.reset}
  -h, --help        Show this help
  -v, --version     Show version
`);
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "-v" || cmd === "--version") {
    console.log(selfVersion());
    process.exit(0);
}
if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    usage();
    process.exit(0);
}

const commands = {
    doctor: () => doctor(rest),
    lint: () => lint(rest),
    fix: () => fix(rest),
    format: () => format(rest),
    gen: () => gen(rest),
};

if (!commands[cmd]) {
    console.error(`${c.red}✗ Unknown command: ${cmd}${c.reset}`);
    usage();
    process.exit(1);
}

const result = commands[cmd]();
if (result instanceof Promise) {
    result
        .then((code) => process.exit(code))
        .catch((err) => {
            console.error(
                `${c.red}✗ ${err instanceof Error ? err.message : String(err)}${c.reset}`,
            );
            process.exit(1);
        });
} else {
    process.exit(result);
}
