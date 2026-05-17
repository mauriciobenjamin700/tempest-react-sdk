import { describe, expect, it, vi } from "vitest";
import { createSentryTelemetryAdapter } from "./sentry-adapter";
import type { SentryLike } from "./sentry-adapter";

function makeSentryMock(): SentryLike {
    return {
        init: vi.fn(),
        setUser: vi.fn(),
        addBreadcrumb: vi.fn(),
        captureException: vi.fn(),
        flush: vi.fn(async () => true),
    };
}

describe("createSentryTelemetryAdapter", () => {
    it("calls Sentry.init with the provided initOptions on init()", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({
            sentry,
            initOptions: { dsn: "https://example.invalid", tracesSampleRate: 0.1 },
        });
        adapter.init?.();
        expect(sentry.init).toHaveBeenCalledWith({
            dsn: "https://example.invalid",
            tracesSampleRate: 0.1,
        });
    });

    it("skips Sentry.init when no initOptions provided", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry });
        adapter.init?.();
        expect(sentry.init).not.toHaveBeenCalled();
    });

    it("forwards identify to Sentry.setUser with mapped fields", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry });
        adapter.identify({
            id: "u1",
            email: "u@example.com",
            name: "User One",
            traits: { plan: "pro", region: "br" },
        });
        expect(sentry.setUser).toHaveBeenCalledWith({
            id: "u1",
            email: "u@example.com",
            username: "User One",
            plan: "pro",
            region: "br",
        });
    });

    it("passes null to setUser on identify(null)", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry });
        adapter.identify(null);
        expect(sentry.setUser).toHaveBeenCalledWith(null);
    });

    it("track() adds a breadcrumb with the event name + properties", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry });
        adapter.track({ name: "checkout.completed", properties: { total: 100 } });
        expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
            category: "app",
            message: "checkout.completed",
            level: "info",
            data: { total: 100 },
        });
    });

    it("track() omits data when properties is undefined", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry });
        adapter.track({ name: "ping" });
        const call = (sentry.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call).not.toHaveProperty("data");
        expect(call.message).toBe("ping");
    });

    it("track() respects custom breadcrumbCategory", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry, breadcrumbCategory: "ui" });
        adapter.track({ name: "click" });
        const call = (sentry.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.category).toBe("ui");
    });

    it("captureException forwards context as extra", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry });
        const err = new Error("boom");
        adapter.captureException(err, { route: "/checkout" });
        expect(sentry.captureException).toHaveBeenCalledWith(err, {
            extra: { route: "/checkout" },
        });
    });

    it("captureException omits hint when no context", () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry });
        const err = new Error("boom");
        adapter.captureException(err);
        expect(sentry.captureException).toHaveBeenCalledWith(err, undefined);
    });

    it("flush awaits Sentry.flush with configured timeout", async () => {
        const sentry = makeSentryMock();
        const adapter = createSentryTelemetryAdapter({ sentry, flushTimeout: 5000 });
        await adapter.flush?.();
        expect(sentry.flush).toHaveBeenCalledWith(5000);
    });

    it("flush is a no-op when Sentry.flush is absent", async () => {
        const sentry: SentryLike = {
            setUser: vi.fn(),
            addBreadcrumb: vi.fn(),
            captureException: vi.fn(),
        };
        const adapter = createSentryTelemetryAdapter({ sentry });
        await expect(adapter.flush?.()).resolves.toBeUndefined();
    });
});
