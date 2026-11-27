/**
 * `scripts/background-server.mjs`, the server `docs:shots` starts. Before
 * #816 it killed `npm` and left the `vite` it had spawned holding port 4173,
 * which then made the next `make check` time out in Playwright's web server.
 *
 * @vitest-environment node
 */

import { createServer } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { startBackgroundServer } from "../scripts/background-server.mjs";

/**
 * A port nothing listens on.
 *
 * @returns The port.
 */
async function freePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    await new Promise((resolve) => server.close(resolve));
    return port;
}

/**
 * A parent that only spawns a child, and a child that holds the port — the
 * shape of `npm run preview` starting `vite preview`.
 *
 * @param port Port the grandchild listens on.
 * @returns `node -e` arguments.
 */
function parentSpawningServer(port: number): string[] {
    const server = `require("http").createServer((q, r) => r.end("ok")).listen(${port}, "127.0.0.1")`;
    const parent = `const c = require("child_process").spawn(process.execPath, ["-e", ${JSON.stringify(server)}], { stdio: "ignore" }); setInterval(() => {}, 1000);`;
    return ["-e", parent];
}

/**
 * Whether the port still answers after a short wait.
 *
 * @param origin The origin.
 * @returns `true` when it answers.
 */
async function stillAnswers(origin: string): Promise<boolean> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            await fetch(origin, { signal: AbortSignal.timeout(300) });
        } catch {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return true;
}

const stops: (() => void)[] = [];

afterEach(() => {
    for (const stop of stops.splice(0)) stop();
});

describe("startBackgroundServer", () => {
    it("stops the grandchild that holds the port, not only the process it started", async () => {
        const port = await freePort();
        const origin = `http://127.0.0.1:${port}`;
        const stop = await startBackgroundServer({
            command: process.execPath,
            args: parentSpawningServer(port),
            origin,
        });
        expect(await (await fetch(origin)).text()).toBe("ok");
        stop();
        expect(await stillAnswers(origin)).toBe(false);
    });

    it("refuses a port that already answers instead of capturing a stale server", async () => {
        const port = await freePort();
        const origin = `http://127.0.0.1:${port}`;
        stops.push(
            await startBackgroundServer({
                command: process.execPath,
                args: parentSpawningServer(port),
                origin,
            }),
        );
        await expect(
            startBackgroundServer({
                command: process.execPath,
                args: parentSpawningServer(port),
                origin,
            }),
        ).rejects.toThrow(/already answers/);
    });

    it("gives up when the process exits without ever answering", async () => {
        const port = await freePort();
        await expect(
            startBackgroundServer({
                command: process.execPath,
                args: ["-e", "process.exit(1)"],
                origin: `http://127.0.0.1:${port}`,
                timeoutMs: 5000,
            }),
        ).rejects.toThrow(/did not answer/);
    });
});
