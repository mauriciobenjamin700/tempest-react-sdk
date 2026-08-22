import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { isApiError } from "./errors";

/** A fetcher that never answers, so only the timeout can end the call. */
const hangs = (): typeof fetch =>
    vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                const fail = (): void => reject(new DOMException("Aborted", "AbortError"));
                if (init?.signal?.aborted) {
                    fail();
                    return;
                }
                init?.signal?.addEventListener("abort", fail);
            }),
    ) as unknown as typeof fetch;

const ok = (): typeof fetch =>
    vi.fn(async () => Response.json({ ok: true }, { status: 200 })) as unknown as typeof fetch;

/**
 * There was no timeout at all, and the gap it left is not an error path.
 *
 * A TCP connection that dies without a FIN never answers, so `fetch` can hold a
 * request for minutes or forever. The observable symptom is a spinner that never
 * resolves, on exactly the bad network an offline-first SDK exists to survive.
 */
describe("createApiClient — timeout", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("abandons a hanging request after the default 15s", async () => {
        const api = createApiClient({ baseURL: "https://x.test", fetcher: hangs() });
        const pending = api.get("/slow");

        await vi.advanceTimersByTimeAsync(14_999);
        await vi.advanceTimersByTimeAsync(2);

        await expect(pending).rejects.toMatchObject({ status: 0 });
    });

    it("reports the timeout as an ApiError with status 0, so retry already knows it", async () => {
        const api = createApiClient({ baseURL: "https://x.test", fetcher: hangs(), timeout: 50 });
        const pending = api.get("/slow").catch((error: unknown) => error);

        await vi.advanceTimersByTimeAsync(60);
        const error = await pending;

        expect(isApiError(error)).toBe(true);
        expect((error as { status: number }).status).toBe(0);
        expect((error as { detail: string }).detail).toContain("50ms");
    });

    it("honours a per-request override over the client default", async () => {
        const api = createApiClient({
            baseURL: "https://x.test",
            fetcher: hangs(),
            timeout: 10_000,
        });
        const pending = api.get("/slow", { timeout: 40 }).catch((e: unknown) => e);

        await vi.advanceTimersByTimeAsync(50);

        expect(((await pending) as { status: number }).status).toBe(0);
    });

    it("never abandons the request when the timeout is null", async () => {
        const api = createApiClient({ baseURL: "https://x.test", fetcher: hangs(), timeout: null });
        let settled = false;
        void api.get("/stream").then(
            () => (settled = true),
            () => (settled = true),
        );

        await vi.advanceTimersByTimeAsync(10 * 60_000);

        expect(settled).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("gives a FormData body the upload timeout instead of the request one", async () => {
        const api = createApiClient({
            baseURL: "https://x.test",
            fetcher: hangs(),
            timeout: 100,
            uploadTimeout: 5_000,
        });
        const form = new FormData();
        form.set("file", new Blob(["x"]), "a.bin");
        const pending = api.post("/upload", { body: form }).catch((e: unknown) => e);

        // Past the request timeout, nowhere near the upload one.
        await vi.advanceTimersByTimeAsync(1_000);
        expect(await Promise.race([pending, Promise.resolve("still going")])).toBe("still going");

        await vi.advanceTimersByTimeAsync(4_500);
        expect(((await pending) as { status: number }).status).toBe(0);
    });

    it("clears its timer once the response arrives", async () => {
        const api = createApiClient({ baseURL: "https://x.test", fetcher: ok() });

        await api.get("/fast");

        expect(vi.getTimerCount()).toBe(0);
    });
});

/**
 * The caller's own abort must stay an abort.
 *
 * Turning it into an `ApiError` with `status: 0` — the shape a timeout takes —
 * would make the retry policy replay a request the caller deliberately
 * cancelled, and `isRetriableStatus(0)` is `true`.
 */
describe("createApiClient — caller abort versus timeout", () => {
    it("propagates a caller abort as an abort, not as a status 0", async () => {
        const api = createApiClient({
            baseURL: "https://x.test",
            fetcher: hangs(),
            timeout: 60_000,
        });
        const controller = new AbortController();
        const pending = api.get("/slow", { signal: controller.signal }).catch((e: unknown) => e);

        controller.abort();
        const error = await pending;

        expect(error).toBeInstanceOf(DOMException);
        expect(isApiError(error)).toBe(false);
    });

    it("does not send a request whose signal is already aborted", async () => {
        const fetcher = hangs();
        const api = createApiClient({ baseURL: "https://x.test", fetcher });
        const controller = new AbortController();
        controller.abort();

        await expect(api.get("/a", { signal: controller.signal })).rejects.toBeInstanceOf(
            DOMException,
        );
    });

    it("still forwards the caller signal, which is how react-query cancels", async () => {
        const fetcher = ok();
        const api = createApiClient({ baseURL: "https://x.test", fetcher });
        const controller = new AbortController();

        await api.get("/a", { signal: controller.signal });

        const init = (fetcher as unknown as { mock: { calls: [string, RequestInit][] } }).mock
            .calls[0][1];
        expect(init.signal).toBeDefined();
        expect(init.signal?.aborted).toBe(false);
    });
});

/**
 * A timeout takes the shape the client already had for "never reached the
 * server", so nothing downstream needed a special case.
 *
 * `isRetriableStatus(0)` is `true`, so the built-in policy replays a timed-out
 * `GET` without knowing what a timeout is. That is the whole reason for choosing
 * `status: 0` over a new error kind.
 */
describe("createApiClient — a timeout meets the existing retry policy", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("replays a timed-out idempotent request", async () => {
        let attempts = 0;
        const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
            attempts += 1;
            if (attempts === 1) {
                return new Promise<Response>((_r, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                });
            }
            return Promise.resolve(Response.json({ ok: true }, { status: 200 }));
        }) as unknown as typeof fetch;

        const api = createApiClient({
            baseURL: "https://x.test",
            fetcher,
            timeout: 30,
            retry: { retries: 3, initialDelay: 0 },
        });

        const pending = api.get<{ ok: boolean }>("/flaky");
        await vi.advanceTimersByTimeAsync(200);

        await expect(pending).resolves.toEqual({ ok: true });
        expect(attempts).toBe(2);
    });

    it("does not replay a caller abort, which is not an ApiError", async () => {
        const fetcher = vi.fn(
            (_url: string | URL | Request, init?: RequestInit) =>
                new Promise<Response>((_r, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                }),
        ) as unknown as typeof fetch;

        const api = createApiClient({
            baseURL: "https://x.test",
            fetcher,
            timeout: null,
            retry: { retries: 3, initialDelay: 0 },
        });
        const controller = new AbortController();
        const pending = api.get("/x", { signal: controller.signal }).catch((e: unknown) => e);

        controller.abort();
        await vi.advanceTimersByTimeAsync(10);

        expect(await pending).toBeInstanceOf(DOMException);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("lets upload() carry a signal and its own timeout", async () => {
        const fetcher = vi.fn(
            (_url: string | URL | Request, init?: RequestInit) =>
                new Promise<Response>((_r, reject) => {
                    init?.signal?.addEventListener("abort", () =>
                        reject(new DOMException("Aborted", "AbortError")),
                    );
                }),
        ) as unknown as typeof fetch;

        const api = createApiClient({ baseURL: "https://x.test", fetcher });
        const form = new FormData();
        form.set("file", new Blob(["x"]), "a.bin");

        const pending = api
            .upload("/files", form, "POST", { timeout: 40 })
            .catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(50);

        expect((await pending) as { status: number }).toMatchObject({ status: 0 });
    });
});
