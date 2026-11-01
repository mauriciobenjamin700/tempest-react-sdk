import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the 2026-10-26 decision: the CI publishes, the local machine tests.
 *
 * `ci.yml`, `size-limit.yml` and `e2e.yml` left the repo because every PR waited
 * 8–12 minutes for checks no branch protection required. What they ran moved to
 * `scripts/check.sh` (`make check`, ~6 minutes measured with e2e), which is the
 * merge gate and the last step `scripts/release.sh` runs before pushing. These
 * tests fail when a step disappears from that script, when the release stops
 * calling it, or when a workflow starts testing pull requests again — any of
 * which would silently leave a gate nobody runs.
 */
const ROOT = resolve(import.meta.dirname, "..");
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), "utf8");

/**
 * Drop full-line comments, so prose explaining a rule never satisfies it.
 *
 * @param text - Script or workflow source.
 * @returns The source without comment lines.
 */
function code(text: string): string {
    return text
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
}

describe("CI only publishes", () => {
    it("keeps exactly the Pages deploy and the npm release workflows", () => {
        expect(readdirSync(join(ROOT, ".github", "workflows")).sort()).toEqual([
            "docs.yml",
            "release-npm.yml",
        ]);
    });

    it.each(["docs.yml", "release-npm.yml"])("%s does not run on pull requests", (file) => {
        expect(code(read(".github", "workflows", file))).not.toMatch(/pull_request/);
    });
});

/**
 * Measured on `b054c16` (#532): `docs.yml` granted `pages: write` and
 * `id-token: write` at workflow level, so they reached the build job that runs an
 * unpinned `pip install` and every mkdocs plugin; it pinned five actions by
 * mutable major tags and left `persist-credentials` at its default. These rules
 * now hold for every workflow, not only for `release-npm.yml`.
 */
describe("every workflow runs least privilege on pinned code (#532)", () => {
    const WORKFLOWS = ["docs.yml", "release-npm.yml"];

    it.each(WORKFLOWS)("%s starts from no permissions at workflow level", (file) => {
        expect(code(read(".github", "workflows", file))).toMatch(/^permissions: \{\}$/m);
    });

    it.each(WORKFLOWS)("%s pins every action by commit SHA, labelled with its tag", (file) => {
        const uses = [...read(".github", "workflows", file).matchAll(/uses: (.+)/g)].map(
            (m) => m[1],
        );
        expect(uses.length).toBeGreaterThan(0);
        for (const ref of uses) {
            expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
        }
    });

    it.each(WORKFLOWS)("%s never leaves the token in .git/config after a checkout", (file) => {
        const checkouts = code(read(".github", "workflows", file))
            .split("uses: actions/checkout@")
            .slice(1);
        expect(checkouts.length).toBeGreaterThan(0);
        for (const step of checkouts) {
            expect(step.split(/\n {12}- /)[0]).toMatch(/persist-credentials: false/);
        }
    });

    it("gives docs.yml's build job read access only, and Pages and OIDC to deploy alone", () => {
        const docs = code(read(".github", "workflows", "docs.yml"));
        const build = docs.slice(docs.indexOf("\n    build:"), docs.indexOf("\n    deploy:"));
        const deploy = docs.slice(docs.indexOf("\n    deploy:"));
        expect(build).toMatch(/permissions:\n {12}contents: read\n {8}steps:/);
        expect(build).not.toMatch(/id-token|pages: write/);
        expect(deploy).toMatch(/permissions:\n {12}pages: write\n {12}id-token: write\n/);
        expect(deploy).not.toMatch(/run:/);
    });

    it("installs the docs toolchain only from hash-pinned requirements", () => {
        expect(code(read(".github", "workflows", "docs.yml"))).toMatch(
            /run: pip install --require-hashes -r docs\/requirements\.txt/,
        );
        const requirements = code(read("docs", "requirements.txt"))
            .split("\n")
            .filter((line) => /^[A-Za-z]/.test(line));
        expect(requirements.length).toBeGreaterThan(0);
        for (const line of requirements) expect(line).toMatch(/^[\w.-]+==[\w.]+ \\$/);
        expect(requirements.map((line) => line.split("==")[0])).toEqual(
            expect.arrayContaining(["mkdocs-material", "mkdocs-static-i18n"]),
        );
    });
});

describe("nothing publishes outside release-npm.yml (#532)", () => {
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
});
