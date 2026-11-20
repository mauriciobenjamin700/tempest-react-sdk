/**
 * Guards that keep the scaffold template and the gallery in step with the SDK's
 * required peer dependencies.
 *
 * A **required** peer is one the consuming app must install itself — the SDK
 * declares it but does not ship it. Every one of those is a package the app
 * would otherwise be missing at runtime, and for the context-carrying ones
 * (`react`, `react-dom`, `react-router`) the failure is loud but late: an
 * `ERR_MODULE_NOT_FOUND` at import, or a `<Router>` context that is not there.
 *
 * Two consumers live in this repo and must therefore list them:
 *
 * - `template/` — what `create-tempest-app` copies into a new project. A peer
 *   missing here ships a scaffold that breaks on first run.
 * - `examples/gallery/` — the Vite app the e2e suite drives against `file:../..`.
 *
 * This is the check that would have caught `react-router` moving from a direct
 * dependency to a peer: the manifest changed, and nothing else pointed at the
 * three other places that had to change with it.
 *
 * The template's `tempest-react-sdk` entry gets the opposite treatment — see the
 * final case for why it must stay absent.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

/**
 * Read a `package.json` from a path relative to the repository root.
 *
 * @param relativePath - Directory holding the manifest, e.g. `"template"`.
 * @returns The parsed manifest.
 */
function manifest(relativePath: string): Record<string, Record<string, string>> {
    return JSON.parse(readFileSync(join(ROOT, relativePath, "package.json"), "utf8"));
}

const sdk = manifest(".");

/**
 * Peers the consuming app must install, i.e. every entry in `peerDependencies`
 * that `peerDependenciesMeta` does not mark optional. Optional peers belong to a
 * single subpath (`recharts` → `/charts`, `leaflet` → the geo tile layer) and
 * only the apps using that subpath pay for them.
 */
const REQUIRED_PEERS = Object.keys(sdk.peerDependencies ?? {}).filter(
    (name) =>
        !(sdk.peerDependenciesMeta as unknown as Record<string, { optional?: boolean }>)?.[name]
            ?.optional,
);

describe("scaffold template", () => {
    it("declares every required peer the SDK expects the app to bring", () => {
        expect(REQUIRED_PEERS.length).toBeGreaterThan(0);

        const missing = REQUIRED_PEERS.filter((name) => !manifest("template").dependencies?.[name]);

        expect(
            missing,
            `template/package.json is missing required peers: ${missing.join(", ")}. ` +
                "A scaffolded app would not install them.",
        ).toEqual([]);
    });

    it("does not pin tempest-react-sdk, which the CLI stamps at scaffold time", () => {
        const deps = manifest("template").dependencies ?? {};

        expect(
            deps["tempest-react-sdk"],
            "create-tempest-app overwrites this key with the live SDK version on every " +
                "write path, so a literal range here is a dead value that only goes stale.",
        ).toBeUndefined();
    });
});

describe("gallery example", () => {
    it("declares every required peer so the e2e build resolves them", () => {
        const deps = manifest("examples/gallery").dependencies ?? {};
        const missing = REQUIRED_PEERS.filter((name) => !deps[name]);

        expect(
            missing,
            `examples/gallery/package.json is missing required peers: ${missing.join(", ")}.`,
        ).toEqual([]);
    });
});

describe("scaffold Content-Security-Policy", () => {
    it.each(["template", "template-pwa"])(
        "%s enforces a CSP from its first dev run, so a missing origin fails on the developer's machine",
        (dir) => {
            const config = readFileSync(join(ROOT, dir, "vite.config.ts"), "utf8");

            expect(
                config,
                `${dir}/vite.config.ts must wire tempestCsp(): without it the scaffold ships no ` +
                    "policy, and the first one the app writes by hand is usually build-only.",
            ).toMatch(/plugins:\s*\[[\s\S]*tempestCsp\(\)[\s\S]*\]/);
        },
    );
});

describe("scaffold session teardown (#531)", () => {
    const shell = readFileSync(join(ROOT, "template-pwa", "src", "pwa.tsx"), "utf8");

    it("template-pwa clears the service worker's session data whenever the signed-in account goes away", () => {
        expect(
            shell,
            "template-pwa/src/pwa.tsx must watch the auth store and call clearSessionData(): " +
                "the runtime caches and the background-sync queue otherwise survive logout " +
                "into the next account's session.",
        ).toMatch(/useAuth\.subscribe\(/);
        expect(shell).toMatch(/clearSessionData\(\)/);
    });

    it("template-pwa releases the browser's push subscription on the same teardown", () => {
        expect(
            shell,
            "a push subscription left behind keeps delivering the previous account's " +
                "notifications to whoever uses the device next.",
        ).toMatch(/subscription\?\.unsubscribe\(\)/);
    });
});

/**
 * GHSA-g3hv-75wg-m249: `minimatch >=7.0.0 <11.0.1` (globparts amplification).
 * `@typescript-eslint/typescript-estree@8.72.2` declared `minimatch ^10.2.2`, so
 * every fresh scaffold opened with 7 moderate `npm audit` findings, and the
 * `npm audit fix --force` npm suggested *downgraded* `typescript-eslint`. From
 * 0.86.0 to 0.90.0 the template forced the patched range on that one subtree with
 * a scoped `overrides` entry (and the root `package.json` did the same for this
 * repo's own tree).
 *
 * `typescript-eslint` 8.73.0 is the first stable release whose
 * `typescript-estree` declares `minimatch ^11.0.1` (8.72.2 declares `^10.2.2`;
 * checked with `npm view @typescript-eslint/typescript-estree@<v>
 * dependencies.minimatch` on 20/11/2026). So the fix moved from the override to
 * the template's **floor**: `^8.73.0` cannot resolve to a vulnerable estree, and
 * an override left behind would be a pin nobody re-reads that outlives its
 * reason. This block used to assert the override was present and to fail the
 * day upstream shipped the range; it now asserts the opposite, and the
 * `scripts/smoke-scaffold-audit.sh` run in `make check` stays the end-to-end
 * proof that the resolved scaffold is clean.
 */
const FIRST_PATCHED_TYPESCRIPT_ESLINT = [8, 73, 0] as const;

describe("scaffold npm audit (GHSA-g3hv-75wg-m249)", () => {
    const template = manifest("template") as Record<string, unknown>;
    const overrides = template.overrides as Record<string, Record<string, string>> | undefined;

    it("needs no minimatch override in the template or in this repo", () => {
        const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
            overrides?: Record<string, unknown>;
        };
        expect(
            overrides?.["@typescript-eslint/typescript-estree"],
            "the template's typescript-eslint floor already resolves the patched minimatch",
        ).toBeUndefined();
        expect(root.overrides?.["@typescript-eslint/typescript-estree"]).toBeUndefined();
    });

    it("pins the template's typescript-eslint floor at or above the first patched release", () => {
        const range = (template.devDependencies as Record<string, string>)["typescript-eslint"];
        const floor = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range)?.slice(1).map(Number);

        expect(floor, `unexpected typescript-eslint range "${range}"`).toBeDefined();
        const [major, minor, patch] = floor as number[];
        const [okMajor, okMinor, okPatch] = FIRST_PATCHED_TYPESCRIPT_ESLINT;
        expect(
            major === okMajor && (minor > okMinor || (minor === okMinor && patch >= okPatch)),
            `typescript-eslint ${range} can resolve an estree that declares minimatch <11.0.1`,
        ).toBe(true);
    });

    it("installs a typescript-estree that declares the patched minimatch itself", () => {
        const estree = JSON.parse(
            readFileSync(
                join(
                    ROOT,
                    "node_modules",
                    "@typescript-eslint",
                    "typescript-estree",
                    "package.json",
                ),
                "utf8",
            ),
        ) as { version: string; dependencies: Record<string, string> };
        const major = Number(/\d+/.exec(estree.dependencies.minimatch)?.[0]);

        expect(
            major,
            `@typescript-eslint/typescript-estree@${estree.version} declares minimatch ` +
                `${estree.dependencies.minimatch}`,
        ).toBeGreaterThanOrEqual(11);
    });

    it("merge mode carries the template's overrides into an existing package.json", () => {
        const dir = mkdtempSync(join(tmpdir(), "tempest-merge-"));
        try {
            writeFileSync(
                join(dir, "package.json"),
                JSON.stringify({
                    name: "existing-app",
                    version: "1.2.3",
                    overrides: { "some-pkg": "1.0.0" },
                }),
            );
            const run = spawnSync(
                process.execPath,
                [join(ROOT, "bin", "create-tempest-app.mjs"), "."],
                { cwd: dir, encoding: "utf8" },
            );
            expect(run.status, run.stderr).toBe(0);

            const merged = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
            expect(merged.name).toBe("existing-app");
            expect(merged.overrides).toEqual({ ...overrides, "some-pkg": "1.0.0" });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
