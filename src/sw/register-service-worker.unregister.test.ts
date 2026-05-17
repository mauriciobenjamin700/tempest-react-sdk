import { describe, expect, it, vi } from "vitest";
import { unregisterAllServiceWorkers } from "./register-service-worker";

describe("unregisterAllServiceWorkers", () => {
    it("counts successful unregistrations", async () => {
        Object.assign(navigator, {
            serviceWorker: {
                getRegistrations: vi
                    .fn()
                    .mockResolvedValue([
                        { unregister: vi.fn().mockResolvedValue(true) },
                        { unregister: vi.fn().mockResolvedValue(true) },
                        { unregister: vi.fn().mockResolvedValue(false) },
                    ]),
            },
        });
        const count = await unregisterAllServiceWorkers();
        expect(count).toBe(2);
    });

    it("returns 0 when serviceWorker missing", async () => {
        delete (navigator as { serviceWorker?: unknown }).serviceWorker;
        const count = await unregisterAllServiceWorkers();
        expect(count).toBe(0);
    });
});
