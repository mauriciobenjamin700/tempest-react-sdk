import { beforeEach, describe, expect, it } from "vitest";

import { SessionSupersededError } from "../http";
import { createTempestAuth } from "./create-tempest-auth";

/**
 * Build a JSON `Response`, since the client only parses a body when the content
 * type says JSON.
 *
 * @param body - Value to serialize.
 * @param status - HTTP status, defaulting to 200.
 * @returns The response.
 */
function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/**
 * A promise and the function that settles it.
 *
 * @returns The gate.
 */
function gate(): { wait: Promise<void>; open: () => void } {
    let open!: () => void;
    const wait = new Promise<void>((resolve) => {
        open = resolve;
    });
    return { wait, open };
}

/**
 * Let pending timers and microtasks run.
 *
 * @returns A promise resolving on the next macrotask.
 */
function tick(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for a number of milliseconds of real time.
 *
 * @param ms - How long to wait.
 * @returns A promise resolving after `ms`.
 */
function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The rule decided in #657 (security audit run-16 §6) for a request that left
 * **without** a token and whose replay would pick up the token of a `login()`
 * that ran meanwhile. The two replay paths answer differently on purpose:
 *
 * - **`401` → `refresh` (`refreshFor`)**: replays with the login's token. The
 *   `401` is the server saying the anonymous request did nothing and needs a
 *   session; the sign-in was already in flight when the `401` was handled, and
 *   replaying with it is the `401` contract (#496).
 * - **`retry` (`run()`, #655)**: refuses with `SessionSupersededError`. The
 *   failure (a `503`, a network error) says nothing about credentials, and the
 *   server may have acted on the anonymous attempt; sending the replay with a
 *   token changes the request's authority without anyone asking.
 *
 * What both share — and what protects data — is that an attempt that carried a
 * token never replays under another session.
 */
describe("createTempestAuth — tokenless replay across a login (#657)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    function backend(anonymousStatus: number, login: Promise<void>) {
        const bearers: (string | null)[] = [];
        const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const path = new URL(String(input)).pathname;
            if (path === "/api/auth/login") {
                await login;
                return jsonResponse({ access_token: "B-tok", refresh_token: "B-ref" });
            }
            if (path === "/api/auth/me") return jsonResponse({ id: "B" });
            const bearer = new Headers(init?.headers).get("Authorization");
            bearers.push(bearer);
            if (bearer === null) return jsonResponse({ detail: "anonymous" }, anonymousStatus);
            return jsonResponse({ owner: bearer });
        }) as typeof fetch;
        return { fetcher, bearers };
    }

    it("replays a tokenless 401 with the token of the login in flight", async () => {
        const held = gate();
        const { fetcher, bearers } = backend(401, held.wait);
        const auth = createTempestAuth({ baseURL: "https://api.example.test", fetcher });

        const signingIn = auth.login({ email: "b@x.test", password: "x" });
        await tick();
        const anonymous = auth.api.get("/api/orders");
        await tick();
        held.open();
        await signingIn;

        await expect(anonymous).resolves.toEqual({ owner: "Bearer B-tok" });
        expect(bearers).toEqual([null, "Bearer B-tok"]);
    });

    it("refuses to retry a tokenless 503 with the token of a login that landed in the backoff", async () => {
        const held = gate();
        const { fetcher, bearers } = backend(503, held.wait);
        const auth = createTempestAuth({
            baseURL: "https://api.example.test",
            fetcher,
            retry: { retries: 2, initialDelay: 50, maxDelay: 50 },
        });

        const signingIn = auth.login({ email: "b@x.test", password: "x" });
        await tick();
        const anonymous = auth.api.get("/api/orders");
        const settled = anonymous.catch((error: unknown) => error);
        await wait(10);
        expect(bearers).toEqual([null]);
        held.open();
        await signingIn;

        expect(await settled).toBeInstanceOf(SessionSupersededError);
        expect(bearers).toEqual([null]);
    });
});
