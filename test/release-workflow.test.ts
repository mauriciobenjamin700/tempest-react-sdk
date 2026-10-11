import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
