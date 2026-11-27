// @ts-check

/**
 * Start a local server for a script, and make sure it dies with the script.
 */

import { spawn } from "node:child_process";

/**
 * Whether something already answers at `origin`.
 *
 * @param {string} origin E.g. `http://127.0.0.1:4173`.
 * @returns {Promise<boolean>} `true` when a request gets any response.
 */
async function answers(origin) {
    try {
        await fetch(origin, { signal: AbortSignal.timeout(1000) });
        return true;
    } catch {
        return false;
    }
}

/**
 * Start a long-lived server process and resolve once `origin` answers.
 *
 * Two things went wrong with the shape this replaces (#816), both silently:
 *
 * - `spawn("npm", ["run", "preview"])` + `child.kill()` signals `npm`, not the
 *   `vite` it started; the grandchild survived every run and kept port 4173,
 *   so the next `make check` timed out waiting for Playwright's web server.
 *   The process is now started in its own group (`detached`) and stopped by
 *   signalling the whole group, so nothing it spawns outlives it.
 * - A leftover server on the port would answer the readiness probe, and the
 *   script would go on against an old build. Refusing to start when the port
 *   already answers turns that into an error that names the port.
 *
 * @param {{ command: string, args: string[], cwd?: string, origin: string, timeoutMs?: number }} options
 *   What to run, and where it will answer.
 * @returns {Promise<() => void>} Stops the server and everything it spawned.
 * @throws {Error} When the port is already taken, or the server does not answer in time.
 */
export async function startBackgroundServer({ command, args, cwd, origin, timeoutMs = 60_000 }) {
    if (await answers(origin)) {
        throw new Error(
            `${origin} already answers — a server left over from an earlier run is holding the ` +
                "port. Stop it (ss -ltnp | grep <port>) and run again.",
        );
    }
    const child = spawn(command, args, { cwd, stdio: "ignore", detached: true });
    const stop = () => {
        try {
            if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
        } catch {
            return;
        }
    };
    const deadline = Date.now() + timeoutMs;
    while (!(await answers(origin))) {
        if (child.exitCode !== null || Date.now() > deadline) {
            stop();
            throw new Error(`server did not answer on ${origin} within ${timeoutMs / 1000}s`);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return stop;
}
