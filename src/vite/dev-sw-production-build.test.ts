// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ build: vi.fn() }));

vi.mock("vite", () => ({ build: mocks.build }));

import { precacheVersionBanner, tempestPwaDevSw } from "./tempest-pwa-dev-sw";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Run {
    emitted: { fileName: string; source: string }[];
    errors: string[];
}

/**
 * Drive the plugin's production `generateBundle` with a fake Rollup context.
 *
 * @param options - Plugin options.
 * @param bundle - The bundle the hook sees.
 * @param config - Resolved config overrides.
 * @returns What was emitted and what was raised through `this.error`.
 */
async function generate(
    options: Parameters<typeof tempestPwaDevSw>[0],
    bundle: Record<string, unknown>,
    config: Record<string, unknown> = {},
): Promise<Run> {
    const plugin = tempestPwaDevSw(options) as any;
    plugin.configResolved({ root: "/project", base: "/", command: "build", ...config });
    const run: Run = { emitted: [], errors: [] };
    const context = {
        emitFile: (file: { fileName: string; source: string }) => run.emitted.push(file),
        error: (message: string) => {
            run.errors.push(message);
            throw new Error(message);
        },
    };
    await plugin.generateBundle.handler.call(context, {}, bundle).catch(() => undefined);
    return run;
}

const chunk = (code: string) => ({ output: [{ type: "chunk", isEntry: true, code }] });

describe("tempestPwaDevSw — production build", () => {
    beforeEach(() => {
        mocks.build.mockReset();
        mocks.build.mockResolvedValue(chunk("worker();"));
    });

    it("runs after the other plugins' generateBundle, so the manifest is already in the bundle", () => {
        const plugin = tempestPwaDevSw() as any;
        expect(plugin.generateBundle.order).toBe("post");
    });

    it("bundles swSrc as a classic IIFE worker that never writes to disk", async () => {
        await generate({}, {});
        const config = mocks.build.mock.calls[0][0];
        expect(config.configFile).toBe(false);
        expect(config.build.write).toBe(false);
        expect(config.build.lib.formats).toEqual(["iife"]);
        expect(config.build.lib.entry).toBe("/project/src/sw.ts");
    });

    it("reads the version from a manifest emitted as bytes", async () => {
        const source = new TextEncoder().encode(JSON.stringify({ version: "abc", urls: [] }));
        const run = await generate({}, { "precache-manifest.json": { type: "asset", source } });
        expect(run.emitted[0].source).toBe(`${precacheVersionBanner("abc")}worker();`);
    });

    it("emits the worker unstamped when the manifest is unreadable", async () => {
        const run = await generate(
            {},
            {
                "precache-manifest.json": { type: "asset", source: "not json" },
            },
        );
        expect(run.emitted[0]).toEqual({ type: "asset", fileName: "sw.js", source: "worker();" });
    });

    it("emits the worker unstamped when the manifest has no string version", async () => {
        const run = await generate(
            {},
            {
                "precache-manifest.json": { type: "asset", source: JSON.stringify({ version: 1 }) },
            },
        );
        expect(run.emitted[0].source).toBe("worker();");
    });

    it("finds the entry chunk in a multi-output build result", async () => {
        mocks.build.mockResolvedValue([{ output: [] }, chunk("second();")]);
        const run = await generate({}, {});
        expect(run.emitted[0].source).toBe("second();");
    });

    it("fails the build when the bundle has no entry chunk", async () => {
        mocks.build.mockResolvedValue({ output: [{ type: "asset" }] });
        const run = await generate({}, {});
        expect(run.emitted).toEqual([]);
        expect(run.errors[0]).toContain("produced no service-worker chunk");
    });

    it("reports a non-Error rejection verbatim", async () => {
        mocks.build.mockRejectedValue("boom");
        const run = await generate({}, {});
        expect(run.errors[0]).toContain(": boom.");
    });

    it("emits at swUrl, stripping the base", async () => {
        const run = await generate({ swUrl: "/app/worker.js" }, {}, { base: "/app/" });
        expect(run.emitted[0].fileName).toBe("worker.js");
    });

    it("passes the app's mode and env settings to the worker build", async () => {
        await generate({}, {}, { mode: "staging", envDir: "/env", envPrefix: "APP_" });
        const config = mocks.build.mock.calls[0][0];
        expect(config).toMatchObject({ mode: "staging", envDir: "/env", envPrefix: "APP_" });
    });

    it("keeps a silent build silent and caps a verbose one at warn", async () => {
        await generate({}, {}, { logLevel: "silent" });
        await generate({}, {}, { logLevel: "info" });
        expect(mocks.build.mock.calls.map((call) => call[0].logLevel)).toEqual(["silent", "warn"]);
    });

    it("does nothing in serve, in an SSR build, or with build: false", async () => {
        await generate({}, {}, { command: "serve" });
        await generate({}, {}, { build: { ssr: true } });
        await generate({ build: false }, {});
        expect(mocks.build).not.toHaveBeenCalled();
    });

    it("falls back to cwd, production mode and default minify on a sparse config", async () => {
        const plugin = tempestPwaDevSw() as any;
        plugin.configResolved({ command: "build" });
        await plugin.generateBundle.handler.call({ emitFile: () => {}, error: () => {} }, {}, {});
        const config = mocks.build.mock.calls[0][0];
        expect(config).toMatchObject({ root: process.cwd(), mode: "production" });
        expect(config.build.minify).toBe(true);
    });
});
