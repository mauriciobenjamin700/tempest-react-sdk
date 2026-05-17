import { describe, expect, it, vi } from "vitest";
import { consoleTelemetryAdapter } from "./console-adapter";

describe("consoleTelemetryAdapter", () => {
    it("logs identify / track / captureException", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        consoleTelemetryAdapter.identify({ id: "1" });
        consoleTelemetryAdapter.track({ name: "click", properties: { x: 1 } });
        consoleTelemetryAdapter.captureException(new Error("boom"));
        expect(info).toHaveBeenCalled();
        expect(error).toHaveBeenCalled();
        info.mockRestore();
        error.mockRestore();
    });
});
