// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { tempestPwaDevSw } from "./tempest-pwa-dev-sw";
import { tempestPwaIcons } from "./tempest-pwa-icons";
import { tempestPwaManifest } from "./tempest-pwa-manifest";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe("tempestPwaManifest", () => {
    it("emits a precache manifest with built assets + the app shell, skipping maps", () => {
        const plugin = tempestPwaManifest() as any;
        plugin.configResolved({ base: "/" });

        const emitFile = vi.fn();
        const bundle = {
            "assets/a.js": {},
            "assets/a.css": {},
            "index.html": {},
            "assets/a.js.map": {},
        };
        plugin.generateBundle.call({ emitFile }, {}, bundle);

        expect(emitFile).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(emitFile.mock.calls[0][0].source);
        expect(payload.urls).toContain("/assets/a.js");
        expect(payload.urls).toContain("/index.html");
        expect(payload.urls).not.toContain("/assets/a.js.map");
        expect(typeof payload.version).toBe("string");
    });

    it("honors additionalUrls and a custom base", () => {
        const plugin = tempestPwaManifest({ additionalUrls: ["/manifest.webmanifest"] }) as any;
        plugin.configResolved({ base: "/app/" });
        const emitFile = vi.fn();
        plugin.generateBundle.call({ emitFile }, {}, { "assets/x.js": {} });

        const payload = JSON.parse(emitFile.mock.calls[0][0].source);
        expect(payload.urls).toContain("/manifest.webmanifest");
        expect(payload.urls).toContain("/app/assets/x.js");
    });
});

describe("tempestPwaManifest — options and base handling", () => {
    /** Run generateBundle with a fake Rollup context and return the manifest. */
    function emit(
        options: Parameters<typeof tempestPwaManifest>[0],
        bundle: Record<string, unknown>,
        base = "/",
    ) {
        const plugin = tempestPwaManifest(options) as any;
        plugin.configResolved({ base });
        const emitFile = vi.fn();
        plugin.generateBundle.call({ emitFile }, {}, bundle);
        const call = emitFile.mock.calls[0]?.[0] as
            | { fileName: string; source: string }
            | undefined;
        return call ? { fileName: call.fileName, ...JSON.parse(call.source) } : undefined;
    }

    it("normalises a base without a trailing slash", () => {
        const manifest = emit({}, { "assets/a.js": {} }, "/app");
        expect(manifest?.urls).toContain("/app/assets/a.js");
    });

    it("drops the app shell when appShell is false", () => {
        const manifest = emit({ appShell: false }, { "assets/a.js": {} });
        expect(manifest?.urls).not.toContain("/index.html");
    });

    it("guarantees the shell even when the bundle has no html", () => {
        const manifest = emit({}, { "assets/a.js": {} });
        expect(manifest?.urls).toContain("/index.html");
    });

    it("keeps html assets by default", () => {
        const manifest = emit({}, { "extra.html": {}, "assets/a.js": {} });
        expect(manifest?.urls).toContain("/extra.html");
    });

    it("drops html assets when includeHtml is off", () => {
        const manifest = emit({ includeHtml: false }, { "extra.html": {}, "assets/a.js": {} });
        expect(manifest?.urls).not.toContain("/extra.html");
        // The app shell is added explicitly, so it survives the html filter.
        expect(manifest?.urls).toContain("/index.html");
    });

    it("honours a custom exclude pattern and never lists itself", () => {
        const manifest = emit(
            { exclude: /\.css$/, fileName: "pc.json" },
            { "assets/a.css": {}, "assets/a.js": {}, "pc.json": {} },
        );
        expect(manifest?.fileName).toBe("pc.json");
        expect(manifest?.urls).not.toContain("/assets/a.css");
        expect(manifest?.urls).not.toContain("/pc.json");
    });

    it("produces a stable version for the same asset list and a new one otherwise", () => {
        const a = emit({}, { "assets/a.js": {} });
        const b = emit({}, { "assets/a.js": {} });
        const c = emit({}, { "assets/b.js": {} });
        expect(a?.version).toBe(b?.version);
        expect(a?.version).not.toBe(c?.version);
    });
});

describe("tempestPwaIcons", () => {
    it("is a build-only plugin", () => {
        const plugin = tempestPwaIcons() as any;
        expect(plugin.name).toBe("tempest-pwa-icons");
        expect(plugin.apply).toBe("build");
    });

    it("warns and emits nothing when sharp is absent", async () => {
        const plugin = tempestPwaIcons() as any;
        plugin.configResolved({ root: "/nonexistent" });
        const warn = vi.fn();
        const emitFile = vi.fn();
        await plugin.generateBundle.call({ warn, emitFile });

        expect(warn).toHaveBeenCalled();
        expect(emitFile).not.toHaveBeenCalled();
    });

    it("injects apple splash links only when appleSplash is on", () => {
        expect((tempestPwaIcons() as any).transformIndexHtml()).toBeUndefined();

        const tags = (tempestPwaIcons({ appleSplash: true }) as any).transformIndexHtml();
        expect(Array.isArray(tags)).toBe(true);
        expect(tags.length).toBeGreaterThan(0);
        for (const tag of tags) {
            expect(tag.tag).toBe("link");
            expect(tag.attrs.rel).toBe("apple-touch-startup-image");
            expect(tag.attrs.media).toMatch(/device-width.*orientation: portrait/);
            expect(tag.attrs.href).toMatch(/^\/splash\/apple-splash-\d+x\d+\.png$/);
        }
    });

    it("honors a custom appleSplash spec list", () => {
        const tags = (
            tempestPwaIcons({ appleSplash: [{ width: 390, height: 844, ratio: 3 }] }) as any
        ).transformIndexHtml();
        expect(tags).toHaveLength(1);
        expect(tags[0].attrs.href).toBe("/splash/apple-splash-1170x2532.png");
    });
});

describe("tempestPwaDevSw", () => {
    it("is a serve-only plugin", () => {
        const plugin = tempestPwaDevSw() as any;
        expect(plugin.name).toBe("tempest-pwa-dev-sw");
        expect(plugin.apply).toBe("serve");
    });

    it("serves an empty dev manifest and passes other requests through", async () => {
        const plugin = tempestPwaDevSw() as any;
        let handler: any;
        plugin.configureServer({ middlewares: { use: (fn: any) => (handler = fn) } });

        const ended: string[] = [];
        const res = { setHeader: vi.fn(), end: (body: string) => ended.push(body) };
        await handler({ url: "/precache-manifest.json" }, res, vi.fn());
        expect(JSON.parse(ended[0])).toEqual({ version: "dev", urls: [] });

        const next = vi.fn();
        await handler({ url: "/something-else" }, { setHeader: vi.fn(), end: vi.fn() }, next);
        expect(next).toHaveBeenCalled();
    });

    it("respects enabled: false (no middleware registered)", () => {
        const plugin = tempestPwaDevSw({ enabled: false }) as any;
        const use = vi.fn();
        plugin.configureServer({ middlewares: { use } });
        expect(use).not.toHaveBeenCalled();
    });
});
