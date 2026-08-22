import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    context: vi.fn(),
    rebuild: vi.fn(),
    dispose: vi.fn(),
}));

vi.mock("esbuild", () => ({ context: mocks.context }));

import { tempestPwaDevSw } from "./tempest-pwa-dev-sw";

type Handler = (
    req: { url: string },
    res: { setHeader: (name: string, value: string) => void; end: (body: string) => void },
    next: () => void,
) => Promise<void>;

interface Harness {
    /** Ask for `/sw.js` the way the browser does. */
    request: () => Promise<string[]>;
    /** Close the dev server, as Vite does on shutdown. */
    close: () => Promise<void>;
}

/**
 * Mount the plugin's middleware over a fake dev server.
 *
 * @returns A request driver and the shutdown hook.
 */
function mount(): Harness {
    const plugin = tempestPwaDevSw({ swSrc: "src/sw.ts" }) as unknown as {
        configResolved: (config: { root: string }) => void;
        configureServer: (server: {
            middlewares: { use: (fn: Handler) => void };
            httpServer: null;
        }) => void;
        buildEnd: () => Promise<void>;
    };

    plugin.configResolved({ root: process.cwd() });

    let handler: Handler | undefined;
    plugin.configureServer({
        middlewares: {
            use: (fn) => {
                handler = fn;
            },
        },
        httpServer: null,
    });

    return {
        request: async () => {
            const ended: string[] = [];
            await handler?.(
                { url: "/sw.js" },
                { setHeader: () => {}, end: (body) => ended.push(body) },
                () => {},
            );
            return ended;
        },
        close: () => plugin.buildEnd(),
    };
}

/**
 * The dev worker is not requested once per session.
 *
 * `Cache-Control: no-cache` guarantees one request per page load, and Chrome
 * re-fetches the worker script on every navigation and on its own update checks.
 * A cold `esbuild.build()` per request paid a full bundle of the worker's whole
 * import graph each time, on the dev server's main thread, with the page waiting
 * to register.
 */
describe("tempestPwaDevSw — incremental rebuilds", () => {
    beforeEach(() => {
        mocks.context.mockReset();
        mocks.rebuild.mockReset();
        mocks.dispose.mockReset();
        mocks.rebuild.mockResolvedValue({ outputFiles: [{ text: "// worker" }] });
        mocks.dispose.mockResolvedValue(undefined);
        mocks.context.mockResolvedValue({ rebuild: mocks.rebuild, dispose: mocks.dispose });
    });

    it("creates the context once and rebuilds per request", async () => {
        const server = mount();

        expect(await server.request()).toEqual(["// worker"]);
        await server.request();
        await server.request();

        expect(mocks.context).toHaveBeenCalledTimes(1);
        expect(mocks.rebuild).toHaveBeenCalledTimes(3);
    });

    it("does not create the context until something asks for the worker", () => {
        mount();
        expect(mocks.context).not.toHaveBeenCalled();
    });

    it("collapses a burst of concurrent requests onto one rebuild", async () => {
        const server = mount();

        const bodies = await Promise.all([server.request(), server.request(), server.request()]);

        expect(mocks.rebuild).toHaveBeenCalledTimes(1);
        for (const ended of bodies) expect(ended).toEqual(["// worker"]);
    });

    it("releases the esbuild process when the server closes, and starts fresh after", async () => {
        const server = mount();
        await server.request();

        await server.close();
        expect(mocks.dispose).toHaveBeenCalledTimes(1);

        await server.request();
        expect(mocks.context).toHaveBeenCalledTimes(2);
    });

    it("disposes only once when both shutdown paths fire", async () => {
        const server = mount();
        await server.request();

        await server.close();
        await server.close();

        expect(mocks.dispose).toHaveBeenCalledTimes(1);
    });

    it("answers with a readable 500 and retries on the next request when the bundle fails", async () => {
        mocks.rebuild.mockRejectedValueOnce(new Error("no such file"));
        const server = mount();

        expect((await server.request())[0]).toContain("SW dev build failed");

        mocks.rebuild.mockResolvedValue({ outputFiles: [{ text: "// worker" }] });
        expect(await server.request()).toEqual(["// worker"]);
    });
});
