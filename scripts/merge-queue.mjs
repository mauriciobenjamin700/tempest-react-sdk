/**
 * The two steps of `scripts/merge-queue.sh` that are not plain git: resolving
 * the conflicts every parallel PR makes, and re-measuring the size budgets the
 * merge summed.
 *
 * Run from the root of the worktree being merged:
 *
 *     node scripts/merge-queue.mjs resolve
 *     node scripts/merge-queue.mjs remeasure <pr> [size-limit.json]
 *
 * `resolve` handles only the two files CLAUDE.md says every parallel PR
 * conflicts on. `CHANGELOG.md` is concatenated, what is on `main` first and
 * the branch after. A `.size-limit.checks.json` hunk keeps the larger limit,
 * and the name of each budget both sides touched is written to
 * `$(git rev-parse --git-path merge-queue-touched-budgets)`, never the work
 * tree, which the queue stages with `git add -A`. Any other conflicted file is
 * left for a person.
 *
 * `remeasure` reads `npx size-limit --json` (or the file given, for tests) and
 * raises only the two full-barrel ceilings and the budgets `resolve` recorded
 * — "a budget touched by two PRs is re-measured over the sum" (CLAUDE.md). A
 * per-slice budget only one side touched is left alone, so its overflow fails
 * `make check` and stops the queue. Each raise is noted under `### Budgets`
 * in `[Unreleased]`, with the command that measured it. Prints `bumped` when
 * it changed something.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const CONFLICT = /<<<<<<< [^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/g;
const SIZE_LIMIT_FILE = ".size-limit.checks.json";
const CHANGELOG_FILE = "CHANGELOG.md";
const CEILING_PREFIX = "ceiling: full barrel";

/**
 * Concatenate every conflict hunk of the changelog, `main` first.
 *
 * @param {string} text - The conflicted `CHANGELOG.md`.
 * @returns {string} The resolved text.
 */
export function resolveChangelog(text) {
    return text.replace(CONFLICT, (_, branch, main) => main + branch);
}

/**
 * Read the limit of a size-limit hunk, in kB.
 *
 * @param {string} hunk - One side of a conflict.
 * @returns {number} The limit.
 * @throws {Error} When the hunk is more than a single `limit` line.
 */
function limitOf(hunk) {
    const match = /"limit": "([\d.]+) [kK]B"/.exec(hunk);
    if (!match) throw new Error("size-limit conflict is not a single limit: resolve by hand");
    return Number(match[1]);
}

/**
 * Keep the larger limit of each conflicting budget, and name the budgets.
 *
 * @param {string} text - The conflicted `.size-limit.checks.json`.
 * @returns {{ text: string, touched: string[] }} The resolved text and the
 * budgets both sides changed.
 */
export function resolveSizeLimit(text) {
    const touched = [];
    const resolved = text.replace(CONFLICT, (_, branch, main, offset) => {
        const names = [...text.slice(0, offset).matchAll(/"name": "([^"]+)"/g)];
        if (names.length > 0) touched.push(names[names.length - 1][1]);
        return limitOf(branch) >= limitOf(main) ? branch : main;
    });
    return { text: resolved, touched };
}

/**
 * Raise the budgets a summed merge overflowed, among the ones allowed.
 *
 * @param {{ name: string, limit: string }[]} config - `.size-limit.checks.json`.
 * @param {{ name: string, size: number, passed: boolean }[]} checks - `size-limit --json`.
 * @param {string[]} touched - Budgets both sides of the merge changed.
 * @returns {{ config: object[], notes: string[] }} The new config and one
 * note per raised budget.
 */
export function remeasure(config, checks, touched) {
    const allowed = new Set(touched);
    const notes = [];
    const next = config.map((entry) => ({ ...entry }));
    for (const check of checks) {
        const eligible = check.name.startsWith(CEILING_PREFIX) || allowed.has(check.name);
        if (check.passed || !eligible) continue;
        const entry = next.find((candidate) => candidate.name === check.name);
        if (!entry) continue;
        const limitKb = Math.ceil((check.size + 50) / 100) / 10;
        const label = check.name.split(" (")[0];
        const size = check.size.toLocaleString("en-US").replaceAll(",", " ");
        notes.push(`\`${label}\` ${size} B (teto ${entry.limit} → ${limitKb} kB)`);
        entry.limit = `${limitKb} kB`;
    }
    return { config: next, notes };
}

/**
 * Note the raised budgets under `### Budgets` in `[Unreleased]`.
 *
 * @param {string} changelog - `CHANGELOG.md`.
 * @param {string} pr - The PR number being merged.
 * @param {string[]} notes - From {@link remeasure}.
 * @returns {string} The changelog with the note, newest first.
 */
export function noteBudgets(changelog, pr, notes) {
    const marker = "## [Unreleased]\n";
    const start = changelog.indexOf(marker);
    if (start < 0 || notes.length === 0) return changelog;
    const bodyStart = start + marker.length;
    const nextRelease = changelog.indexOf("\n## [", bodyStart);
    const end = nextRelease < 0 ? changelog.length : nextRelease;
    let block = changelog.slice(bodyStart, end);
    const note =
        `- **Budgets remedidos sobre a soma com a \`main\` ao mergear #${pr}** ` +
        `(\`npm run build && npx size-limit --json\`): ${notes.join("; ")}. ` +
        "Só tetos do barrel e budgets que os dois lados do merge mexeram.\n";
    const heading = "### Budgets\n";
    const at = block.indexOf(heading);
    if (at >= 0) {
        const insert = at + heading.length + 1;
        block = block.slice(0, insert) + note + block.slice(insert);
    } else {
        block = `${block.replace(/\n+$/, "")}\n\n${heading}\n${note}`;
    }
    return changelog.slice(0, bodyStart) + block + changelog.slice(end);
}

/**
 * Where `resolve` leaves the names of the budgets both sides touched.
 *
 * @returns {string} A path inside the git dir.
 */
function touchedPath() {
    return execFileSync("git", ["rev-parse", "--git-path", "merge-queue-touched-budgets"], {
        encoding: "utf8",
    }).trim();
}

/**
 * Resolve the queue's two known conflicts in the current worktree.
 */
function runResolve() {
    if (existsSync(CHANGELOG_FILE)) {
        writeFileSync(CHANGELOG_FILE, resolveChangelog(readFileSync(CHANGELOG_FILE, "utf8")));
    }
    if (existsSync(SIZE_LIMIT_FILE)) {
        const { text, touched } = resolveSizeLimit(readFileSync(SIZE_LIMIT_FILE, "utf8"));
        writeFileSync(SIZE_LIMIT_FILE, text);
        writeFileSync(touchedPath(), touched.join("\n"));
    }
}

/**
 * Run `npx size-limit --json` and return its JSON.
 *
 * `size-limit` exits non-zero exactly when a budget overflows, which is the
 * case this step exists for, so the exit code is not an error here: only
 * missing JSON is. `execFileSync` threw on it, the queue read the throw as
 * "nothing to raise", and `make check` then failed on the very ceilings this
 * step should have re-measured (#674, 19/11/2026). esbuild's warnings go to
 * stderr, which is discarded so they stop flooding the queue's output.
 *
 * @returns {string} The command's stdout.
 * @throws {Error} When the output holds no JSON array.
 */
function measureSizes() {
    const result = spawnSync("npx", ["size-limit", "--json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
    });
    const stdout = result.stdout ?? "";
    if (!stdout.includes("[")) {
        throw new Error(`size-limit printed no JSON (exit ${result.status})`);
    }
    return stdout;
}

/**
 * Re-measure the summed budgets in the current worktree.
 *
 * @param {string} pr - The PR number, for the changelog note.
 * @param {string | undefined} checksFile - A saved `size-limit --json`, or
 * `undefined` to run it.
 */
function runRemeasure(pr, checksFile) {
    const marker = touchedPath();
    const touched = existsSync(marker)
        ? readFileSync(marker, "utf8").split("\n").filter(Boolean)
        : [];
    rmSync(marker, { force: true });
    const output = checksFile ? readFileSync(checksFile, "utf8") : measureSizes();
    const checks = JSON.parse(output.slice(output.indexOf("[")));
    const config = JSON.parse(readFileSync(SIZE_LIMIT_FILE, "utf8"));
    const { config: next, notes } = remeasure(config, checks, touched);
    if (notes.length === 0) return;
    writeFileSync(SIZE_LIMIT_FILE, `${JSON.stringify(next, null, 2)}\n`);
    writeFileSync(CHANGELOG_FILE, noteBudgets(readFileSync(CHANGELOG_FILE, "utf8"), pr, notes));
    console.log(`bumped: ${notes.join("; ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [command, ...rest] = process.argv.slice(2);
    if (command === "resolve") {
        runResolve();
    } else if (command === "remeasure" && rest[0]) {
        runRemeasure(rest[0], rest[1]);
    } else {
        console.error("usage: merge-queue.mjs resolve | remeasure <pr> [size-limit.json]");
        process.exit(2);
    }
}
