import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppErrorReporter } from "./app-error-reporter";
import type { CreateAppErrorReporterOptions } from "./app-error-reporter";

const ENDPOINT = "https://api.example.test/api/app-errors";

function answer(status: number, headers: Record<string, string> = {}): Response {
    return new Response(status === 201 ? "{}" : null, { status, headers });
}

function inits(fetchMock: ReturnType<typeof vi.fn>): RequestInit[] {
    return (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(
        ([, init]) => init,
    );
}

function bodies(fetchMock: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
    return inits(fetchMock).map((init) => JSON.parse(init.body as string));
}

function setOnline(online: boolean): void {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
}

const built: Array<ReturnType<typeof createAppErrorReporter>> = [];

function build(
    fetchMock: ReturnType<typeof vi.fn>,
    extra: Partial<CreateAppErrorReporterOptions> = {},
) {
    return track(
        createAppErrorReporter({
            endpoint: ENDPOINT,
            fetch: fetchMock as unknown as typeof fetch,
            storage: null,
            ...extra,
        }),
    );
}

function track(reporter: ReturnType<typeof createAppErrorReporter>) {
    built.push(reporter);
    return reporter;
}

describe("createAppErrorReporter", () => {
    beforeEach(() => setOnline(true));
    afterEach(() => {
        built.splice(0).forEach((reporter) => reporter.dispose());
        vi.useRealTimers();
        localStorage.clear();
    });

    it("sends the described error with the device facts of the moment it happened", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        let version = "1.4.0";
        const reporter = build(fetchMock, {
            autoFlush: false,
            device: () => ({ platform: "web", app_version: version }),
        });
        reporter.report(new TypeError("bad"), { step: "crop" });
        version = "1.5.0";
        await reporter.flush();
        expect(bodies(fetchMock)[0]).toMatchObject({
            code: "TypeError",
            platform: "web",
            app_version: "1.4.0",
        });
        expect(bodies(fetchMock)[0]?.message).toContain('context: {"step":"crop"}');
    });

    it("sends the bearer when there is one, and anonymously when the getter fails", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const withToken = build(fetchMock, { autoFlush: false, getToken: async () => "tok" });
        withToken.report("x");
        await withToken.flush();
        const failing = build(fetchMock, {
            autoFlush: false,
            getToken: () => {
                throw new Error("no session");
            },
        });
        failing.report("y");
        await failing.flush();
        const headers = inits(fetchMock).map((init) => init.headers);
        expect(headers[0]).toMatchObject({ Authorization: "Bearer tok" });
        expect(headers[1]).not.toHaveProperty("Authorization");
    });

    it("queues while offline and sends when the browser comes back online", async () => {
        setOnline(false);
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock);
        reporter.report(new Error("in the field"));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(reporter.pending()).toHaveLength(1);
        setOnline(true);
        window.dispatchEvent(new Event("online"));
        await vi.waitFor(() => expect(reporter.pending()).toHaveLength(0));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        reporter.dispose();
    });

    it("keeps the queue across a reload through localStorage", () => {
        setOnline(false);
        const fetchMock = vi.fn();
        build(fetchMock, { storage: undefined }).report(new Error("persisted"));
        expect(build(fetchMock, { storage: undefined }).pending()).toHaveLength(1);
    });

    it("stops on a network failure or a 5xx and keeps the reports for the next try", async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            .mockResolvedValueOnce(answer(503));
        const reporter = build(fetchMock, { autoFlush: false });
        reporter.report("a");
        reporter.report("b");
        expect(await reporter.flush()).toEqual({
            sent: 0,
            dropped: 0,
            pending: 2,
            retryAfterMs: null,
        });
        expect(await reporter.flush()).toMatchObject({ sent: 0, pending: 2 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("drops a report the backend refuses for good, so it cannot block the rest", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(answer(422))
            .mockResolvedValueOnce(answer(201));
        const reporter = build(fetchMock, { autoFlush: false });
        reporter.report("poison");
        reporter.report("fine");
        expect(await reporter.flush()).toEqual({
            sent: 1,
            dropped: 1,
            pending: 0,
            retryAfterMs: null,
        });
    });

    it("pauses on 429 for Retry-After and resumes on its own", async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(answer(429, { "Retry-After": "30" }))
            .mockResolvedValue(answer(201));
        const reporter = build(fetchMock, { autoFlush: true });
        reporter.report("first");
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        reporter.report("second");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(30_000);
        await vi.waitFor(() => expect(reporter.pending()).toHaveLength(0));
        expect(fetchMock).toHaveBeenCalledTimes(3);
        reporter.dispose();
    });

    it("reads a Retry-After given as an HTTP date", async () => {
        const fetchMock = vi.fn(async () =>
            answer(429, { "Retry-After": new Date(Date.now() + 120_000).toUTCString() }),
        );
        const reporter = build(fetchMock, { autoFlush: false });
        reporter.report("x");
        const { retryAfterMs } = await reporter.flush();
        expect(retryAfterMs).toBeGreaterThan(100_000);
        reporter.dispose();
    });

    it("waits a minute when a 429 carries no usable Retry-After", async () => {
        const fetchMock = vi.fn(async () => answer(429, { "Retry-After": "soon" }));
        const reporter = build(fetchMock, { autoFlush: false });
        reporter.report("x");
        expect((await reporter.flush()).retryAfterMs).toBe(60_000);
        reporter.dispose();
    });

    it("marks a folded report with how many times it repeated", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock, { autoFlush: false });
        for (let i = 0; i < 3; i += 1) reporter.report("same failure");
        await reporter.flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(bodies(fetchMock)[0]?.message).toBe("[repeated 3×]\nsame failure");
    });

    it("shares one run between concurrent flushes", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock, { autoFlush: false });
        reporter.report("x");
        const [a, b] = await Promise.all([reporter.flush(), reporter.flush()]);
        expect(a).toBe(b);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("still reports when the device getter throws", () => {
        const reporter = build(vi.fn(), {
            autoFlush: false,
            device: () => {
                throw new Error("no UA");
            },
        });
        reporter.report("x");
        expect(reporter.pending()[0]?.report).toEqual({ code: "Error", message: "x" });
    });

    it("clear() drops everything waiting", () => {
        const reporter = build(vi.fn(), { autoFlush: false });
        reporter.report("x");
        reporter.clear();
        expect(reporter.pending()).toEqual([]);
    });

    it("stops listening for online after dispose()", () => {
        setOnline(false);
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock);
        reporter.report("x");
        reporter.dispose();
        setOnline(true);
        window.dispatchEvent(new Event("online"));
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps the report queued when fetch resolves without a Response", async () => {
        const reporter = build(
            vi.fn(async () => undefined),
            { autoFlush: false },
        );
        reporter.report("x");
        expect(await reporter.flush()).toMatchObject({ sent: 0, pending: 1 });
    });

    it("falls back to the global fetch", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        vi.stubGlobal("fetch", fetchMock);
        try {
            const reporter = track(
                createAppErrorReporter({ endpoint: ENDPOINT, storage: null, autoFlush: false }),
            );
            reporter.report("x");
            await reporter.flush();
            expect(fetchMock).toHaveBeenCalledWith(
                ENDPOINT,
                expect.objectContaining({ method: "POST" }),
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("createAppErrorReporter — who a queued report belongs to (#441)", () => {
    beforeEach(() => setOnline(true));
    afterEach(() => {
        built.splice(0).forEach((reporter) => reporter.dispose());
        localStorage.clear();
    });

    function session(initial: string | null) {
        let token: string | null = initial;
        return {
            getToken: () => token,
            switchTo(next: string | null) {
                token = next;
            },
        };
    }

    function authorizations(fetchMock: ReturnType<typeof vi.fn>): Array<string | undefined> {
        return inits(fetchMock).map(
            (init) => (init.headers as Record<string, string>).Authorization,
        );
    }

    it("never sends A's offline report with B's bearer when the app gives no getPrincipal", async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new TypeError("Failed to fetch"))
            .mockResolvedValue(answer(201));
        const auth = session("token-dummyA");
        const reporter = build(fetchMock, { autoFlush: false, getToken: auth.getToken });
        reporter.report(new Error("upload failed"), { record: "A-fixture-42" });
        expect(await reporter.flush()).toMatchObject({ sent: 0, pending: 1 });
        auth.switchTo(null);
        auth.switchTo("token-dummyB");
        expect(await reporter.flush()).toMatchObject({ sent: 1, pending: 0 });
        expect(authorizations(fetchMock)).toEqual(["Bearer token-dummyA", undefined]);
        expect(bodies(fetchMock)[1]?.message).toContain("A-fixture-42");
    });

    it("never sends A's report with B's bearer after a reload, when the app gives getPrincipal", async () => {
        setOnline(false);
        const fetchMock = vi.fn(async () => answer(201));
        const auth = session("token-dummyA");
        let principal: string | null = "user-a";
        const options: Partial<CreateAppErrorReporterOptions> = {
            storage: undefined,
            getToken: () => auth.getToken(),
            getPrincipal: () => principal,
        };
        build(fetchMock, options).report(new Error("upload failed"), { record: "A-fixture-42" });
        principal = null;
        auth.switchTo(null);
        principal = "user-b";
        auth.switchTo("token-dummyB");
        setOnline(true);
        const reloaded = build(fetchMock, { ...options, autoFlush: false });
        expect(await reloaded.flush()).toMatchObject({ sent: 1, pending: 0 });
        expect(authorizations(fetchMock)).toEqual([undefined]);
    });

    it("sends anonymously across a token refresh even for the same principal, since only the token proves the bearer", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const auth = session("token-1");
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: auth.getToken,
            getPrincipal: () => "user-a",
        });
        reporter.report("x");
        auth.switchTo("token-2");
        await reporter.flush();
        expect(authorizations(fetchMock)).toEqual([undefined]);
    });

    it("sends anonymously after a token refresh when there is no getPrincipal", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const auth = session("token-1");
        const reporter = build(fetchMock, { autoFlush: false, getToken: auth.getToken });
        reporter.report("x");
        auth.switchTo("token-2");
        await reporter.flush();
        expect(authorizations(fetchMock)).toEqual([undefined]);
    });

    it("stamps the owner from an async getToken at report time, before the flush reads the queue", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        let token = "token-dummyA";
        const reporter = build(fetchMock, { autoFlush: false, getToken: async () => token });
        reporter.report("a");
        const first = reporter.flush();
        await first;
        reporter.report("b");
        token = "token-dummyB";
        await reporter.flush();
        expect(authorizations(fetchMock)).toEqual(["Bearer token-dummyA", undefined]);
    });

    it("drops, when asked to, every report not proven to be the current principal's — anonymous ones included", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        let principal: string | null = null;
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => (principal ? `token-${principal}` : null),
            getPrincipal: () => principal,
            foreignReports: "drop",
        });
        reporter.report("before login");
        principal = "a";
        reporter.report("from a");
        reporter.report("a again");
        principal = "b";
        reporter.report("from b");
        expect(await reporter.flush()).toEqual({
            sent: 1,
            dropped: 3,
            pending: 0,
            retryAfterMs: null,
        });
        expect(bodies(fetchMock).map((body) => body.message)).toEqual(["from b"]);
        expect(authorizations(fetchMock)).toEqual(["Bearer token-b"]);
    });

    it("treats a principal getter that throws as nobody, which only matters to drop — the unchanged token still proves the bearer", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => "tok",
            getPrincipal: () => {
                throw new Error("store not ready");
            },
        });
        reporter.report("x");
        await reporter.flush();
        expect(reporter.pending()).toEqual([]);
        expect(authorizations(fetchMock)).toEqual(["Bearer tok"]);
        const strict = build(fetchMock, {
            autoFlush: false,
            getToken: () => "tok",
            getPrincipal: () => {
                throw new Error("store not ready");
            },
            foreignReports: "drop",
        });
        strict.report("y");
        expect(await strict.flush()).toMatchObject({ sent: 0, dropped: 1 });
    });

    it("sends entries queued before owners existed without the current bearer", async () => {
        localStorage.setItem(
            "tempest:app-errors",
            JSON.stringify([{ report: { code: "Error", message: "legacy" }, count: 1 }]),
        );
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock, {
            storage: undefined,
            autoFlush: false,
            getToken: () => "token-dummyB",
        });
        expect(await reporter.flush()).toMatchObject({ sent: 1, pending: 0 });
        expect(authorizations(fetchMock)).toEqual([undefined]);
    });

    it("never writes the token to storage", () => {
        setOnline(false);
        const reporter = build(vi.fn(), {
            storage: undefined,
            getToken: () => "token-dummyA-secret",
            getPrincipal: () => "user-a",
        });
        reporter.report("x");
        const tokenOnly = build(vi.fn(), {
            storage: undefined,
            storageKey: "token-only",
            getToken: () => "token-dummyA-secret",
        });
        tokenOnly.report("y");
        const stored = `${localStorage.getItem("tempest:app-errors")}${localStorage.getItem("token-only")}`;
        expect(stored).not.toContain("token-dummyA-secret");
        expect(stored).not.toContain("user-a");
        expect(reporter.pending()[0]?.owner).toMatch(/^p:[0-9a-f]{16}$/);
        expect(reporter.pending()[0]?.session).toMatch(/^t:[0-9a-f]{16}$/);
        expect(tokenOnly.pending()[0]?.session).toMatch(/^t:[0-9a-f]{16}$/);
        expect(tokenOnly.pending()[0]).not.toHaveProperty("owner");
    });
});

describe("createAppErrorReporter — owner review findings", () => {
    beforeEach(() => setOnline(true));
    afterEach(() => {
        built.splice(0).forEach((reporter) => reporter.dispose());
        vi.useRealTimers();
        localStorage.clear();
    });

    function headersOf(fetchMock: ReturnType<typeof vi.fn>): Array<string | undefined> {
        return inits(fetchMock).map(
            (init) => (init.headers as Record<string, string>).Authorization,
        );
    }

    function deferred<T>() {
        let resolve: (value: T) => void = () => undefined;
        const promise = new Promise<T>((done) => {
            resolve = done;
        });
        return { promise, resolve };
    }

    it("1: never drops the user's own reports on a token refresh in token mode, even with drop", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        let token = "token-1";
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => token,
            foreignReports: "drop",
        });
        reporter.report("mine");
        token = "token-2";
        expect(await reporter.flush()).toMatchObject({ sent: 1, dropped: 0 });
        expect(headersOf(fetchMock)).toEqual([undefined]);
    });

    it("2: never sends A's report with B's bearer when the principal store is stale", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        let token = "token-dummyA";
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => token,
            getPrincipal: () => "user-a",
        });
        reporter.report("from a");
        token = "token-dummyB";
        await reporter.flush();
        expect(headersOf(fetchMock)).toEqual([undefined]);
    });

    it("3: clear() stops a drain in flight from sending what it cleared", async () => {
        const first = deferred<Response>();
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => first.promise)
            .mockResolvedValue(answer(201));
        const reporter = build(fetchMock, { autoFlush: false, getToken: () => "token-dummyA" });
        reporter.report("a1");
        reporter.report("a2");
        const run = reporter.flush();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        reporter.clear();
        first.resolve(answer(201));
        await run;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(reporter.pending()).toEqual([]);
    });

    it("4: clear() discards a report whose async stamp was still pending", async () => {
        const token = deferred<string>();
        const reporter = build(vi.fn(), { autoFlush: false, getToken: () => token.promise });
        reporter.report("a");
        reporter.clear();
        token.resolve("token-dummyA");
        await Promise.resolve();
        await Promise.resolve();
        expect(reporter.pending()).toEqual([]);
    });

    it("5: a getToken that never settles cannot hang the report or the flush", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => new Promise<string>(() => undefined),
        });
        reporter.report("stuck");
        const run = reporter.flush().then(() => "settled");
        await vi.advanceTimersByTimeAsync(30_000);
        expect(await Promise.race([run, Promise.resolve("hung")])).toBe("settled");
        expect(headersOf(fetchMock)).toEqual([undefined]);
    });

    it("6: with drop, a report of unknown owner is dropped instead of leaving anonymously", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        let principal: string | null = null;
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => (principal ? `token-${principal}` : null),
            getPrincipal: () => principal,
            foreignReports: "drop",
        });
        reporter.report("raised while the session read as empty");
        principal = "b";
        expect(await reporter.flush()).toMatchObject({ sent: 0, dropped: 1 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("7: an async getPrincipal does not make every owner collide", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        let principal = "a";
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => "tok",
            getPrincipal: (async () => principal) as unknown as () => string,
            foreignReports: "drop",
        });
        reporter.report("from a");
        principal = "b";
        await reporter.flush();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("skips an entry evicted while an earlier one was on the wire", async () => {
        const first = deferred<Response>();
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => first.promise)
            .mockResolvedValue(answer(201));
        const reporter = build(fetchMock, { autoFlush: false, maxEntries: 3 });
        reporter.report("a");
        reporter.report("b");
        reporter.report("c");
        const run = reporter.flush();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        reporter.report("d");
        reporter.report("e");
        first.resolve(answer(201));
        expect(await run).toMatchObject({ sent: 2, pending: 2 });
        expect(bodies(fetchMock).map((body) => body.message)).toEqual(["a", "c"]);
    });

    it("sends on its own once an async token stamps the report", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock, { getToken: async () => "tok" });
        reporter.report("x");
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(headersOf(fetchMock)).toEqual(["Bearer tok"]);
    });

    it("reads a rejecting async getToken as no token", async () => {
        const fetchMock = vi.fn(async () => answer(201));
        const reporter = build(fetchMock, {
            autoFlush: false,
            getToken: () => Promise.reject(new Error("refresh failed")),
        });
        reporter.report("x");
        expect(await reporter.flush()).toMatchObject({ sent: 1 });
        expect(headersOf(fetchMock)).toEqual([undefined]);
    });
});
