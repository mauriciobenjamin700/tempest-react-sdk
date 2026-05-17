import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TelemetryProvider, useTelemetry } from "./TelemetryProvider";
import { consoleTelemetryAdapter } from "./console-adapter";

describe("TelemetryProvider + useTelemetry", () => {
    it("returns null when no provider is mounted", () => {
        const { result } = renderHook(() => useTelemetry());
        expect(result.current).toBeNull();
    });

    it("returns the adapter inside a provider", () => {
        const adapter = { ...consoleTelemetryAdapter, init: vi.fn() };
        const wrapper = ({ children }: { children: ReactNode }) => (
            <TelemetryProvider adapter={adapter}>{children}</TelemetryProvider>
        );
        const { result } = renderHook(() => useTelemetry(), { wrapper });
        expect(result.current).toBe(adapter);
        expect(adapter.init).toHaveBeenCalled();
    });
});
