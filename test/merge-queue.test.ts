/**
 * Guards for `scripts/merge-queue.mjs`, the conflict and budget step of the
 * serial merge queue (`scripts/merge-queue.sh`).
 *
 * The queue merged 30+ parallel PRs between 15 and 19/11/2026 while it lived in
 * a session scratchpad, which was wiped twice. These cases pin what made it
 * safe to automate: the changelog keeps both sides with `main` first, a budget
 * conflict keeps the larger limit and remembers the budget, and the re-measure
 * raises only the barrel ceilings and the budgets both sides touched — a slice
 * only one PR grew must still fail `make check`.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(import.meta.dirname, "..", "scripts", "merge-queue.mjs");

/**
 * A scratch git repository with the given files.
 *
 * @param files - File name to contents.
 * @returns The directory.
 */
function repo(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "merge-queue-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
}

/**
 * Run the script in a directory.
 *
 * @param dir - The working directory.
 * @param args - CLI arguments.
 * @returns The child result.
 */
function run(dir: string, ...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: "utf8" });
}

const CONFLICTED_CHANGELOG = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Adicionado",
    "",
    "<<<<<<< HEAD",
    "- branch entry",
    "=======",
    "- main entry",
    ">>>>>>> origin/main",
    "",
    "## [0.89.0] — 2026-11-18",
    "",
].join("\n");

const budget = (name: string, limit: string) =>
    `  {\n    "name": "${name}",\n    "path": "dist/x.js",\n    "limit": "${limit}"\n  }`;

const CONFLICTED_SIZE_LIMIT = [
    "[",
    budget("slice: http client", "5.6 kB") + ",",
    "  {",
    '    "name": "ceiling: full barrel ESM (nobody imports this)",',
    '    "path": "dist/tempest-react-sdk.js",',
    "<<<<<<< HEAD",
    '    "limit": "162.6 kB"',
    "=======",
    '    "limit": "161.9 kB"',
    ">>>>>>> origin/main",
    "  }",
    "]",
    "",
].join("\n");

describe("merge-queue resolve", () => {
    it("concatenates the changelog hunks, main first, and keeps the larger budget", () => {
        const dir = repo({
            "CHANGELOG.md": CONFLICTED_CHANGELOG,
            ".size-limit.checks.json": CONFLICTED_SIZE_LIMIT,
        });

        expect(run(dir, "resolve").status).toBe(0);

        const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
        expect(changelog).not.toMatch(/<<<<<<<|>>>>>>>|=======/);
        expect(changelog.indexOf("- main entry")).toBeLessThan(changelog.indexOf("- branch entry"));
        const config = JSON.parse(readFileSync(join(dir, ".size-limit.checks.json"), "utf8"));
        expect(config[1].limit).toBe("162.6 kB");
    });

    it("records the budget both sides touched outside the work tree", () => {
        const dir = repo({ "CHANGELOG.md": "", ".size-limit.checks.json": CONFLICTED_SIZE_LIMIT });

        run(dir, "resolve");

        const marker = join(dir, ".git", "merge-queue-touched-budgets");
        expect(readFileSync(marker, "utf8")).toBe("ceiling: full barrel ESM (nobody imports this)");
        const status = execFileSync("git", ["status", "--porcelain"], {
            cwd: dir,
            encoding: "utf8",
        });
        expect(status).not.toContain("merge-queue-touched-budgets");
    });

    it("refuses a size-limit conflict that is more than one limit line", () => {
        const dir = repo({
            "CHANGELOG.md": "",
            ".size-limit.checks.json":
                '[\n<<<<<<< HEAD\n  {"name": "a"}\n=======\n  {"name": "b"}\n>>>>>>> origin/main\n]\n',
        });

        const result = run(dir, "resolve");

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("resolve by hand");
    });
});

describe("merge-queue remeasure", () => {
    const config = [
        { name: "slice: http client", path: "dist/x.js", limit: "5.6 kB" },
        { name: "slice: typical app", path: "dist/y.js", limit: "12.8 kB" },
        { name: "ceiling: full barrel CJS (worst case)", path: "dist/z.cjs", limit: "191.9 kB" },
    ];
    const checks = [
        { name: "slice: http client", size: 5731, passed: false },
        { name: "slice: typical app", size: 12950, passed: false },
        { name: "ceiling: full barrel CJS (worst case)", size: 192040, passed: false },
    ];

    function measured(touched: string[]): string {
        const dir = repo({
            "CHANGELOG.md":
                "# Changelog\n\n## [Unreleased]\n\n### Adicionado\n\n- x\n\n## [0.89.0] — 2026-11-18\n",
            ".size-limit.checks.json": JSON.stringify(config, null, 2),
            "checks.json": JSON.stringify(checks),
        });
        writeFileSync(join(dir, ".git", "merge-queue-touched-budgets"), touched.join("\n"));
        const result = run(dir, "remeasure", "700", "checks.json");
        expect(result.status).toBe(0);
        return dir;
    }

    it("raises the barrel ceiling and a budget both sides touched, never a slice only one grew", () => {
        const dir = measured(["slice: http client"]);

        const next = JSON.parse(readFileSync(join(dir, ".size-limit.checks.json"), "utf8"));
        expect(next.map((entry: { limit: string }) => entry.limit)).toEqual([
            "5.8 kB",
            "12.8 kB",
            "192.1 kB",
        ]);
    });

    it("notes every raise under Budgets in Unreleased, with the command", () => {
        const dir = measured([]);

        const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
        const unreleased = changelog.slice(0, changelog.indexOf("## [0.89.0]"));
        expect(unreleased).toContain("### Budgets");
        expect(unreleased).toContain("ao mergear #700");
        expect(unreleased).toContain("`npm run build && npx size-limit --json`");
        expect(unreleased).toContain("191.9 kB → 192.1 kB");
        expect(unreleased).not.toContain("slice: typical app");
    });

    it("prints nothing and changes nothing when every budget passes", () => {
        const dir = repo({
            "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n",
            ".size-limit.checks.json": JSON.stringify(config, null, 2),
            "checks.json": JSON.stringify(checks.map((check) => ({ ...check, passed: true }))),
        });

        const result = run(dir, "remeasure", "700", "checks.json");

        expect(result.stdout).toBe("");
        expect(readFileSync(join(dir, "CHANGELOG.md"), "utf8")).toBe(
            "# Changelog\n\n## [Unreleased]\n",
        );
    });
});
