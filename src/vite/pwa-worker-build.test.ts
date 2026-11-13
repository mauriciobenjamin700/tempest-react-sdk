// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tempestPwaDevSw } from "./tempest-pwa-dev-sw";
import { tempestPwaManifest } from "./tempest-pwa-manifest";

/* eslint-disable @typescript-eslint/no-explicit-any */

const projects: string[] = [];

afterEach(() => {
    for (const dir of projects.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a minimal PWA app to a temp dir: a page that registers `/sw.js`, a
 * worker that reads an env var, and one file in `public/`.
 *
 * The worker imports nothing from the SDK so the build exercises the plugins
 * alone, not the package resolution of a consumer.
 *
 * @returns The project root.
 */
function scaffold(): string {
    const root = mkdtempSync(join(tmpdir(), "tempest-pwa-build-"));
    projects.push(root);
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "public"));
    writeFileSync(
        join(root, "index.html"),
        '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head>' +
            '<body><script type="module" src="/src/main.ts"></script></body></html>',
    );
    writeFileSync(join(root, "src/main.ts"), 'void navigator.serviceWorker?.register("/sw.js");\n');
    writeFileSync(
        join(root, "src/sw.ts"),
        'self.addEventListener("install", () => console.log("greeting", import.meta.env.VITE_GREETING));\n',
    );
    writeFileSync(join(root, "public/icon.svg"), "<svg/>");
    writeFileSync(join(root, ".env"), "VITE_GREETING=hello-from-env\n");
    return root;
}

/**
 * Run a real `vite build` of `root` with the given plugins.
 *
 * @param root - Project root from {@link scaffold}.
 * @param plugins - The plugins under test.
 * @param base - Vite `base`.
 * @returns The output directory.
 */
async function viteBuild(root: string, plugins: unknown[], base = "/"): Promise<string> {
    await build({
        root,
        base,
        configFile: false,
        logLevel: "silent",
        plugins: plugins as never,
        build: { outDir: "dist", emptyOutDir: true },
    });
    return join(root, "dist");
}

describe("production build with tempestPwaManifest + tempestPwaDevSw (#573)", () => {
    it("emits dist/sw.js next to the precache manifest", async () => {
        const root = scaffold();
        const dist = await viteBuild(root, [
            tempestPwaManifest({ additionalUrls: ["/icon.svg"] }),
            tempestPwaDevSw(),
        ]);

        expect(existsSync(join(dist, "precache-manifest.json"))).toBe(true);
        expect(existsSync(join(dist, "sw.js"))).toBe(true);
    }, 30_000);

    it("bundles the worker as a classic script with the app's env inlined", async () => {
        const root = scaffold();
        const dist = await viteBuild(root, [tempestPwaManifest(), tempestPwaDevSw()]);
        const worker = readFileSync(join(dist, "sw.js"), "utf8");

        expect(worker).toContain("hello-from-env");
        expect(worker).not.toMatch(/^\s*(import|export)\s/m);
        expect(worker).not.toContain("import.meta");
    }, 30_000);

    it("stamps the worker with the precache version, so a new deploy reinstalls it", async () => {
        const root = scaffold();
        const dist = await viteBuild(root, [tempestPwaManifest(), tempestPwaDevSw()]);
        const manifest = JSON.parse(readFileSync(join(dist, "precache-manifest.json"), "utf8"));
        const worker = readFileSync(join(dist, "sw.js"), "utf8");

        expect(worker.startsWith(`/* tempest-precache-version: ${manifest.version} */`)).toBe(true);
        expect(manifest.urls).not.toContain("/sw.js");
    }, 30_000);

    it("emits the worker under the base path when the app is served from a subpath", async () => {
        const root = scaffold();
        const dist = await viteBuild(
            root,
            [tempestPwaManifest({ additionalUrls: ["/icon.svg"] }), tempestPwaDevSw()],
            "/app/",
        );

        expect(existsSync(join(dist, "sw.js"))).toBe(true);
        const manifest = JSON.parse(readFileSync(join(dist, "precache-manifest.json"), "utf8"));
        expect(manifest.urls).toContain("/app/icon.svg");
    }, 30_000);

    it("fails the build when the manifest ships without any worker", async () => {
        const root = scaffold();
        await expect(viteBuild(root, [tempestPwaManifest()])).rejects.toThrow(
            /no service worker at \/sw\.js/,
        );
    }, 30_000);

    it("fails the build when the worker entry does not exist", async () => {
        const root = scaffold();
        await expect(
            viteBuild(root, [tempestPwaManifest(), tempestPwaDevSw({ swSrc: "src/missing.ts" })]),
        ).rejects.toThrow(/could not bundle the service worker "src\/missing\.ts"/);
    }, 30_000);

    it("fails the build on an additionalUrls entry that is not a real file", async () => {
        const root = scaffold();
        await expect(
            viteBuild(root, [
                tempestPwaManifest({ additionalUrls: ["/manifest.webmanifest"] }),
                tempestPwaDevSw(),
            ]),
        ).rejects.toThrow(/additionalUrls lists \/manifest\.webmanifest/);
    }, 30_000);

    it("builds without a worker when the worker is declared external", async () => {
        const root = scaffold();
        const dist = await viteBuild(root, [
            tempestPwaManifest(),
            tempestPwaDevSw({ build: false }),
        ]);

        expect(existsSync(join(dist, "precache-manifest.json"))).toBe(true);
        expect(existsSync(join(dist, "sw.js"))).toBe(false);
    }, 30_000);
});

describe("tempestPwaManifest — writeBundle guards", () => {
    /**
     * Drive `configResolved` + `writeBundle` with a fake context.
     *
     * @param options - Manifest options.
     * @param bundle - The final bundle the hook sees.
     * @param config - Extra resolved config (plugins, base, publicDir).
     * @returns The `this.error` spy.
     */
    function check(
        options: Parameters<typeof tempestPwaManifest>[0],
        bundle: Record<string, unknown>,
        config: Record<string, unknown> = {},
    ) {
        const plugin = tempestPwaManifest(options) as any;
        plugin.configResolved({ base: "/", publicDir: "", plugins: [], ...config });
        const error = vi.fn();
        plugin.writeBundle.call({ error }, {}, bundle);
        return error;
    }

    it("reads the worker URL from tempestPwaDevSw's api", () => {
        const worker = tempestPwaDevSw({ swUrl: "/worker.js" }) as any;
        expect(check({}, { "worker.js": {} }, { plugins: [worker] })).not.toHaveBeenCalled();
        expect(check({}, { "sw.js": {} }, { plugins: [worker] })).toHaveBeenCalledWith(
            expect.stringContaining("no service worker at /worker.js"),
        );
    });

    it("lets an explicit serviceWorker URL win over the sibling plugin's", () => {
        const worker = tempestPwaDevSw() as any;
        const error = check(
            { serviceWorker: "/custom.js" },
            { "sw.js": {} },
            { plugins: [worker] },
        );
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining("no service worker at /custom.js"),
        );
    });

    it("stands down when serviceWorker is false", () => {
        expect(check({ serviceWorker: false }, {})).not.toHaveBeenCalled();
    });

    it("accepts a worker URL already spelled with the base", () => {
        const error = check({ serviceWorker: "/app/sw.js" }, { "sw.js": {} }, { base: "/app/" });
        expect(error).not.toHaveBeenCalled();
    });

    it("does not check absolute http(s) additionalUrls", () => {
        const error = check(
            { serviceWorker: false, additionalUrls: ["https://cdn.example.com/font.woff2"] },
            {},
        );
        expect(error).not.toHaveBeenCalled();
    });

    it("accepts an additionalUrls entry that is in the bundle", () => {
        const error = check(
            { serviceWorker: false, additionalUrls: ["/assets/a.js"] },
            {
                "assets/a.js": {},
            },
        );
        expect(error).not.toHaveBeenCalled();
    });

    it("rejects an additionalUrls entry that names a directory of public/", () => {
        const publicDir = mkdtempSync(join(tmpdir(), "tempest-pwa-public-"));
        projects.push(publicDir);
        mkdirSync(join(publicDir, "icons"));
        const error = check(
            { serviceWorker: false, additionalUrls: ["/icons"] },
            {},
            { publicDir },
        );
        expect(error).toHaveBeenCalledWith(expect.stringContaining("additionalUrls lists /icons"));
    });
});
