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
 * `@typescript-eslint/typescript-estree@8.72.2` still declares `minimatch ^10.2.2`,
 * so every fresh scaffold opened with 7 moderate `npm audit` findings, and the
 * `npm audit fix --force` npm suggested *downgraded* `typescript-eslint`. The fix
 * is upstream (the `8.72.3` canary declares `^11.0.1`); until it is stable, the
 * template forces the patched range on that one subtree.
 *
 * The override is scoped on purpose: a top-level `"minimatch"` would also drag
 * the `glob`/`minimatch@3` consumers elsewhere in the tree onto a major they were
 * never written for.
 */
const PATCHED_MINIMATCH = "^11.0.1";

describe("scaffold npm audit (GHSA-g3hv-75wg-m249)", () => {
    const overrides = (manifest("template") as Record<string, unknown>).overrides as
        Record<string, Record<string, string>> | undefined;

    it("template forces the patched minimatch under @typescript-eslint/typescript-estree", () => {
        expect(
            overrides?.["@typescript-eslint/typescript-estree"]?.minimatch,
            "template/package.json lost the override: a fresh scaffold opens with 7 " +
                "moderate npm audit findings again.",
        ).toBe(PATCHED_MINIMATCH);
    });

    it("drops the override once typescript-eslint ships the patched range itself", () => {
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
            `@typescript-eslint/typescript-estree@${estree.version} already declares ` +
                `minimatch ${estree.dependencies.minimatch}: raise the template's ` +
                "typescript-eslint floor to it and delete the overrides from " +
                "template/package.json and package.json, rewriting this test to assert " +
                "they are gone.",
        ).toBeLessThan(11);
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
