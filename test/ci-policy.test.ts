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
