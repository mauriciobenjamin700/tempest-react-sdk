/** @vitest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tempestOrtAssets } from "./tempest-ort-assets";

type Hook = (...args: unknown[]) => unknown;

let root = "";

/**
 * A project root with a fake `onnxruntime-web` install.
 *
 * @param files Files to put in its `dist/`.
 */
function install(files: string[]): void {
    const pkg = join(root, "node_modules", "onnxruntime-web");
    mkdirSync(join(pkg, "dist"), { recursive: true });
    writeFileSync(
        join(pkg, "package.json"),
        JSON.stringify({ name: "onnxruntime-web", main: "dist/ort.js" }),
    );
    writeFileSync(join(pkg, "dist", "ort.js"), "");
    for (const file of files) writeFileSync(join(pkg, "dist", file), `bytes of ${file}`);
}

const ALL = [
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.jsep.wasm",
    "ort-wasm-simd-threaded.jsep.mjs",
];

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ort-assets-"));
    writeFileSync(join(root, "package.json"), "{}");
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("tempestOrtAssets", () => {
    it("emits the four WASM backend files under ort/ in the build", () => {
        install(ALL);
        const plugin = tempestOrtAssets();
        (plugin.configResolved as Hook)({ root, base: "/" });
        const emitFile = vi.fn();
        (plugin.generateBundle as Hook).call({ emitFile });
        expect(
            emitFile.mock.calls.map(([file]) => (file as { fileName: string }).fileName),
        ).toEqual(ALL.map((name) => `ort/${name}`));
        expect(String((emitFile.mock.calls[0]?.[0] as { source: Buffer }).source)).toBe(
            "bytes of ort-wasm-simd-threaded.wasm",
        );
    });

    it("serves them in dev under the base, with the wasm content type, and passes anything else on", () => {
        install(ALL);
        const plugin = tempestOrtAssets({ path: "runtime" });
        (plugin.configResolved as Hook)({ root, base: "/app" });
        let middleware: Hook = () => undefined;
        (plugin.configureServer as Hook)({ middlewares: { use: (fn: Hook) => (middleware = fn) } });

        const headers: Record<string, string> = {};
        const response = { setHeader: (k: string, v: string) => (headers[k] = v), end: vi.fn() };
        const next = vi.fn();
        middleware({ url: "/app/runtime/ort-wasm-simd-threaded.jsep.wasm?v=1" }, response, next);
        expect(headers["content-type"]).toBe("application/wasm");
        expect(String(response.end.mock.calls[0]?.[0])).toBe(
            "bytes of ort-wasm-simd-threaded.jsep.wasm",
        );

        middleware({ url: "/app/runtime/ort-wasm-simd-threaded.mjs" }, response, next);
        expect(headers["content-type"]).toBe("text/javascript");

        middleware({ url: "/app/runtime/secrets.txt" }, response, next);
        middleware({ url: "/app/index.html" }, response, next);
        expect(next).toHaveBeenCalledTimes(2);
    });

    it("fails at startup naming the package when onnxruntime-web is not installed", () => {
        const plugin = tempestOrtAssets();
        expect(() => (plugin.configResolved as Hook)({ root, base: "/" })).toThrow(
            /npm install onnxruntime-web/,
        );
    });

    it("fails at startup naming the files a different version does not ship", () => {
        install(["ort-wasm-simd-threaded.wasm"]);
        const plugin = tempestOrtAssets();
        expect(() => (plugin.configResolved as Hook)({ root, base: "/" })).toThrow(
            /ort-wasm-simd-threaded\.mjs.*not found/,
        );
    });

    it("serves the files the real onnxruntime-web ships", () => {
        const plugin = tempestOrtAssets();
        expect(() =>
            (plugin.configResolved as Hook)({ root: process.cwd(), base: "/" }),
        ).not.toThrow();
    });

    it("makes dev and preview crossOriginIsolated with credentialless COEP only when asked", () => {
        const headers = {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "credentialless",
        };
        const plugin = tempestOrtAssets({ crossOriginIsolation: true });
        expect((plugin.config as Hook)({ worker: { format: "es" } })).toEqual({
            server: { headers },
            preview: { headers },
        });
        expect((plugin.config as Hook)({})).toEqual({
            worker: { format: "es" },
            server: { headers },
            preview: { headers },
        });
        expect(JSON.stringify((tempestOrtAssets().config as Hook)({}))).not.toContain(
            "Cross-Origin",
        );
    });

    it("builds workers as ES modules unless the app chose a format", () => {
        const plugin = tempestOrtAssets();
        expect((plugin.config as Hook)({})).toEqual({ worker: { format: "es" } });
        expect((plugin.config as Hook)({ worker: { format: "iife" } })).toBeUndefined();
    });
});
