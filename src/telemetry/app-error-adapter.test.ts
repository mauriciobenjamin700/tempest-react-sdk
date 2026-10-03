import { describe, expect, it, vi } from "vitest";
import { createAppErrorTelemetryAdapter } from "./app-error-adapter";
import type { AppErrorReporter } from "./app-error-reporter";

function makeReporter(): AppErrorReporter {
    return {
        report: vi.fn(),
        flush: vi.fn(async () => ({ sent: 0, dropped: 0, pending: 0, retryAfterMs: null })),
        pending: vi.fn(() => []),
        clear: vi.fn(),
        dispose: vi.fn(),
    };
}

describe("createAppErrorTelemetryAdapter", () => {
    it("forwards captureException with its context to the reporter", () => {
        const reporter = makeReporter();
        const error = new Error("boom");
        createAppErrorTelemetryAdapter({ reporter }).captureException(error, { route: "/x" });
        expect(reporter.report).toHaveBeenCalledWith(error, { route: "/x" });
    });

    it("flushes the reporter on flush()", async () => {
        const reporter = makeReporter();
        await createAppErrorTelemetryAdapter({ reporter }).flush?.();
        expect(reporter.flush).toHaveBeenCalledTimes(1);
    });

    it("sends nothing for identify and track — the backend takes the user from the token", () => {
        const reporter = makeReporter();
        const adapter = createAppErrorTelemetryAdapter({ reporter });
        adapter.identify({ id: "u1" });
        adapter.track({ name: "opened" });
        expect(reporter.report).not.toHaveBeenCalled();
    });
});
