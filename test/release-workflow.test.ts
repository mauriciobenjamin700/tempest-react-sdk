import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Guards for the release pipeline, which runs on the maintainer's machine since
 * 2026-11-13 (`make release` → merge → `make release-tag`).
 *
 * The owner's rule that day: GitHub Actions only in repositories of the `7rc` org.
 * `release-npm.yml` left the repository and `scripts/release-tag.sh` now does what it
 * did after a tag push, in the same order: the ref guard (from `origin/main`), the
 * build and the smokes of the tagged tree, `npm publish` of the smoked tarball under a
 * monotonic dist-tag, the registry read-back, the tag push and the GitHub Release.
 *
 * Every guard that still has a subject was rewritten against the local scripts, run in
 * fixture repositories with a bare `origin`, a fake `npm` and a fake `gh` first on the
 * `PATH`, and a stub `scripts/release-pack.sh` committed into the fixture, so no test
 * reaches the network or the real registry. The guards of #451, #495 and #532 that
 * pinned the runner itself — the job split by permission, the npm CLI checked against
 * a pinned integrity next to `id-token: write`, the artifact named per attempt, the
 * `concurrency` group, the `::error::` annotations on stdout — had no subject left
 * once no runner exists, and went with the workflow (last version in `2df6e4b`).
 */
const SCRIPTS = resolve(import.meta.dirname, "..", "scripts");
const GUARD = join(SCRIPTS, "check-release-ref.sh");
const RELEASE_TAG = join(SCRIPTS, "release-tag.sh");
const DIST_TAG_SCRIPT = join(SCRIPTS, "release-dist-tag.sh");
const RELEASE_SH = readFileSync(join(SCRIPTS, "release.sh"), "utf8");

/**
 * Per-test budget for a full `release-tag.sh` run in a fixture: a clone, a worktree
 * and a few dozen fake `npm`/`gh` processes take 1–2 s alone and over 5 s when the
 * suite runs every file in parallel.
 */
const FLOW_TIMEOUT = 60_000;

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
 * Run a git command in a fixture repo with a fixed identity.
 *
 * @param dir - The repo to run in.
 * @param args - The git arguments.
 * @returns The trimmed stdout.
 */
function gitIn(dir: string, ...args: string[]): string {
    return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
        cwd: dir,
        encoding: "utf8",
    }).trim();
}

/**
 * A throwaway git repo with two commits on `origin/main`; the first one, at a given
 * `package.json` version, carries the tag `v<version>`.
 *
 * @param version - The `version` written to `package.json`.
 * @returns The repo path and the tagged commit.
 */
function fixtureRepo(version: string): { dir: string; sha: string } {
    const dir = mkdtempSync(join(tmpdir(), "tempest-release-ref-"));
    gitIn(dir, "init", "-q");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "one");
    const sha = gitIn(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "other.txt"), "x");
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "two");
    gitIn(dir, "tag", `v${version}`, sha);
    gitIn(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    return { dir, sha };
}

/** What one guard run printed, and the `key=value` lines it handed back. */
interface GuardRun {
    status: number | null;
    output: string;
    written: string;
}

/**
 * Run the guard the way `release-tag.sh` does.
 *
 * `CURRENT_LATEST` defaults to empty (a package with no `latest` yet); pass
 * `undefined` to leave it unset.
 *
 * @param dir - The repo to run in.
 * @param env - `RELEASE_TAG`, `RELEASE_SHA`, `CURRENT_LATEST` and `BACKPORT_LINES`.
 * @returns Exit status, the messages on stderr, and the `key=value` lines on stdout.
 */
function runGuard(dir: string, env: Record<string, string | undefined>): GuardRun {
    const merged: Record<string, string | undefined> = {
        ...process.env,
        CURRENT_LATEST: "",
        BACKPORT_LINES: "",
        ...env,
    };
    const childEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined) childEnv[key] = value;
    }
    const result = spawnSync("bash", [GUARD], { cwd: dir, encoding: "utf8", env: childEnv });
    return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
        written: result.stdout,
    };
}

describe("scripts/check-release-ref.sh (#452)", () => {
    it("refuses to run without the tag and the commit it checks", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        const run = runGuard(dir, { RELEASE_SHA: sha });
        expect(run.status).toBe(1);
        expect(run.output).toContain("RELEASE_TAG and RELEASE_SHA are required");
        expect(run.written).toBe("");
    });

    it("refuses a tag that does not describe package.json", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        const run = runGuard(dir, { RELEASE_TAG: "v1.2.4", RELEASE_SHA: sha });
        expect(run.status).toBe(1);
        expect(run.output).toContain("does not match package.json version 1.2.3");
    });

    it("reads package.json from the commit, not from the working tree", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "9.9.9" }));
        const run = runGuard(dir, { RELEASE_TAG: "v1.2.3", RELEASE_SHA: sha });
        expect(run.status).toBe(0);
        expect(run.written).toContain("version=1.2.3\n");
    });

    it("refuses a tag that is not vX.Y.Z", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        const run = runGuard(dir, { RELEASE_TAG: "v-later", RELEASE_SHA: sha });
        expect(run.status).toBe(1);
        expect(run.output).toContain("is not vX.Y.Z");
    });

    it("refuses a tag that already points at another commit than the release", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        gitIn(dir, "tag", "-f", "v1.2.3", "HEAD");
        const run = runGuard(dir, { RELEASE_TAG: "v1.2.3", RELEASE_SHA: sha });
        expect(run.status).toBe(1);
        expect(run.output).toContain("but the release is");
    });

    it("accepts the tag of the commit and writes the outputs", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        const run = runGuard(dir, { RELEASE_TAG: "v1.2.3", RELEASE_SHA: sha });
        expect(run.status).toBe(0);
        expect(run.written).toBe("tag=v1.2.3\nversion=1.2.3\nprerelease=false\ndist_tag=latest\n");
    });

    it("marks a prerelease and peels an annotated tag to its commit", () => {
        const { dir, sha } = fixtureRepo("2.0.0-rc.1");
        gitIn(dir, "tag", "-f", "-a", "-m", "rc", "v2.0.0-rc.1", sha);
        const run = runGuard(dir, { RELEASE_TAG: "v2.0.0-rc.1", RELEASE_SHA: sha });
        expect(run.status).toBe(0);
        expect(run.written).toBe(
            "tag=v2.0.0-rc.1\nversion=2.0.0-rc.1\nprerelease=true\ndist_tag=next\n",
        );
    });
});

/**
 * A fixture repo where `main` is at `0.78.0` and the tag `v<version>` sits on a
 * commit of another branch, not reachable from `origin/main` — the commit
 * `scripts/release.sh` used to tag before its PR was merged (#472).
 *
 * @param version - The version of the off-main commit, tagged `v<version>`.
 * @param branch - The branch that holds the off-main commit; it is also published
 *   as `refs/remotes/origin/<branch>`.
 * @returns The repo path, the off-main commit and the `main` commit.
 */
function offMainRepo(
    version: string,
    branch = "release/v" + version,
): { dir: string; off: string; main: string } {
    const dir = mkdtempSync(join(tmpdir(), "tempest-release-offmain-"));
    gitIn(dir, "init", "-q", "-b", "main");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.78.0" }));
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "main");
    const main = gitIn(dir, "rev-parse", "HEAD");
    gitIn(dir, "update-ref", "refs/remotes/origin/main", main);
    gitIn(dir, "checkout", "-q", "-b", branch);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "off main");
    const off = gitIn(dir, "rev-parse", "HEAD");
    gitIn(dir, "update-ref", `refs/remotes/origin/${branch}`, off);
    gitIn(dir, "tag", `v${version}`, off);
    gitIn(dir, "checkout", "-q", "--detach", off);
    return { dir, off, main };
}

/**
 * Up to 0.78.0 the guard accepted a tag on any commit whose `package.json`
 * matched, and `scripts/release.sh` pushed the tag from the release branch before
 * the PR was merged. Measured against the old guard: a `v0.79.0` tag on a commit
 * `git merge-base --is-ancestor` says is not on main exited 0 with
 * `dist_tag=latest`. The tag is now cut after the merge (`make release-tag`) and the
 * guard refuses the rest.
 */
describe("scripts/check-release-ref.sh publishes only what is on main (#472)", () => {
    it("refuses a tag on a commit that is not on main", () => {
        const { dir, off } = offMainRepo("0.79.0");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.79.0",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.78.0",
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("which is not on main");
        expect(run.output).toContain("make release-tag TAG=0.79.0");
        expect(run.written).toBe("");
    });

    it("accepts the same tag once it sits on the merge commit in main", () => {
        const { dir } = offMainRepo("0.79.0");
        gitIn(dir, "checkout", "-q", "main");
        gitIn(dir, "merge", "-q", "--no-ff", "-m", "Merge release", "release/v0.79.0");
        const merge = gitIn(dir, "rev-parse", "HEAD");
        gitIn(dir, "update-ref", "refs/remotes/origin/main", merge);
        gitIn(dir, "tag", "-f", "v0.79.0", merge);
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.79.0",
            RELEASE_SHA: merge,
            CURRENT_LATEST: "0.78.0",
        });
        expect(run.status).toBe(0);
        expect(run.output).toContain("on origin/main");
        expect(run.written).toBe(
            "tag=v0.79.0\nversion=0.79.0\nprerelease=false\ndist_tag=latest\n",
        );
    });

    it("refuses an off-main prerelease, which would go to next", () => {
        const { dir, off } = offMainRepo("0.79.0-rc.1");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.79.0-rc.1",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.78.0",
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("which is not on main");
        expect(run.written).toBe("");
    });

    /**
     * Rewritten, not deleted: the workflow's checkout needed `fetch-depth: 0` to bring
     * `origin/main`. Locally `release-tag.sh` fetches it, and the guard still fails
     * closed when it is missing instead of skipping the ancestry check.
     */
    it("fails closed when the repository has no origin/main", () => {
        const { dir, sha } = fixtureRepo("1.2.3");
        gitIn(dir, "update-ref", "-d", "refs/remotes/origin/main");
        const run = runGuard(dir, { RELEASE_TAG: "v1.2.3", RELEASE_SHA: sha });
        expect(run.status).toBe(1);
        expect(run.output).toContain("git fetch origin main");
        expect(run.written).toBe("");
    });

    it("accepts a backport from its own maintenance branch, under its release line", () => {
        const { dir, off } = offMainRepo("0.75.1", "release-0.75");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.75.1",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.78.0",
            BACKPORT_LINES: "release-0.75",
        });
        expect(run.status).toBe(0);
        expect(run.output).toContain("on origin/release-0.75");
        expect(run.written).toContain("dist_tag=release-0.75\n");
    });

    it("never lets a maintenance branch publish to latest", () => {
        const { dir, off } = offMainRepo("0.79.0", "release-0.79");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.79.0",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.78.0",
            BACKPORT_LINES: "release-0.79",
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("which is not on main");
        expect(run.written).toBe("");
    });

    it("refuses a backport from another line's maintenance branch, even with both lines opened", () => {
        const { dir, off } = offMainRepo("0.75.1", "release-0.76");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.75.1",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.78.0",
            BACKPORT_LINES: "release-0.75 release-0.76",
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("may instead come from origin/release-0.75");
    });
});

/**
 * Measured on `b054c16` in a fixture (#527): a brand-new `release-0.79` branch
 * holding an unreviewed `v0.79.50` passed the guard with exit 0 and
 * `dist_tag=release-0.79`. Opening a line now takes `BACKPORT_LINES` on the command
 * line of whoever publishes; the branch alone opens nothing.
 */
describe("a backport line opens only on the publisher's command line (#527)", () => {
    it("refuses a backport from a maintenance branch nobody opened", () => {
        const { dir, off } = offMainRepo("0.79.50", "release-0.79");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.79.50",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.80.0",
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("release-0.79 is not an opened backport line");
        expect(run.output).toContain("BACKPORT_LINES=release-0.79");
        expect(run.written).toBe("");
    });

    it("refuses a backport whose line is not among the opened ones", () => {
        const { dir, off } = offMainRepo("0.79.50", "release-0.79");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.79.50",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.80.0",
            BACKPORT_LINES: "release-0.7,release-0.790",
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("not an opened backport line");
    });

    it("accepts a backport once its line is in a comma-separated BACKPORT_LINES", () => {
        const { dir, off } = offMainRepo("0.79.50", "release-0.79");
        const run = runGuard(dir, {
            RELEASE_TAG: "v0.79.50",
            RELEASE_SHA: off,
            CURRENT_LATEST: "0.80.0",
            BACKPORT_LINES: "release-0.75,release-0.79",
        });
        expect(run.status).toBe(0);
        expect(run.written).toContain("dist_tag=release-0.79\n");
    });

    it("hands BACKPORT_LINES from make release-tag to the script", () => {
        const makefile = readFileSync(resolve(SCRIPTS, "..", "Makefile"), "utf8");
        const target = makefile.slice(makefile.indexOf("\nrelease-tag:")).split("\n\n")[0] ?? "";
        expect(target).toContain('BACKPORT_LINES="$(BACKPORT_LINES)"');
        expect(target).toContain("./scripts/release-tag.sh");
    });
});

/**
 * Run the guard on a fixture tag of `version`, against a registry whose `latest` is `current`.
 *
 * @param version - The `package.json` version, tagged `v<version>` on the commit.
 * @param current - The registry's `latest`, or `undefined` for unset.
 * @returns The guard run.
 */
function guardAgainst(version: string, current: string | undefined): GuardRun {
    const repo = fixtureRepo(version);
    return runGuard(repo.dir, {
        RELEASE_TAG: `v${version}`,
        RELEASE_SHA: repo.sha,
        CURRENT_LATEST: current,
    });
}

/**
 * Rewritten, not deleted: this suite used to pin `latest` for every stable version
 * (review of #451/#452), which is exactly what let a backport `v0.75.1` cut after
 * 0.77.0 move `latest` backwards. Only a version above the registry's `latest` gets
 * it now; the rest go to `release-<major>.<minor>`. A version equal to the registry's
 * `latest` stays on `latest`: equal only happens when a run resumes the
 * already-published version.
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

    it("keeps latest for a version that already is the registry's latest", () => {
        expect(guardAgainst("0.77.0", "0.77.0").written).toContain("dist_tag=latest\n");
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

/**
 * Run `release-dist-tag.sh` with a fake `npm` first on the PATH.
 *
 * The fake answers `npm view` from a queue of canned replies, one per call, so a
 * transient failure followed by an answer is expressible; the last reply repeats.
 * Each reply is `[exitCode, stdout, stderr]`.
 *
 * @param args - The subcommand and its arguments.
 * @param replies - What the fake `npm` answers, call after call.
 * @returns Exit status, stdout, stderr and how many times `npm` was called.
 */
function runDistTag(
    args: string[],
    replies: [number, string, string][] = [],
): { status: number | null; stdout: string; stderr: string; calls: number } {
    const dir = mkdtempSync(join(tmpdir(), "tempest-dist-tag-"));
    writeFileSync(join(dir, "replies.json"), JSON.stringify(replies));
    writeFileSync(join(dir, "calls"), "0");
    const fake = join(dir, "npm");
    writeFileSync(
        fake,
        [
            "#!/usr/bin/env node",
            'const fs = require("fs");',
            'const path = require("path");',
            "const here = path.dirname(fs.realpathSync(__filename));",
            'const calls = Number(fs.readFileSync(path.join(here, "calls"), "utf8"));',
            'fs.writeFileSync(path.join(here, "calls"), String(calls + 1));',
            'const replies = JSON.parse(fs.readFileSync(path.join(here, "replies.json"), "utf8"));',
            "const [code, out, err] = replies[Math.min(calls, replies.length - 1)];",
            "process.stdout.write(out);",
            "process.stderr.write(err);",
            "process.exit(code);",
        ].join("\n"),
    );
    chmodSync(fake, 0o755);
    const result = spawnSync("bash", [DIST_TAG_SCRIPT, ...args], {
        encoding: "utf8",
        env: {
            ...process.env,
            PATH: `${dir}:${process.env["PATH"] ?? ""}`,
            RELEASE_RETRY_SECONDS: "0",
        },
    });
    return {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        calls: Number(readFileSync(join(dir, "calls"), "utf8")),
    };
}

const TAGS_JSON = JSON.stringify({
    latest: "0.77.0",
    next: "0.78.0-rc.1",
    "release-0.75": "0.75.1",
});

describe("scripts/release-dist-tag.sh (#472)", () => {
    it("reads a dotted dist-tag such as release-0.75 from the JSON, not a dotted path", () => {
        const run = runDistTag(["get", "tempest-react-sdk", "release-0.75"], [[0, TAGS_JSON, ""]]);
        expect(run.status).toBe(0);
        expect(run.stdout).toBe("0.75.1");
    });

    it("reads a missing dist-tag, or a failed npm view, as empty", () => {
        expect(runDistTag(["get", "p", "release-0.70"], [[0, TAGS_JSON, ""]]).stdout).toBe("");
        const failed = runDistTag(["get", "p", "latest"], [[1, "", "npm error code ETIMEDOUT"]]);
        expect(failed.status).toBe(0);
        expect(failed.stdout).toBe("");
    });

    it("reads the registry's latest", () => {
        const run = runDistTag(["current-latest", "p"], [[0, TAGS_JSON, ""]]);
        expect(run.status).toBe(0);
        expect(run.stdout).toBe("0.77.0");
    });

    it("counts only an explicit E404 as a package with no latest", () => {
        const run = runDistTag(["current-latest", "p"], [[1, "", "npm error code E404\n"]]);
        expect(run.status).toBe(0);
        expect(run.stdout).toBe("");
    });

    it("fails on an empty answer with exit 0, instead of reading it as a new package", () => {
        const run = runDistTag(["current-latest", "p"], [[0, "", ""]]);
        expect(run.status).toBe(1);
        expect(run.stdout).toBe("");
        expect(run.stderr).toContain("ERROR:");
    });

    it("fails when the package exists but has no latest dist-tag", () => {
        const run = runDistTag(
            ["current-latest", "p"],
            [[0, JSON.stringify({ next: "1.0.0-rc.1" }), ""]],
        );
        expect(run.status).toBe(1);
        expect(run.stderr).toContain("ERROR:");
    });

    it("retries a transient failure, then fails the run if it never answers", () => {
        const retried = runDistTag(
            ["current-latest", "p"],
            [
                [1, "", "npm error code ETIMEDOUT"],
                [0, TAGS_JSON, ""],
            ],
        );
        expect(retried.status).toBe(0);
        expect(retried.stdout).toBe("0.77.0");
        expect(retried.calls).toBe(2);
        const down = runDistTag(["current-latest", "p"], [[1, "", "npm error code ETIMEDOUT"]]);
        expect(down.status).toBe(1);
        expect(down.calls).toBe(10);
    });

    /**
     * npm 12.2.0, the CLI that published v0.74.0 through v0.82.0, prints `npm view
     * <pkg> dist-tags --json` wrapped in a one-element array; npm 10 prints the bare
     * object. The v0.78.0 publish read `[{"latest":"0.77.0"}]` as "no latest" and
     * stopped before publishing. An array that does not hold exactly one object is
     * still refused, since it cannot be told apart from several versions.
     */
    it("reads the dist-tags npm 12 wraps in a one-element array", () => {
        const wrapped = JSON.stringify([JSON.parse(TAGS_JSON)]);
        const latest = runDistTag(["current-latest", "p"], [[0, wrapped, ""]]);
        expect(latest.status).toBe(0);
        expect(latest.stdout).toBe("0.77.0");
        expect(runDistTag(["get", "p", "release-0.75"], [[0, wrapped, ""]]).stdout).toBe("0.75.1");
        const ambiguous = JSON.stringify([{ latest: "0.77.0" }, { latest: "0.76.0" }]);
        expect(runDistTag(["current-latest", "p"], [[0, ambiguous, ""]]).status).toBe(1);
        expect(runDistTag(["get", "p", "latest"], [[0, ambiguous, ""]]).stdout).toBe("");
    });

    it("picks the same dist-tag the guard writes", () => {
        expect(runDistTag(["pick", "0.78.0", "0.77.0"]).stdout.trim()).toBe("latest");
        expect(runDistTag(["pick", "0.77.0", "0.77.0"]).stdout.trim()).toBe("latest");
        expect(runDistTag(["pick", "0.75.1", "0.77.0"]).stdout.trim()).toBe("release-0.75");
        expect(runDistTag(["pick", "0.78.0-rc.1", "0.77.0"]).stdout.trim()).toBe("next");
        expect(runDistTag(["pick", "1.0.0", ""]).stdout.trim()).toBe("latest");
        expect(runDistTag(["pick", "1.0.0", "garbage"]).status).toBe(1);
    });

    it("never reads a dist-tag as a dotted npm view path, which drops release-0.75", () => {
        for (const file of ["release-tag.sh", "release-dist-tag.sh", "check-release-ref.sh"]) {
            expect(code(readFileSync(join(SCRIPTS, file), "utf8"))).not.toMatch(
                /dist-tags\.[$A-Za-z]/,
            );
        }
    });
});

/**
 * The fake registry and GitHub both fakes read and write, one JSON file per fixture.
 *
 * `latest` is a queue: each `npm view <pkg> dist-tags` reads the next entry and the
 * last one repeats, so a registry whose `latest` moves between two reads is
 * expressible. A publish under `latest` overrides the queue.
 */
interface FakeState {
    user: string | null;
    ghUser: boolean;
    latest: string[];
    latestOverride: string | null;
    tags: Record<string, string>;
    versions: Record<string, string>;
    integrityOverride: Record<string, string>;
    hiddenReads: number;
    versionReads: Record<string, number>;
    tagReads: number;
    publishVersion: string;
    releases: Record<string, string[]>;
    calls: string[][];
}

const FAKE_NPM = `#!/usr/bin/env node
const fs = require("fs");
const crypto = require("crypto");
const file = process.env.FAKE_STATE;
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const args = process.argv.slice(2);
state.calls.push(["npm", ...args]);
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--tag");
const done = (code, out = "", err = "") => {
    save();
    process.stdout.write(out);
    process.stderr.write(err);
    process.exit(code);
};
const latest = () =>
    state.latestOverride ?? state.latest[Math.min(state.tagReads, state.latest.length - 1)];
if (args[0] === "whoami") {
    if (state.user) done(0, state.user + "\\n");
    done(1, "", "npm error code E401\\n");
}
if (args[0] === "view") {
    const [, spec, field] = positional;
    if (field === "dist-tags") {
        const current = latest();
        state.tagReads += 1;
        done(0, JSON.stringify({ ...state.tags, latest: current }));
    }
    const version = spec.split("@").pop();
    if (field === "version") {
        if (!state.versions[version]) done(1, "", "npm error code E404\\n");
        state.versionReads[version] = (state.versionReads[version] ?? 0) + 1;
        if (state.versionReads[version] <= state.hiddenReads) done(1, "", "npm error code E404\\n");
        done(0, version + "\\n");
    }
    if (field === "dist.integrity") {
        done(0, (state.integrityOverride[version] ?? state.versions[version] ?? "") + "\\n");
    }
    done(1, "", "fake npm: unknown view " + args.join(" ") + "\\n");
}
if (args[0] === "publish") {
    if (args.includes("--dry-run")) done(0);
    const tarball = positional[1];
    const integrity =
        "sha512-" + crypto.createHash("sha512").update(fs.readFileSync(tarball)).digest("base64");
    const tag = args[args.indexOf("--tag") + 1];
    state.versions[state.publishVersion] = integrity;
    state.tags[tag] = state.publishVersion;
    if (tag === "latest") state.latestOverride = state.publishVersion;
    done(0);
}
done(1, "", "fake npm: unknown command " + args.join(" ") + "\\n");
`;

const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs");
const { execFileSync } = require("child_process");
const file = process.env.FAKE_STATE;
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const args = process.argv.slice(2);
state.calls.push(["gh", ...args]);
const done = (code, out = "") => {
    fs.writeFileSync(file, JSON.stringify(state));
    process.stdout.write(out);
    process.exit(code);
};
if (args[0] === "auth") done(state.ghUser ? 0 : 1);
if (args[0] === "api") {
    const tag = args[1].split("/commits/")[1];
    const lines = execFileSync("git", ["ls-remote", "origin", "refs/tags/" + tag], {
        encoding: "utf8",
    });
    done(lines ? 0 : 1, lines.split("\\t")[0] + "\\n");
}
if (args[0] === "release") {
    const tag = args[2];
    if (args[1] === "view") done(state.releases[tag] ? 0 : 1);
    if (args[1] === "create") state.releases[tag] = args.slice(3);
    done(0);
}
done(1);
`;

const PACK_STUB = `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$1"
VERSION=$(node -p 'require("./package.json").version')
echo "tarball of $(git rev-parse HEAD)" > "$1/tempest-react-sdk-$VERSION.tgz"
git rev-parse HEAD >> "$PACK_LOG"
`;

/** A fixture clone, its bare origin, the fakes' state file and the commits that matter. */
interface PublishFixture {
    dir: string;
    origin: string;
    bin: string;
    state: string;
    packLog: string;
    merge: string;
    after: string;
}

/**
 * A bare `origin` plus a clone whose `main` went through a release PR: `0.78.0`
 * (with the real guard scripts and `changelog.mjs`, and a stub `release-pack.sh`
 * that writes a fake tarball and logs the commit it packed), then the merge of
 * `release/v0.79.0`, then an unrelated PR merged after it, still at `0.79.0`. A fake
 * `npm` (registry `latest` at `0.78.0`, logged in) and a fake `gh` (logged in) wait
 * in `bin`. No network: `origin` is a directory and the registry is a JSON file.
 *
 * @returns The fixture.
 */
function mergedReleaseRepo(): PublishFixture {
    const root = mkdtempSync(join(tmpdir(), "tempest-release-tag-"));
    const origin = join(root, "origin.git");
    const dir = join(root, "clone");
    const bin = join(root, "bin");
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
    execFileSync("git", ["clone", "-q", origin, dir], { stdio: "ignore" });
    gitIn(dir, "checkout", "-q", "-b", "main");
    mkdirSync(join(dir, "scripts"));
    for (const script of ["check-release-ref.sh", "release-dist-tag.sh", "changelog.mjs"]) {
        copyFileSync(join(SCRIPTS, script), join(dir, "scripts", script));
    }
    writeFileSync(join(dir, "scripts", "release-pack.sh"), PACK_STUB);
    const pkg = (version: string): string => JSON.stringify({ name: "tempest-react-sdk", version });
    writeFileSync(join(dir, "package.json"), pkg("0.78.0"));
    writeFileSync(join(dir, "RELEASES.md"), "| v0.78.0 | 2026-10-12 | aaaaaaa |\n");
    writeFileSync(join(dir, "CHANGELOG.md"), "# Changelog\n\n## [0.78.0] — 2026-10-12\n\n- a\n");
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "0.78.0");
    gitIn(dir, "checkout", "-q", "-b", "release/v0.79.0");
    writeFileSync(join(dir, "package.json"), pkg("0.79.0"));
    writeFileSync(
        join(dir, "RELEASES.md"),
        "| v0.79.0 | 2026-10-25 | bbbbbbb |\n| v0.78.0 | 2026-10-12 | aaaaaaa |\n",
    );
    writeFileSync(
        join(dir, "CHANGELOG.md"),
        "# Changelog\n\n## [0.79.0] — 2026-10-25\n\n- notas da 0.79.0\n\n## [0.78.0] — 2026-10-12\n\n- a\n",
    );
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "chore: release v0.79.0");
    gitIn(dir, "checkout", "-q", "main");
    gitIn(dir, "merge", "-q", "--no-ff", "-m", "Merge release/v0.79.0", "release/v0.79.0");
    const merge = gitIn(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "other.txt"), "after");
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "fix: merged after the release");
    const after = gitIn(dir, "rev-parse", "HEAD");
    gitIn(dir, "push", "-q", "origin", "main", "release/v0.79.0");
    mkdirSync(bin);
    writeFileSync(join(bin, "npm"), FAKE_NPM);
    writeFileSync(join(bin, "gh"), FAKE_GH);
    chmodSync(join(bin, "npm"), 0o755);
    chmodSync(join(bin, "gh"), 0o755);
    const state = join(root, "state.json");
    const initial: FakeState = {
        user: "maintainer",
        ghUser: true,
        latest: ["0.78.0"],
        latestOverride: null,
        tags: {},
        versions: { "0.78.0": "sha512-old" },
        integrityOverride: {},
        hiddenReads: 0,
        versionReads: {},
        tagReads: 0,
        publishVersion: "0.79.0",
        releases: {},
        calls: [],
    };
    writeFileSync(state, JSON.stringify(initial));
    const packLog = join(root, "packed.log");
    writeFileSync(packLog, "");
    return { dir, origin, bin, state, packLog, merge, after };
}

/**
 * Change the fake registry and GitHub before a run.
 *
 * @param fixture - The fixture.
 * @param patch - The fields to replace.
 */
function setState(fixture: PublishFixture, patch: Partial<FakeState>): void {
    const current = JSON.parse(readFileSync(fixture.state, "utf8")) as FakeState;
    writeFileSync(fixture.state, JSON.stringify({ ...current, ...patch }));
}

/**
 * Read the fake registry and GitHub after a run.
 *
 * @param fixture - The fixture.
 * @returns The state, with every `npm` and `gh` call in order.
 */
function readState(fixture: PublishFixture): FakeState {
    return JSON.parse(readFileSync(fixture.state, "utf8")) as FakeState;
}

/**
 * The calls one fake received.
 *
 * @param fixture - The fixture.
 * @param tool - `npm` or `gh`.
 * @param sub - The subcommand to keep, such as `publish` or `release`.
 * @returns The argument lists, without the tool name.
 */
function callsOf(fixture: PublishFixture, tool: "npm" | "gh", sub: string): string[][] {
    return readState(fixture)
        .calls.filter((call) => call[0] === tool && call[1] === sub)
        .map((call) => call.slice(1));
}

/**
 * Run `scripts/release-tag.sh` in a fixture clone, with the fakes first on the PATH.
 *
 * @param fixture - The fixture.
 * @param tag - The version argument.
 * @param env - Extra environment (`DRY_RUN`, `REF`, `BASE_BRANCH`, `BACKPORT_LINES`).
 * @returns Exit status and combined output.
 */
function runReleaseTag(
    fixture: PublishFixture,
    tag: string,
    env: Record<string, string> = {},
): { status: number | null; output: string } {
    const result = spawnSync("bash", [RELEASE_TAG, tag], {
        cwd: fixture.dir,
        encoding: "utf8",
        env: {
            ...process.env,
            PATH: `${fixture.bin}:${process.env["PATH"] ?? ""}`,
            FAKE_STATE: fixture.state,
            PACK_LOG: fixture.packLog,
            DRY_RUN: "",
            REF: "",
            BASE_BRANCH: "",
            BACKPORT_LINES: "",
            RELEASE_READBACK_ATTEMPTS: "3",
            RELEASE_READBACK_SECONDS: "0",
            RELEASE_RETRY_SECONDS: "0",
            ...env,
        },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/**
 * The commits the stub `release-pack.sh` packed, in order.
 *
 * @param fixture - The fixture.
 * @returns One SHA per pack.
 */
function packed(fixture: PublishFixture): string[] {
    return readFileSync(fixture.packLog, "utf8").split("\n").filter(Boolean);
}

/**
 * The sha512 integrity npm would compute for a file's bytes.
 *
 * @param text - The file content.
 * @returns `sha512-<base64>`.
 */
function integrityOf(text: string): string {
    return `sha512-${createHash("sha512").update(text).digest("base64")}`;
}

describe("the tag is cut after the release PR is merged (#472)", { timeout: FLOW_TIMEOUT }, () => {
    it("never pushes the tag from scripts/release.sh", () => {
        const release = code(RELEASE_SH);
        expect(release).not.toMatch(/git push[^\n]*GIT_TAG/);
        expect(release).toMatch(/git tag -d "\$GIT_TAG"/);
        expect(release).toMatch(/make release-tag TAG=/);
    });

    it("publishes the merge commit of the release PR, not the tip of main, and pushes its tag", () => {
        const fixture = mergedReleaseRepo();
        const run = runReleaseTag(fixture, "0.79.0");
        expect(run.status, run.output).toBe(0);
        expect(packed(fixture)).toEqual([fixture.merge]);
        expect(gitIn(fixture.origin, "rev-parse", "refs/tags/v0.79.0^{commit}")).toBe(
            fixture.merge,
        );
    });

    it("refuses a version main is not at, which is a release PR not merged yet", () => {
        const fixture = mergedReleaseRepo();
        const run = runReleaseTag(fixture, "0.80.0");
        expect(run.status).toBe(1);
        expect(run.output).toContain("não em 0.80.0");
        expect(packed(fixture)).toEqual([]);
        expect(gitIn(fixture.origin, "tag", "-l")).toBe("");
    });

    it("refuses REF on a commit that is not on main", () => {
        const fixture = mergedReleaseRepo();
        gitIn(fixture.dir, "checkout", "-q", "release/v0.79.0");
        writeFileSync(join(fixture.dir, "extra.txt"), "unreviewed");
        gitIn(fixture.dir, "add", ".");
        gitIn(fixture.dir, "commit", "-q", "-m", "unreviewed");
        const run = runReleaseTag(fixture, "0.79.0", {
            REF: gitIn(fixture.dir, "rev-parse", "HEAD"),
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("não está em origin/main");
        expect(packed(fixture)).toEqual([]);
        expect(gitIn(fixture.origin, "tag", "-l")).toBe("");
    });

    /**
     * Rewritten, not deleted: a tag already on origin used to be refused outright,
     * because pushing it again would have re-run the workflow. Locally the same tag on
     * the same commit is a run that stopped half-way (the npm publish and the tag push
     * are separate steps), so it resumes; on another commit it is still refused.
     */
    it("refuses a tag that already exists on origin at another commit", () => {
        const fixture = mergedReleaseRepo();
        gitIn(fixture.origin, "tag", "v0.79.0", fixture.after);
        const run = runReleaseTag(fixture, "0.79.0");
        expect(run.status).toBe(1);
        expect(run.output).toContain("já existe no origin");
        expect(callsOf(fixture, "npm", "publish")).toEqual([]);
    });

    it("refuses a commit whose RELEASES.md lacks the version's row", () => {
        const fixture = mergedReleaseRepo();
        writeFileSync(join(fixture.dir, "RELEASES.md"), "| v0.78.0 | 2026-10-12 | aaaaaaa |\n");
        gitIn(fixture.dir, "commit", "-q", "-am", "drop the row");
        gitIn(fixture.dir, "push", "-q", "origin", "main");
        const run = runReleaseTag(fixture, "0.79.0", {
            REF: gitIn(fixture.dir, "rev-parse", "HEAD"),
        });
        expect(run.status).toBe(1);
        expect(run.output).toContain("RELEASES.md");
        expect(gitIn(fixture.origin, "tag", "-l")).toBe("");
    });
});

/**
 * The local publish (2026-11-13). What the four jobs of `release-npm.yml` guaranteed
 * is asserted here against the script that replaced them, end to end in a fixture.
 */
describe(
    "make release-tag publishes from the maintainer's machine",
    { timeout: FLOW_TIMEOUT },
    () => {
        it("refuses without npm login before building anything", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { user: null });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status).toBe(1);
            expect(run.output).toContain("npm login");
            expect(packed(fixture)).toEqual([]);
            expect(callsOf(fixture, "npm", "publish")).toEqual([]);
            expect(gitIn(fixture.origin, "tag", "-l")).toBe("");
        });

        it("refuses without gh login, which the GitHub Release needs", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { ghUser: false });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status).toBe(1);
            expect(run.output).toContain("gh auth login");
            expect(packed(fixture)).toEqual([]);
        });

        it("refuses a dirty working tree", () => {
            const fixture = mergedReleaseRepo();
            writeFileSync(join(fixture.dir, "other.txt"), "dirty");
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status).toBe(1);
            expect(run.output).toContain("working tree sujo");
            expect(packed(fixture)).toEqual([]);
        });

        it("publishes the tarball the pack step built and smoked, under its dist-tag, without provenance", () => {
            const fixture = mergedReleaseRepo();
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status, run.output).toBe(0);
            const publishes = callsOf(fixture, "npm", "publish");
            expect(publishes).toHaveLength(1);
            const args = publishes[0] ?? [];
            expect(args[1]).toMatch(/\/pack\/tempest-react-sdk-0\.79\.0\.tgz$/);
            expect(args.slice(2)).toEqual(["--access", "public", "--tag", "latest"]);
            expect(args).not.toContain("--provenance");
            expect(readState(fixture).versions["0.79.0"]).toBe(
                integrityOf(`tarball of ${fixture.merge}\n`),
            );
        });

        it("leaves no worktree behind", () => {
            const fixture = mergedReleaseRepo();
            runReleaseTag(fixture, "0.79.0");
            expect(gitIn(fixture.dir, "worktree", "list").split("\n")).toHaveLength(1);
        });

        it("creates nothing on a dry run, after packing and a publish --dry-run", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { user: null, ghUser: false });
            const run = runReleaseTag(fixture, "0.79.0", { DRY_RUN: "1" });
            expect(run.status, run.output).toBe(0);
            expect(run.output).toContain("DRY_RUN");
            expect(packed(fixture)).toEqual([fixture.merge]);
            expect(
                callsOf(fixture, "npm", "publish").map((args) => args.includes("--dry-run")),
            ).toEqual([true]);
            expect(readState(fixture).versions["0.79.0"]).toBeUndefined();
            expect(gitIn(fixture.dir, "tag", "-l")).toBe("");
            expect(gitIn(fixture.origin, "tag", "-l")).toBe("");
            expect(callsOf(fixture, "gh", "release")).toEqual([]);
        });

        it("re-reads latest and re-picks the dist-tag right before npm publish", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { latest: ["0.78.0", "0.80.0"] });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.output).toContain("publicando sob release-0.79, não latest");
            expect(callsOf(fixture, "npm", "publish")[0]?.slice(-2)).toEqual([
                "--tag",
                "release-0.79",
            ]);
        });

        it("waits for the registry to serve the version before pushing the tag", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { hiddenReads: 2 });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status, run.output).toBe(0);
            expect(run.output).toContain("o registry ainda não serve 0.79.0");
            expect(gitIn(fixture.origin, "tag", "-l")).toBe("v0.79.0");
        });

        it("pushes no tag and creates no Release when the registry never serves the version", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { hiddenReads: 99 });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status).toBe(1);
            expect(run.output).toContain("rode de novo `make release-tag TAG=0.79.0`");
            expect(gitIn(fixture.origin, "tag", "-l")).toBe("");
            expect(callsOf(fixture, "gh", "release")).toEqual([]);
        });

        it("resumes a version the registry already serves: no second publish, tag and Release still made", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, {
                versions: { "0.78.0": "sha512-old", "0.79.0": integrityOf(`tarball of x\n`) },
                latest: ["0.79.0"],
            });
            gitIn(fixture.origin, "tag", "v0.79.0", fixture.merge);
            const run = runReleaseTag(fixture, "0.79.0", {});
            expect(callsOf(fixture, "npm", "publish")).toEqual([]);
            expect(run.output).toContain("retomando a publicação");
            expect(callsOf(fixture, "gh", "release").map((args) => args[1])).toContain("create");
        });

        it("creates the Release with --verify-tag and --latest when npm's latest is this version", () => {
            const fixture = mergedReleaseRepo();
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status, run.output).toBe(0);
            const create =
                callsOf(fixture, "gh", "release").find((args) => args[1] === "create") ?? [];
            expect(create[2]).toBe("v0.79.0");
            expect(create[3]).toMatch(/tempest-react-sdk-0\.79\.0\.tgz$/);
            expect(create).toContain("--verify-tag");
            expect(create).toContain("--latest");
            expect(create).not.toContain("--prerelease");
            const notes = create[create.indexOf("--notes-file") + 1] ?? "";
            expect(notes).not.toBe("");
        });

        it("marks a release that is not npm's latest with --latest=false", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { latest: ["0.80.0"] });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status, run.output).toBe(0);
            const create =
                callsOf(fixture, "gh", "release").find((args) => args[1] === "create") ?? [];
            expect(create).toContain("--latest=false");
            expect(callsOf(fixture, "npm", "publish")[0]?.slice(-2)).toEqual([
                "--tag",
                "release-0.79",
            ]);
        });

        it("edits an existing Release without touching its Latest mark", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { releases: { "v0.79.0": ["existing"] } });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status, run.output).toBe(0);
            const release = callsOf(fixture, "gh", "release").map((args) => args[1]);
            expect(release).toEqual(["view", "edit", "upload"]);
            const edit = callsOf(fixture, "gh", "release").find((args) => args[1] === "edit") ?? [];
            expect(edit.join(" ")).not.toMatch(/latest/);
            const upload =
                callsOf(fixture, "gh", "release").find((args) => args[1] === "upload") ?? [];
            expect(upload).toContain("--clobber");
        });

        it("attaches only the bytes npm serves, and says how to attach the registry's", () => {
            const fixture = mergedReleaseRepo();
            setState(fixture, { integrityOverride: { "0.79.0": "sha512-different" } });
            const run = runReleaseTag(fixture, "0.79.0");
            expect(run.status).toBe(1);
            expect(run.output).toContain("npm pack tempest-react-sdk@0.79.0");
            const create =
                callsOf(fixture, "gh", "release").find((args) => args[1] === "create") ?? [];
            expect(create.some((arg) => arg.endsWith(".tgz"))).toBe(false);
            expect(create).toContain("--verify-tag");
            expect(callsOf(fixture, "gh", "release").map((args) => args[1])).not.toContain(
                "upload",
            );
        });
    },
);

/**
 * A fixture for #527 case C, locally: `origin/main` carries the real guard, and the
 * maintenance branch `release-0.79` carries a release commit at `0.79.50` whose own
 * `check-release-ref.sh` approves anything.
 *
 * @returns The fixture, with `release-0.79` pushed to origin.
 */
function selfApprovingBackport(): PublishFixture {
    const fixture = mergedReleaseRepo();
    gitIn(fixture.dir, "checkout", "-q", "-b", "release-0.79", fixture.merge);
    writeFileSync(
        join(fixture.dir, "package.json"),
        JSON.stringify({ name: "tempest-react-sdk", version: "0.79.50" }),
    );
    writeFileSync(join(fixture.dir, "RELEASES.md"), "| v0.79.50 | 2026-11-13 | ccccccc |\n");
    writeFileSync(
        join(fixture.dir, "scripts", "check-release-ref.sh"),
        '#!/usr/bin/env bash\necho "dist_tag=latest"\n',
    );
    gitIn(fixture.dir, "commit", "-q", "-am", "approve myself");
    gitIn(fixture.dir, "push", "-q", "origin", "release-0.79");
    gitIn(fixture.dir, "checkout", "-q", "main");
    setState(fixture, { latest: ["0.80.0"], publishVersion: "0.79.50" });
    return fixture;
}

describe(
    "the guard trusts neither the released commit nor a new branch (#527)",
    { timeout: FLOW_TIMEOUT },
    () => {
        it("runs the guard copied from origin/main, never the released commit's own", () => {
            const fixture = selfApprovingBackport();
            const run = runReleaseTag(fixture, "0.79.50", { BASE_BRANCH: "release-0.79" });
            expect(run.status).toBe(1);
            expect(run.output).toContain("release-0.79 is not an opened backport line");
            expect(packed(fixture)).toEqual([]);
            expect(callsOf(fixture, "npm", "publish")).toEqual([]);
        });

        it("publishes the backport under its release line once the publisher opens it", () => {
            const fixture = selfApprovingBackport();
            const run = runReleaseTag(fixture, "0.79.50", {
                BASE_BRANCH: "release-0.79",
                BACKPORT_LINES: "release-0.79",
            });
            expect(run.status, run.output).toBe(0);
            expect(callsOf(fixture, "npm", "publish")[0]?.slice(-2)).toEqual([
                "--tag",
                "release-0.79",
            ]);
            const create =
                callsOf(fixture, "gh", "release").find((args) => args[1] === "create") ?? [];
            expect(create).toContain("--latest=false");
        });

        it("copies both guard scripts out of origin/main", () => {
            const script = code(readFileSync(RELEASE_TAG, "utf8"));
            expect(script).toContain(
                'git show refs/remotes/origin/main:scripts/check-release-ref.sh >"$WORK/guard/check-release-ref.sh"',
            );
            expect(script).toContain(
                'git show refs/remotes/origin/main:scripts/release-dist-tag.sh >"$WORK/guard/release-dist-tag.sh"',
            );
            expect(script).not.toMatch(/bash scripts\/check-release-ref\.sh/);
            expect(existsSync(join(SCRIPTS, "release-pack.sh"))).toBe(true);
        });
    },
);
