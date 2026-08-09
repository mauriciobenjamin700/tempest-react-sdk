import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

/**
 * Build a fetcher that answers with the given statuses in order, repeating the
 * last one once the list runs out.
 *
 * @param statuses - HTTP statuses to answer with, one per call.
 * @returns A `fetch` stub the client can be configured with.
 */
function fetcherFor(...statuses: number[]) {
    let call = 0;
    return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        const status = statuses[Math.min(call, statuses.length - 1)];
        call += 1;
        return new Response("{}", {
            status,
            headers: { "content-type": "application/json" },
        });
    });
}

/**
 * A refresh that resolves is not proof the session is alive: the backend can
 * hand back a token it then refuses, and the replay comes back 401 a second
 * time. Before this path was covered the client threw without ever calling
 * `onUnauthorized`, so the store kept a dead session, no guard ever saw
 * `isAuthenticated` flip, and the user sat on a generic error with no way back
 * to the login screen.
 */
describe("createApiClient — session that stays dead after a refresh", () => {
    it("calls onUnauthorized when the replay is 401 again", async () => {
        const fetcher = fetcherFor(401, 401);
        const onUnauthorized = vi.fn();
        const refresh = vi.fn().mockResolvedValue(undefined);

        const api = createApiClient({ baseURL: "https://x", fetcher, refresh, onUnauthorized });

        await expect(api.get("/y")).rejects.toMatchObject({ status: 401 });
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
    });

    it("does not call onUnauthorized when the replay succeeds", async () => {
        const fetcher = fetcherFor(401, 200);
        const onUnauthorized = vi.fn();
        const refresh = vi.fn().mockResolvedValue(undefined);

        const api = createApiClient({ baseURL: "https://x", fetcher, refresh, onUnauthorized });

        await expect(api.get("/y")).resolves.toEqual({});
        expect(onUnauthorized).not.toHaveBeenCalled();
    });
});

describe("createApiClient — opt-in retry", () => {
    it("runs a single attempt when retry is not configured", async () => {
        const fetcher = fetcherFor(503);
        const api = createApiClient({ baseURL: "https://x", fetcher });

        await expect(api.get("/y")).rejects.toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("replays an idempotent request until it succeeds", async () => {
        const fetcher = fetcherFor(503, 503, 200);
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            retry: { initialDelay: 1 },
        });

        await expect(api.get("/y")).resolves.toEqual({});
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("never replays a write on the built-in policy", async () => {
        const fetcher = fetcherFor(503);
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            retry: { initialDelay: 1 },
        });

        await expect(api.post("/y", { body: { a: 1 } })).rejects.toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each([400, 403, 404, 422])("does not replay a %d", async (status) => {
        const fetcher = fetcherFor(status);
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            retry: { initialDelay: 1 },
        });

        await expect(api.get("/y")).rejects.toMatchObject({ status });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each([408, 425, 429, 500, 502, 503])("replays a %d", async (status) => {
        const fetcher = fetcherFor(status, 200);
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            retry: { initialDelay: 1 },
        });

        await expect(api.get("/y")).resolves.toEqual({});
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("accepts retry: true as the built-in policy", async () => {
        const fetcher = fetcherFor(500, 200);
        const api = createApiClient({ baseURL: "https://x", fetcher, retry: true });

        await expect(api.get("/y")).resolves.toEqual({});
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("lets a caller-supplied shouldRetry replace the policy, method check included", async () => {
        const fetcher = fetcherFor(503, 200);
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            retry: { initialDelay: 1, shouldRetry: () => true },
        });

        await expect(api.post("/y", { body: { a: 1 } })).resolves.toEqual({});
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("gives every attempt its own request id", async () => {
        const fetcher = fetcherFor(503, 200);
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            retry: { initialDelay: 1 },
        });

        await api.get("/y");

        const ids = fetcher.mock.calls.map(
            (call) =>
                (call[1] as RequestInit & { headers: Record<string, string> }).headers[
                    "X-Request-ID"
                ],
        );
        expect(ids[0]).toBeTruthy();
        expect(ids[1]).toBeTruthy();
        expect(ids[0]).not.toBe(ids[1]);
    });

    it("stops replaying once retries are exhausted", async () => {
        const fetcher = fetcherFor(503);
        const api = createApiClient({
            baseURL: "https://x",
            fetcher,
            retry: { retries: 2, initialDelay: 1 },
        });

        await expect(api.get("/y")).rejects.toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});
