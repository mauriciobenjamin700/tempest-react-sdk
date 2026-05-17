import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./register-service-worker";

describe("registerServiceWorker — onUpdate", () => {
    it("fires onUpdate when a new worker installs while controller is active", async () => {
        const onUpdate = vi.fn();
        const onError = vi.fn();

        const installing = {
            state: "installing" as const,
            addEventListener: vi.fn(),
        };
        const listeners: Record<string, () => void> = {};
        const registration = {
            active: {},
            installing,
            addEventListener: (name: string, listener: () => void) => {
                listeners[name] = listener;
            },
        };
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockResolvedValue(registration),
                controller: {},
                getRegistrations: vi.fn().mockResolvedValue([]),
            },
        });

        await registerServiceWorker({ url: "/sw.js", onUpdate, onError });

        // simulate "updatefound" → state change to "installed"
        listeners.updatefound?.();
        const stateChangeListener = installing.addEventListener.mock.calls.find(
            (call) => call[0] === "statechange",
        )?.[1] as (() => void) | undefined;
        installing.state = "installed" as never;
        stateChangeListener?.();
        expect(onUpdate).toHaveBeenCalled();
    });

    it("invokes onError when register rejects", async () => {
        const onError = vi.fn();
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockRejectedValue(new Error("oh no")),
                getRegistrations: vi.fn().mockResolvedValue([]),
            },
        });
        const result = await registerServiceWorker({ url: "/sw.js", onError });
        expect(result).toBeNull();
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
});
