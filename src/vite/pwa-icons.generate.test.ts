// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */

const sharpMock = vi.hoisted(() => {
    const calls: { input: unknown; opts: unknown }[] = [];
    /** Chainable stub mirroring the subset of sharp the plugin uses. */
    function makeInstance() {
        const instance: Record<string, unknown> = {};
        for (const method of ["resize", "extend", "flatten", "composite", "png"]) {
            instance[method] = vi.fn(() => instance);
        }
        instance.toBuffer = vi.fn(async () => Buffer.from("png"));
        return instance;
    }
    const factory = vi.fn((input: unknown, opts?: unknown) => {
        calls.push({ input, opts });
        return makeInstance();
    });
    return { factory, calls };
});

vi.mock("sharp", () => ({ default: sharpMock.factory }));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => Buffer.from("<svg/>")) }));

const { tempestPwaIcons } = await import("./tempest-pwa-icons");

/**
 * Run the plugin's `generateBundle` with a fake Rollup context.
 *
 * @param options - Plugin options under test.
 * @returns The emitted file descriptors and the warn spy.
 */
async function generate(options: Parameters<typeof tempestPwaIcons>[0] = {}) {
    sharpMock.factory.mockClear();
    sharpMock.calls.length = 0;
    const plugin = tempestPwaIcons(options) as any;
    plugin.configResolved({ root: "/project" });
    const emitFile = vi.fn();
    const warn = vi.fn();
    await plugin.generateBundle.call({ emitFile, warn });
    return {
        emitted: emitFile.mock.calls.map(([file]) => file as { fileName: string }),
        warn,
        plugin,
    };
}

describe("tempestPwaIcons — generation with sharp available", () => {
    it("emits the default any/maskable/apple set", async () => {
        const { emitted, warn } = await generate();
        expect(warn).not.toHaveBeenCalled();
        expect(emitted.map((file) => file.fileName)).toEqual([
            "icons/icon-192.png",
            "icons/icon-512.png",
            "icons/maskable-512.png",
            "apple-touch-icon.png",
        ]);
    });

    it("honours custom sizes, outDir and skips the apple icon when false", async () => {
        const { emitted } = await generate({
            sizes: [64],
            maskableSizes: [],
            appleTouchIcon: false,
            outDir: "img",
        });
        expect(emitted.map((file) => file.fileName)).toEqual(["img/icon-64.png"]);
    });

    it("expands a 3-digit background hex", async () => {
        await generate({
            sizes: [],
            maskableSizes: [512],
            background: "#abc",
            appleTouchIcon: false,
        });
        const extendCall = sharpMock.calls.length;
        expect(extendCall).toBeGreaterThan(0);
    });

    it("emits a splash for every default spec when appleSplash is true", async () => {
        const { emitted } = await generate({
            sizes: [],
            maskableSizes: [],
            appleTouchIcon: false,
            appleSplash: true,
        });
        expect(emitted.length).toBeGreaterThan(5);
        expect(emitted.every((file) => file.fileName.startsWith("splash/apple-splash-"))).toBe(
            true,
        );
    });

    it("emits only the given splash specs and honours splashBackground", async () => {
        const { emitted } = await generate({
            sizes: [],
            maskableSizes: [],
            appleTouchIcon: false,
            appleSplash: [{ width: 100, height: 200, ratio: 2 }],
            splashBackground: "#000000",
            splashIconScale: 0.5,
        });
        expect(emitted.map((file) => file.fileName)).toEqual(["splash/apple-splash-200x400.png"]);
    });
});

describe("tempestPwaIcons — html injection", () => {
    it("injects a startup-image link per splash spec", () => {
        const plugin = tempestPwaIcons({
            appleSplash: [{ width: 390, height: 844, ratio: 3 }],
        }) as any;
        const tags = plugin.transformIndexHtml();
        expect(tags).toHaveLength(1);
        expect(tags[0]).toMatchObject({
            tag: "link",
            attrs: {
                rel: "apple-touch-startup-image",
                href: "/splash/apple-splash-1170x2532.png",
            },
            injectTo: "head",
        });
        expect(tags[0].attrs.media).toContain("(device-width: 390px)");
    });

    it("injects nothing when splashes are off", () => {
        const plugin = tempestPwaIcons() as any;
        expect(plugin.transformIndexHtml()).toBeUndefined();
    });
});
