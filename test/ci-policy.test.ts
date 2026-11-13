import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for two decisions: the local machine tests (2026-10-26), and nothing runs
 * on GitHub Actions (2026-11-13).
 *
 * `ci.yml`, `size-limit.yml` and `e2e.yml` left the repo because every PR waited
 * 8–12 minutes for checks no branch protection required; what they ran moved to
 * `scripts/check.sh` (`make check`). On 2026-11-13 the owner's rule became "GitHub
 * Actions only in repositories of the `7rc` org" — the account had been locked for
 * billing on 2026-11-09 — and `docs.yml` and `release-npm.yml` left too: the publish
 * is `make release-tag` and the site is `make docs-deploy`, both on the maintainer's
 * machine. These tests fail when a workflow comes back, when a step disappears from
 * `make check`, or when the docs build stops installing from hash-pinned requirements.
 */
const ROOT = resolve(import.meta.dirname, "..");
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), "utf8");

/**
 * Drop full-line comments, so prose explaining a rule never satisfies it.
 *
 * @param text - Script source.
 * @returns The source without comment lines.
 */
function code(text: string): string {
    return text
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
}

/**
 * Rewritten, not deleted: this asserted exactly `docs.yml` and `release-npm.yml`,
 * and the #532 suite below it pinned their permissions, action SHAs and
 * `persist-credentials`. Both files were deleted rather than left disabled — a
 * disabled workflow is one click (or one `gh workflow enable`) from running again,
 * and its hardening tests would keep vouching for code that never runs. The last
 * version of both files and of those tests is in `2df6e4b`; a workflow that ever
 * returns brings its guards back with it.
 */
describe("nothing runs on GitHub Actions (2026-11-13)", () => {
    it("keeps no workflow in the repository", () => {
        const dir = join(ROOT, ".github", "workflows");
        expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
    });

    it("never asks a script to rerun or dispatch a workflow", () => {
        for (const file of readdirSync(join(ROOT, "scripts"))) {
            if (!/\.(sh|mjs)$/.test(file)) continue;
            expect(code(read("scripts", file)), file).not.toMatch(
                /gh (run rerun|workflow (run|enable))/,
            );
        }
    });
});

/**
 * Rewritten, not deleted: the hash-pinned install used to be asserted on `docs.yml`'s
 * build job (#532). It now lives in `scripts/docs-deploy.sh`, in a throwaway venv.
 */
describe("make docs-deploy builds from reviewed bytes (#532)", () => {
    const DEPLOY = code(read("scripts", "docs-deploy.sh"));

    it("installs the docs toolchain only from hash-pinned requirements, in a throwaway venv", () => {
        expect(DEPLOY).toMatch(/uv venv [^\n]*"\$VENV"/);
        expect(DEPLOY).toMatch(
            /uv pip install [^\n]*--python "\$VENV\/bin\/python" --require-hashes -r "\$TREE\/docs\/requirements\.txt"/,
        );
        const requirements = code(read("docs", "requirements.txt"))
            .split("\n")
            .filter((line) => /^[A-Za-z]/.test(line));
        expect(requirements.length).toBeGreaterThan(0);
        for (const line of requirements) expect(line).toMatch(/^[\w.-]+==[\w.]+ \\$/);
        expect(requirements.map((line) => line.split("==")[0])).toEqual(
            expect.arrayContaining(["mkdocs-material", "mkdocs-static-i18n", "ghp-import"]),
        );
    });

    it("builds origin/main strictly, checks both locales, and only then pushes that build", () => {
        expect(DEPLOY).toMatch(/git worktree add --quiet --detach "\$TREE" "\$SHA"/);
        const build = DEPLOY.indexOf('mkdocs" build --strict');
        const locales = DEPLOY.indexOf("for page in index.html en/index.html");
        const dryRun = DEPLOY.indexOf('if [[ "$DRY_RUN" == "1" ]]');
        const push = DEPLOY.indexOf("ghp-import");
        expect(build).toBeGreaterThan(-1);
        expect(locales).toBeGreaterThan(build);
        expect(dryRun).toBeGreaterThan(locales);
        expect(push).toBeGreaterThan(dryRun);
        expect(DEPLOY).toMatch(/--branch "\$PAGES_BRANCH"[^\n]*"\$SITE"/);
        expect(DEPLOY).not.toMatch(/mkdocs gh-deploy/);
    });

    it("is what make docs-deploy calls", () => {
        expect(read("Makefile")).toMatch(
            /^docs-deploy:.*\n\t@DRY_RUN=\$\(DRY_RUN\) \.\/scripts\/docs-deploy\.sh$/m,
        );
    });
});

describe("nothing publishes outside make release-tag (#532)", () => {
    it("makes make publish refuse, with no npm publish behind it", () => {
        const makefile = read("Makefile");
        const target = makefile.slice(makefile.indexOf("\npublish:"));
        const recipe = target.split("\n\n")[0] ?? "";
        expect(recipe).not.toMatch(/npm publish(?! --dry-run)/);
        expect(recipe).toMatch(/\n\t@exit 1$/);
        const run = spawnSync("make", ["--no-print-directory", "publish"], {
            cwd: ROOT,
            encoding: "utf8",
        });
        expect(run.status).not.toBe(0);
        expect(run.stdout).toContain("make release-tag TAG=X.Y.Z");
    });

    it("keeps npm publish in scripts/release-tag.sh only", () => {
        const publishers = readdirSync(join(ROOT, "scripts")).filter((file) =>
            /\bnpm publish\b(?! --dry-run)/.test(code(read("scripts", file))),
        );
        expect(publishers).toEqual(["release-tag.sh"]);
    });
});

describe("make check runs every gate the CI used to", () => {
    const CHECK = code(read("scripts", "check.sh"));

    it.each([
        ["the icon tables against the installed lucide", "npm run gen:icons"],
        ["format", "npm run format:check"],
        ["lint", "npm run lint"],
        ["typecheck", "npm run typecheck"],
        ["the suite with the coverage floors", "npm run test:coverage"],
        ["the build", "npm run build"],
        ["the size budgets", "npx size-limit"],
        ["the gallery capture guard", "npm run docs:gallery -- --check"],
        ["the bundler and bare-Node smoke on the tarball", "scripts/smoke-bundle.sh"],
        ["the consumer Vitest smoke on the tarball", "scripts/smoke-vitest.sh"],
        ["the CLI smoke on the tarball", "scripts/smoke-cli.sh"],
        ["the gallery e2e", "npm run e2e"],
    ])("runs %s", (_, command) => {
        expect(CHECK).toContain(command);
    });

    it("is what make check calls", () => {
        expect(read("Makefile")).toMatch(/^check:.*\n\t\.\/scripts\/check\.sh$/m);
    });

    it("is what the release runs before pushing", () => {
        const release = code(read("scripts", "release.sh"));
        const check = release.indexOf("./scripts/check.sh");
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(release.indexOf('git push -u origin "$RELEASE_BRANCH"'));
    });

    it("runs the same three tarball smokes before every publish", () => {
        const pack = code(read("scripts", "release-pack.sh"));
        for (const smoke of ["smoke-bundle.sh", "smoke-vitest.sh", "smoke-cli.sh"]) {
            expect(pack).toContain(`scripts/${smoke}`);
        }
        expect(pack.indexOf("npm run test:run")).toBeLessThan(pack.indexOf("npm pack"));
    });
});
