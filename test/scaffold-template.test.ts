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
import { readFileSync } from "node:fs";
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
