import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBeforeInstallPrompt } from "./use-before-install-prompt";

function fireBefore(event: Partial<Event>): void {
    window.dispatchEvent(Object.assign(new Event("beforeinstallprompt"), event));
}

describe("useBeforeInstallPrompt full", () => {
    it("captures event and resolves prompt outcome", async () => {
        const { result } = renderHook(() => useBeforeInstallPrompt());
        const event = {
            prompt: () => Promise.resolve(),
            userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
            platforms: [],
            preventDefault: () => undefined,
        };
        act(() => {
            fireBefore(event as unknown as Event);
        });
        expect(result.current.installable).toBe(true);
        let outcome!: string;
        await act(async () => {
            outcome = await result.current.prompt();
        });
        expect(outcome).toBe("accepted");
        expect(result.current.installed).toBe(true);
    });

    it("appinstalled marks installed and standalone", () => {
        const { result } = renderHook(() => useBeforeInstallPrompt());
        act(() => {
            window.dispatchEvent(new Event("appinstalled"));
        });
        expect(result.current.installed).toBe(true);
        expect(result.current.isStandalone).toBe(true);
    });

    it("isStandalone defaults to false in a normal browser tab", () => {
        const { result } = renderHook(() => useBeforeInstallPrompt());
        expect(result.current.isStandalone).toBe(false);
    });
});
