import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Supply-chain guards for `.github/workflows/release-npm.yml`.
 *
 * The publish job holds `id-token: write`, which is all npm Trusted Publishing needs
 * to publish `tempest-react-sdk`. Any code that runs inside that job can publish, so
 * the job may only run code that is pinned and reviewed: an exact npm CLI and the
 * tarball an unprivileged job already built and smoked. Everything resolved from the
 * registry at release time (smoke installs, `npm ci`, the test suite, the build)
 * runs in jobs without `id-token` or `contents: write` (#451).
 *
 * The workflow is read as text and split by job, because the repo carries no YAML
 * parser of its own; Prettier keeps the indentation this split relies on stable.
 * Full-line comments are dropped first, so prose explaining a rule never trips it.
 */
const WORKFLOW = readFileSync(
    resolve(import.meta.dirname, "..", ".github", "workflows", "release-npm.yml"),
    "utf8",
)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");

/**
 * Split the workflow's `jobs:` mapping into one text block per job.
 *
 * @param text - The workflow source.
 * @returns The body of each job, keyed by job id.
 */
function jobBlocks(text: string): Map<string, string> {
    const lines = text.split("\n");
    const start = lines.indexOf("jobs:");
    const jobs = new Map<string, string>();
    let current: string | null = null;
    let body: string[] = [];
    for (const line of lines.slice(start + 1)) {
        const header = /^ {4}([A-Za-z0-9_-]+):\s*$/.exec(line);
        if (header) {
            if (current) jobs.set(current, body.join("\n"));
            current = header[1] ?? null;
            body = [];
        } else if (current) {
            body.push(line);
        }
    }
    if (current) jobs.set(current, body.join("\n"));
    return jobs;
}

const JOBS = jobBlocks(WORKFLOW);

/**
 * Find the single job whose body matches a pattern.
 *
 * @param pattern - What the job must contain.
 * @returns The job id and body.
 */
function onlyJob(pattern: RegExp): [string, string] {
    const hits = [...JOBS].filter(([, body]) => pattern.test(body));
    expect(hits.map(([id]) => id)).toHaveLength(1);
    return hits[0] as [string, string];
}

describe("release-npm.yml supply chain (#451)", () => {
    it("splits into more than one job", () => {
        expect(JOBS.size).toBeGreaterThan(1);
    });

    it("starts every job from no permissions", () => {
        expect(WORKFLOW).toMatch(/^permissions: \{\}$/m);
    });

    it("never installs a floating npm CLI", () => {
        expect(WORKFLOW).not.toMatch(/npm@latest/);
        const installs = [...WORKFLOW.matchAll(/npm install -g (\S+)/g)].map((m) => m[1]);
        expect(installs.length).toBeGreaterThan(0);
        for (const spec of installs) expect(spec).toMatch(/^npm@\d+\.\d+\.\d+$/);
    });

    it("pins every action by commit SHA", () => {
        const uses = [...WORKFLOW.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
        expect(uses.length).toBeGreaterThan(0);
        for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    });

    it("never leaves the token in .git/config after a checkout", () => {
        const checkouts = WORKFLOW.split("uses: actions/checkout@").slice(1);
        expect(checkouts.length).toBeGreaterThan(0);
        for (const step of checkouts) {
            expect(step.split(/\n {12}- /)[0]).toMatch(/persist-credentials: false/);
        }
    });

    it("grants id-token to the publishing job only", () => {
        const [id, body] = onlyJob(/id-token: write/);
        expect(body).toMatch(/npm publish/);
        for (const [other, otherBody] of JOBS) {
            if (other !== id) expect(otherBody).not.toMatch(/npm publish/);
        }
    });

    it("runs nothing resolved at release time inside the publishing job", () => {
        const [, body] = onlyJob(/id-token: write/);
        expect(body).not.toMatch(/actions\/checkout/);
        expect(body).not.toMatch(/npm ci|npm run |npx |npm pack|smoke-/);
        expect(body).not.toMatch(/contents: write/);
        const installs = [...body.matchAll(/npm install (.+)/g)].map((m) => m[1]);
        for (const args of installs) expect(args).toMatch(/^-g npm@\d+\.\d+\.\d+$/);
    });

    it("publishes the tarball that was smoked, not a fresh pack", () => {
        const [, body] = onlyJob(/id-token: write/);
        expect(body).toMatch(/npm publish "\.\/\$\{?TARBALL\}?"/);
        expect(body).toMatch(/sha256sum (--check|-c)/);
    });

    it("keeps the floating smoke installs out of every privileged job", () => {
        const [, smoke] = onlyJob(/smoke-vitest\.sh/);
        expect(smoke).not.toMatch(/id-token|contents: write/);
        expect(smoke).toMatch(/react@\^19/);
    });

    it("grants contents: write to a job that runs no install", () => {
        const [, body] = onlyJob(/contents: write/);
        expect(body).not.toMatch(/id-token/);
        expect(body).not.toMatch(/npm (ci|install)|npx |npm run /);
    });
});

describe("release-npm.yml publishes one commit, from a tag (#452)", () => {
    it("guards the ref before installing anything", () => {
        const [, build] = onlyJob(/scripts\/check-release-ref\.sh/);
        expect(build.indexOf("scripts/check-release-ref.sh")).toBeLessThan(build.indexOf("npm ci"));
        expect(WORKFLOW).not.toMatch(/tag=v\$\{PKG_VERSION\}/);
    });

    it("puts the publishing job behind an environment", () => {
        const [, body] = onlyJob(/id-token: write/);
        expect(body).toMatch(/^ {8}environment: npm-release$/m);
    });

    it("never lets gh create the tag somewhere else", () => {
        const creates = [...WORKFLOW.matchAll(/gh release create .+/g)].map((m) => m[0]);
        expect(creates.length).toBeGreaterThan(0);
        for (const line of creates) expect(line).toMatch(/--verify-tag/);
    });

    it("attaches only the bytes npm serves, on the commit that was published", () => {
        const [, body] = onlyJob(/gh release/);
        expect(body).toMatch(/dist\.integrity/);
        expect(body).toMatch(/commits\/\$\{TAG\}/);
        expect(body.indexOf("dist.integrity")).toBeLessThan(body.indexOf("gh release upload"));
    });
});

const GUARD = resolve(import.meta.dirname, "..", "scripts", "check-release-ref.sh");

/**
 * A throwaway git repo with one commit and a `package.json` at a given version.
 *
 * @param version - The `version` written to `package.json`.
 * @returns The repo path and the commit SHA.
 */
function fixtureRepo(version: string): { dir: string; sha: string } {
    const dir = mkdtempSync(join(tmpdir(), "tempest-release-ref-"));
    const git = (...args: string[]): string =>
        execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
            cwd: dir,
            encoding: "utf8",
        }).trim();
    git("init", "-q");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    git("add", ".");
    git("commit", "-q", "-m", "one");
    const sha = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "other.txt"), "x");
    git("add", ".");
    git("commit", "-q", "-m", "two");
    git("tag", "v-later", "HEAD");
    git("tag", `v${version}`, sha);
    return { dir, sha };
}

/**
 * Run the guard the way the build job does, with the GitHub ref variables set.
 *
 * `CURRENT_LATEST` defaults to empty (a package with no `latest` yet), the way
 * the workflow passes it; pass `undefined` to leave it unset.
 *
 * @param dir - The checkout to run in.
 * @param env - `GITHUB_REF_TYPE`, `GITHUB_REF_NAME`, `GITHUB_SHA` and `CURRENT_LATEST`.
 * @returns Exit status, combined output, and what was written to `GITHUB_OUTPUT`.
 */
function runGuard(
    dir: string,
    env: Record<string, string | undefined>,
): { status: number | null; output: string; written: string } {
    const outputFile = join(dir, "github-output");
    writeFileSync(outputFile, "");
    const merged: Record<string, string | undefined> = {
        ...process.env,
        CURRENT_LATEST: "",
        ...env,
        GITHUB_OUTPUT: outputFile,
    };
    const childEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined) childEnv[key] = value;
    }
    const result = spawnSync("bash", [GUARD], {
        cwd: dir,
        encoding: "utf8",
        env: childEnv,
    });
    return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
        written: readFileSync(outputFile, "utf8"),
    };
}

describe("scripts/check-release-ref.sh (#452)", () => {
    it("refuses a dispatch from a branch, and says how to dispatch a tag", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        const run = runGuard(dir, {
            GITHUB_REF_TYPE: "branch",
            GITHUB_REF_NAME: "main",
            GITHUB_SHA: sha,
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("--ref v1.2.3");
        expect(run.written).toBe("");
    });

    it("refuses a tag that does not describe package.json", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        execFileSync("git", ["tag", "v1.2.4", sha], { cwd: dir });
        const run = runGuard(dir, {
            GITHUB_REF_TYPE: "tag",
            GITHUB_REF_NAME: "v1.2.4",
            GITHUB_SHA: sha,
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("does not match package.json version 1.2.3");
    });

    it("refuses a tag that is not vX.Y.Z", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        const run = runGuard(dir, {
            GITHUB_REF_TYPE: "tag",
            GITHUB_REF_NAME: "v-later",
            GITHUB_SHA: sha,
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("is not vX.Y.Z");
    });

    it("refuses a tag that points at another commit than the run's", () => {
        const { dir } = fixtureRepo("1.2.3");
        const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
        const run = runGuard(dir, {
            GITHUB_REF_TYPE: "tag",
            GITHUB_REF_NAME: "v1.2.3",
            GITHUB_SHA: head.trim(),
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("but this run checked out");
    });

    it("accepts the tag of the checked-out commit and writes the outputs", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        const run = runGuard(dir, {
            GITHUB_REF_TYPE: "tag",
            GITHUB_REF_NAME: "v1.2.3",
            GITHUB_SHA: sha,
        });
        expect(run.status).toBe(0);
        expect(run.written).toBe("tag=v1.2.3\nversion=1.2.3\nprerelease=false\ndist_tag=latest\n");
    });

    it("marks a prerelease and peels an annotated tag to its commit", () => {
        const { dir, sha } = fixtureRepo("2.0.0-rc.1");
        execFileSync(
            "git",
            [
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "tag",
                "-f",
                "-a",
                "-m",
                "rc",
                "v2.0.0-rc.1",
                sha,
            ],
            {
                cwd: dir,
            },
        );
        const run = runGuard(dir, {
            GITHUB_REF_TYPE: "tag",
            GITHUB_REF_NAME: "v2.0.0-rc.1",
            GITHUB_SHA: sha,
        });
        expect(run.status).toBe(0);
        expect(run.written).toBe(
            "tag=v2.0.0-rc.1\nversion=2.0.0-rc.1\nprerelease=true\ndist_tag=next\n",
        );
    });
});

describe("release-npm.yml recovery and prereleases (review of #451/#452)", () => {
    it("labels every pinned action with the tag its SHA came from", () => {
        const pins = [...WORKFLOW.matchAll(/uses: \S+@[0-9a-f]{40}(.*)$/gm)].map((m) => m[1]);
        expect(pins.length).toBeGreaterThan(0);
        for (const comment of pins) expect(comment).toMatch(/^ # v\d+\.\d+\.\d+$/);
    });

    it("never runs two releases of the same ref at once, nor cancels one", () => {
        expect(WORKFLOW).toMatch(
            /^concurrency:\n {4}group: release-npm-\$\{\{ github\.ref \}\}\n {4}cancel-in-progress: false$/m,
        );
    });

    it("publishes a prerelease under its own dist-tag and reads that tag back", () => {
        const [, body] = onlyJob(/id-token: write/);
        expect(body).toMatch(/DIST_TAG: \$\{\{ needs\.build\.outputs\.dist_tag \}\}/);
        expect(body).toMatch(/npm publish "\.\/\$\{TARBALL\}" .*--tag "\$\{DIST_TAG\}"/);
        expect(body).toMatch(/dist-tags\.\$\{DIST_TAG\}/);
        expect(body).not.toMatch(/dist-tags\.latest/);
    });

    it("gives every registry read-back the same 30-minute window", () => {
        const readBacks = [...JOBS]
            .filter(([id]) => id !== "build")
            .map(([, body]) => body)
            .join("\n");
        const windows = [...readBacks.matchAll(/seq 1 (\d+)/g)].map((m) => m[1]);
        expect(windows.length).toBeGreaterThanOrEqual(3);
        for (const n of windows) expect(n).toBe("120");
    });

    it("retries dist.integrity and fails with an annotation, not a bare exit", () => {
        const [, body] = onlyJob(/dist\.integrity/);
        expect(body).toMatch(/SERVED=\$\(npm view [^\n]*dist\.integrity[^\n]*\|\| true\)/);
        expect(body).toMatch(/::error::npm did not report dist\.integrity/);
    });

    it("names the tarball artifact per attempt, so a full re-run does not collide", () => {
        expect(WORKFLOW).toMatch(/artifact: npm-tarball-\$\{\{ github\.run_attempt \}\}/);
        const upload = /upload-artifact@\S+[^\n]*\n {14}with:\n {18}name: (.+)/.exec(WORKFLOW);
        expect(upload?.[1]).toBe("npm-tarball-${{ github.run_attempt }}");
        const downloads = [
            ...WORKFLOW.matchAll(/download-artifact@\S+[^\n]*\n {14}with:\n {18}name: (.+)/g),
        ].map((m) => m[1]);
        expect(downloads).toHaveLength(3);
        for (const name of downloads) expect(name).toBe("${{ needs.build.outputs.artifact }}");
    });

    it("points a byte mismatch at a recovery that exists", () => {
        const line = /::error::\$\{TARBALL\}[^\n]*/.exec(WORKFLOW)?.[0] ?? "";
        expect(line).toContain("make releases-sync");
        expect(line).not.toContain("Re-run failed jobs");
    });
});

/**
 * Run the guard on a fixture tag of `version`, against a registry whose `latest` is `current`.
 *
 * @param version - The `package.json` version, tagged `v<version>` on the run's commit.
 * @param current - The `CURRENT_LATEST` the workflow read from the registry, or `undefined` for unset.
 * @returns The guard run.
 */
function guardAgainst(
    version: string,
    current: string | undefined,
): { status: number | null; output: string; written: string } {
    const repo = fixtureRepo(version);
    return runGuard(repo.dir, {
        GITHUB_REF_TYPE: "tag",
        GITHUB_REF_NAME: `v${version}`,
        GITHUB_SHA: repo.sha,
        CURRENT_LATEST: current,
    });
}

/**
 * Rewritten, not deleted: this suite used to pin `latest` for every stable version
 * (review of #451/#452), which is exactly what let a backport `v0.75.1` cut after
 * 0.77.0 move `latest` backwards. Only a version above the registry's `latest` gets
 * it now; the rest go to `release-<major>.<minor>`.
 */
describe("scripts/check-release-ref.sh dist-tag is monotonic (#472)", () => {
    it("sends a stable version above the registry's latest to latest", () => {
        expect(guardAgainst("0.78.0", "0.77.0").written).toContain("dist_tag=latest\n");
        expect(guardAgainst("1.0.0", "0.77.0").written).toContain("dist_tag=latest\n");
        expect(guardAgainst("0.77.10", "0.77.9").written).toContain("dist_tag=latest\n");
        expect(guardAgainst("0.77.0", "0.77.0-rc.1").written).toContain("dist_tag=latest\n");
    });

    it("sends a backport below the registry's latest to its release line, not latest", () => {
        const run = guardAgainst("0.75.1", "0.77.0");
        expect(run.status).toBe(0);
        expect(run.written).toBe(
            "tag=v0.75.1\nversion=0.75.1\nprerelease=false\ndist_tag=release-0.75\n",
        );
        expect(guardAgainst("0.77.9", "0.77.10").written).toContain("dist_tag=release-0.77\n");
    });

    it("sends a version equal to the registry's latest to its release line", () => {
        expect(guardAgainst("0.77.0", "0.77.0").written).toContain("dist_tag=release-0.77\n");
    });

    it("sends a prerelease to next whatever the registry's latest is", () => {
        expect(guardAgainst("0.78.0-rc.1", "0.77.0").written).toContain("dist_tag=next\n");
        expect(guardAgainst("0.75.2-rc.1", "0.77.0").written).toContain("dist_tag=next\n");
        expect(guardAgainst("0.77.0-rc.1", "").written).toContain("dist_tag=next\n");
    });

    it("sends the first stable version of a package with no latest to latest", () => {
        expect(guardAgainst("1.2.3", "").written).toContain("dist_tag=latest\n");
    });

    it("never names a release line the way npm refuses, as a semver range", () => {
        const tag = /dist_tag=(.+)/.exec(guardAgainst("0.75.1", "0.77.0").written)?.[1] ?? "";
        expect(tag).toMatch(/^release-\d+\.\d+$/);
        expect(tag).not.toMatch(/^v?\d+(\.\d+)?(\.[\dx*])?$/);
    });

    it("fails, rather than assume a new package, when CURRENT_LATEST is unset", () => {
        const run = guardAgainst("0.75.1", undefined);
        expect(run.status).toBe(1);
        expect(run.output).toContain("CURRENT_LATEST is not set");
        expect(run.written).toBe("");
    });

    it("fails on a CURRENT_LATEST that is not a version", () => {
        const run = guardAgainst("0.78.0", "npm ERR! 503");
        expect(run.status).toBe(1);
        expect(run.output).toContain("is not a semver version");
        expect(run.written).toBe("");
    });
});

describe("release-npm.yml reads the registry's latest for the guard (#472)", () => {
    it("reads dist-tags.latest with a retry and hands it to the guard", () => {
        const [, build] = onlyJob(/scripts\/check-release-ref\.sh/);
        expect(build).toMatch(/npm view [^\n]*dist-tags\.latest/);
        expect(build).toMatch(/seq 1 \d+/);
        expect(build).toMatch(/E404/);
        expect(build).toMatch(
            /CURRENT_LATEST: \$\{\{ steps\.registry\.outputs\.current_latest \}\}/,
        );
        expect(build.indexOf("dist-tags.latest")).toBeLessThan(
            build.indexOf("scripts/check-release-ref.sh"),
        );
    });

    it("waits for the dist-tag only when this run is the one that published", () => {
        const [, body] = onlyJob(/id-token: write/);
        expect(body).toMatch(/PUBLISHED_NOW: \$\{\{ steps\.publish\.outputs\.published \}\}/);
        expect(body).toMatch(/echo "published=true" >> "\$GITHUB_OUTPUT"/);
    });
});
