#!/usr/bin/env node
// tempest — project CLI shipped inside tempest-react-sdk.
//
//   tempest doctor          health-check the current project (à la flutter doctor)
//   tempest lint [paths…]    run ESLint (report only)
//   tempest fix [paths…]     ESLint --fix (sort imports, drop unused, tidy whitespace) + Prettier
//   tempest format [paths…]  Prettier --write
//   tempest --help | --version
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

function doctor() {
    const checks = [];
    const pkg = readJSON(join(ROOT, "package.json"));

    // Node
    const [maj, min] = process.versions.node.split(".").map(Number);
    const nodeOk = maj > 20 || (maj === 20 && min >= 19);
    checks.push([
        nodeOk ? "ok" : "fail",
        `Node ${process.versions.node}`,
        nodeOk ? "" : "requires >= 20.19",
    ]);

    // package.json
    if (!pkg) {
        checks.push(["fail", "package.json", "not found — run inside your project root"]);
        return report(checks);
    }
    checks.push(["ok", "package.json found"]);

    // SDK dependency + installed
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    checks.push(
        deps["tempest-react-sdk"]
            ? ["ok", "tempest-react-sdk in dependencies", deps["tempest-react-sdk"]]
            : [
                  "fail",
                  "tempest-react-sdk in dependencies",
                  "add it: npm install tempest-react-sdk",
              ],
    );
    checks.push(
        existsSync(join(ROOT, "node_modules", "tempest-react-sdk"))
            ? ["ok", "tempest-react-sdk installed"]
            : ["fail", "tempest-react-sdk installed", "run npm install"],
    );

    // React peers
    const hasReact = deps.react && deps["react-dom"];
    checks.push(
        hasReact
            ? ["ok", "react + react-dom present"]
            : ["fail", "react + react-dom present", "install react react-dom"],
    );

    // Vite config + createViteConfig
    const viteCfg = firstExisting(["vite.config.ts", "vite.config.js", "vite.config.mjs"]);
    if (!viteCfg) {
        checks.push(["warn", "vite config", "no vite.config.* found"]);
    } else {
        checks.push(
            fileIncludes(join(ROOT, viteCfg), "createViteConfig")
                ? ["ok", `${viteCfg} uses createViteConfig`]
                : ["warn", `${viteCfg}`, "not using createViteConfig from tempest-react-sdk/vite"],
        );
    }

    // tsconfig @ alias
    const tsc = readJSON(join(ROOT, "tsconfig.json"));
    const paths = tsc?.compilerOptions?.paths ?? {};
    checks.push(
        paths["@/*"]
            ? ["ok", 'tsconfig "@/*" alias']
            : ["warn", 'tsconfig "@/*" alias', 'add "paths": { "@/*": ["./src/*"] }'],
    );

    // styles.css imported at entry
    const entry = firstExisting(["src/main.tsx", "src/main.ts", "src/index.tsx", "src/index.ts"]);
    if (entry) {
        checks.push(
            fileIncludes(join(ROOT, entry), "tempest-react-sdk/styles.css")
                ? ["ok", `${entry} imports styles.css`]
                : ["warn", `${entry}`, 'add import "tempest-react-sdk/styles.css"'],
        );
    } else {
        checks.push(["warn", "app entry", "no src/main.tsx found"]);
    }

    // tooling
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

    // .env
    if (existsSync(join(ROOT, ".env"))) checks.push(["ok", ".env present"]);
    else if (existsSync(join(ROOT, ".env.example")))
        checks.push(["warn", ".env", "only .env.example — copy it: cp .env.example .env"]);

    return report(checks);
}

function report(checks) {
    console.log(`\n${c.bold}${c.cyan}tempest doctor${c.reset} ${c.dim}(${ROOT})${c.reset}\n`);
    for (const [status, label, detail] of checks) console.log(fmt(status, label, detail));
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

function lint(paths) {
    return run(requireBin("eslint"), paths.length ? paths : ["."]);
}

function fix(paths) {
    const targets = paths.length ? paths : ["."];
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
    return eslintStatus || prettierStatus;
}

function format(paths) {
    return run(requireBin("prettier"), ["--write", ...(paths.length ? paths : ["."])]);
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

function gen(args) {
    const what = args[0];
    if (what !== "api") {
        console.error(
            `${c.red}✗ Unknown gen target: ${what ?? "(none)"}${c.reset} — only \`gen api\` is supported.`,
        );
        return 1;
    }
    return genApi(args.slice(1));
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
  ${c.bold}fix${c.reset} [paths]       ESLint --fix (sort imports, remove unused, tidy whitespace) + Prettier
  ${c.bold}format${c.reset} [paths]    Prettier --write
  ${c.bold}gen api${c.reset} <src>    Generate Zod schemas + types + service classes from an OpenAPI spec
                    (e.g. tempest gen api http://127.0.0.1:8000/openapi.json --out src/api)

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
    doctor: () => doctor(),
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
