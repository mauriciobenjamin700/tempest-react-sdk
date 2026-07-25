// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { createViteConfig } from "./create-vite-config";

interface ResolvedConfig {
    plugins?: unknown[];
    resolve?: { alias?: Record<string, string> };
    server?: {
        port?: number;
        host?: string | boolean;
        open?: boolean;
        proxy?: Record<string, { target: string; changeOrigin: boolean }>;
    };
}

describe("createViteConfig", () => {
    it("aliases @ to the src directory by default", () => {
        const config = createViteConfig() as ResolvedConfig;
        expect(config.resolve?.alias?.["@"]).toBe(resolve(process.cwd(), "src"));
    });

    it("respects a custom srcDir and merges extra aliases", () => {
        const config = createViteConfig({
            srcDir: "app",
            alias: { "~": "/lib" },
        }) as ResolvedConfig;
        expect(config.resolve?.alias?.["@"]).toBe(resolve(process.cwd(), "app"));
        expect(config.resolve?.alias?.["~"]).toBe("/lib");
    });

    it("applies dev-server defaults and overrides", () => {
        const config = createViteConfig({ port: 4000, host: true, open: true }) as ResolvedConfig;
        expect(config.server?.port).toBe(4000);
        expect(config.server?.host).toBe(true);
        expect(config.server?.open).toBe(true);
    });

    it("expands string proxy entries to changeOrigin targets", () => {
        const config = createViteConfig({
            proxy: { "/api": "http://127.0.0.1:8000" },
        }) as ResolvedConfig;
        expect(config.server?.proxy?.["/api"]).toEqual({
            target: "http://127.0.0.1:8000",
            changeOrigin: true,
        });
    });

    it("includes the react plugin", () => {
        const config = createViteConfig() as ResolvedConfig;
        expect(Array.isArray(config.plugins)).toBe(true);
        expect((config.plugins ?? []).length).toBeGreaterThan(0);
    });
});

describe("createViteConfig — proxy objects and plugin merging", () => {
    it("passes a proxy object through untouched", () => {
        const config = createViteConfig({
            proxy: { "/api": { target: "http://127.0.0.1:8000", ws: true } },
        }) as { server?: { proxy?: Record<string, unknown> } };
        expect(config.server?.proxy?.["/api"]).toEqual({
            target: "http://127.0.0.1:8000",
            ws: true,
        });
    });

    it("concatenates plugins from the base and the overrides", () => {
        const marker = { name: "extra-plugin" };
        const config = createViteConfig({ plugins: [marker] }) as { plugins?: unknown[] };
        expect(config.plugins).toContain(marker);
        expect((config.plugins ?? []).length).toBeGreaterThan(1);
    });
});
