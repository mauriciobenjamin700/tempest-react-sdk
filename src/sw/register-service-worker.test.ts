import { describe, expect, it, vi } from "vitest";
import {
    registerServiceWorker,
    skipWaiting,
    unregisterAllServiceWorkers,
} from "./register-service-worker";

describe("registerServiceWorker", () => {
    it("returns null when serviceWorker is unsupported", async () => {
        const original = (navigator as { serviceWorker?: unknown }).serviceWorker;
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
        const result = await registerServiceWorker({ url: "/sw.js" });
        expect(result).toBeNull();
        if (original) Object.assign(navigator, { serviceWorker: original });
    });

    it("calls register and invokes onReady when active", async () => {
        const onReady = vi.fn();
        const registration = {
            active: {},
            installing: null,
            addEventListener: vi.fn(),
        };
        Object.assign(navigator, {
            serviceWorker: {
                register: vi.fn().mockResolvedValue(registration),
                getRegistrations: vi.fn().mockResolvedValue([]),
            },
        });
        const result = await registerServiceWorker({ url: "/sw.js", onReady });
        expect(result).toBe(registration);
        expect(onReady).toHaveBeenCalledWith(registration);
    });

    it("returns 0 from unregisterAllServiceWorkers when none registered", async () => {
        Object.assign(navigator, {
            serviceWorker: {
                getRegistrations: vi.fn().mockResolvedValue([]),
            },
        });
        const count = await unregisterAllServiceWorkers();
        expect(count).toBe(0);
    });
});

describe("skipWaiting", () => {
    it("posts SKIP_WAITING message to the worker", () => {
        const worker = { postMessage: vi.fn() };
        skipWaiting(worker as unknown as ServiceWorker);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    });
});
