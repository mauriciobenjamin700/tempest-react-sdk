import { describe, expect, it, vi } from "vitest";
import { createPostHogTelemetryAdapter } from "./posthog-adapter";
import type { PostHogLike } from "./posthog-adapter";

function makePostHogMock(overrides: Partial<PostHogLike> = {}): PostHogLike {
    return {
        init: vi.fn(),
        identify: vi.fn(),
        capture: vi.fn(),
        captureException: vi.fn(),
        reset: vi.fn(),
        ...overrides,
    };
}

describe("createPostHogTelemetryAdapter", () => {
    it("init() forwards apiKey and options to posthog.init", () => {
        const posthog = makePostHogMock();
        const adapter = createPostHogTelemetryAdapter({
            posthog,
            init: { apiKey: "phc_xxx", options: { api_host: "https://us.i.posthog.com" } },
        });
        adapter.init?.();
        expect(posthog.init).toHaveBeenCalledWith("phc_xxx", {
            api_host: "https://us.i.posthog.com",
        });
    });

    it("init() is a no-op when no init payload provided", () => {
        const posthog = makePostHogMock();
        const adapter = createPostHogTelemetryAdapter({ posthog });
        adapter.init?.();
        expect(posthog.init).not.toHaveBeenCalled();
    });

    it("identify(user) calls posthog.identify with id + flattened traits", () => {
        const posthog = makePostHogMock();
        const adapter = createPostHogTelemetryAdapter({ posthog });
        adapter.identify({
            id: "u1",
            email: "u@example.com",
            name: "User One",
            traits: { plan: "pro" },
        });
        expect(posthog.identify).toHaveBeenCalledWith("u1", {
            email: "u@example.com",
            name: "User One",
            plan: "pro",
        });
    });

    it("identify(null) calls posthog.reset", () => {
        const posthog = makePostHogMock();
        const adapter = createPostHogTelemetryAdapter({ posthog });
        adapter.identify(null);
        expect(posthog.reset).toHaveBeenCalled();
        expect(posthog.identify).not.toHaveBeenCalled();
    });

    it("identify(user without id) is a no-op", () => {
        const posthog = makePostHogMock();
        const adapter = createPostHogTelemetryAdapter({ posthog });
        adapter.identify({ email: "x@y.z" });
        expect(posthog.identify).not.toHaveBeenCalled();
    });

    it("track() forwards name + properties to posthog.capture", () => {
        const posthog = makePostHogMock();
        const adapter = createPostHogTelemetryAdapter({ posthog });
        adapter.track({ name: "checkout.completed", properties: { total: 100 } });
        expect(posthog.capture).toHaveBeenCalledWith("checkout.completed", { total: 100 });
    });

    it("captureException uses posthog.captureException when present", () => {
        const posthog = makePostHogMock();
        const adapter = createPostHogTelemetryAdapter({ posthog });
        const err = new Error("boom");
        adapter.captureException(err, { route: "/checkout" });
        expect(posthog.captureException).toHaveBeenCalledWith(err, { route: "/checkout" });
        expect(posthog.capture).not.toHaveBeenCalled();
    });

    it("captureException falls back to capture('$exception', ...) when captureException missing", () => {
        const posthog: PostHogLike = {
            identify: vi.fn(),
            capture: vi.fn(),
        };
        const adapter = createPostHogTelemetryAdapter({ posthog });
        const err = new Error("boom");
        adapter.captureException(err, { route: "/x" });
        expect(posthog.capture).toHaveBeenCalledWith(
            "$exception",
            expect.objectContaining({
                $exception_message: "boom",
                $exception_type: "Error",
                route: "/x",
            }),
        );
    });

    it("captureException wraps non-Error values into an Error before fallback", () => {
        const posthog: PostHogLike = {
            identify: vi.fn(),
            capture: vi.fn(),
        };
        const adapter = createPostHogTelemetryAdapter({ posthog });
        adapter.captureException("string error");
        const props = (posthog.capture as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(props.$exception_message).toBe("string error");
        expect(props.$exception_type).toBe("Error");
    });
});
