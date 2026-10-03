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
