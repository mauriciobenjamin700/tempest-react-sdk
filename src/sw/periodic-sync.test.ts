import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPeriodicSync } from "./periodic-sync";

const originalPermissions = (navigator as { permissions?: unknown }).permissions;

afterEach(() => {
    if (originalPermissions === undefined) {
        delete (navigator as { permissions?: unknown }).permissions;
    } else {
        Object.assign(navigator, { permissions: originalPermissions });
    }
});

function mockPermissions(state: PermissionState): void {
    Object.assign(navigator, {
        permissions: { query: vi.fn().mockResolvedValue({ state }) },
    });
}

describe("registerPeriodicSync", () => {
    it("returns false when periodicSync is unsupported", async () => {
        const result = await registerPeriodicSync({
            registration: {} as ServiceWorkerRegistration,
        });
        expect(result).toBe(false);
    });

    it("returns false when permission is not granted", async () => {
        mockPermissions("denied");
        const register = vi.fn();
        const result = await registerPeriodicSync({
            registration: { periodicSync: { register } } as unknown as ServiceWorkerRegistration,
        });
        expect(result).toBe(false);
        expect(register).not.toHaveBeenCalled();
    });

    it("registers with the computed minInterval when granted", async () => {
        mockPermissions("granted");
        const register = vi.fn().mockResolvedValue(undefined);
        const result = await registerPeriodicSync({
            registration: { periodicSync: { register } } as unknown as ServiceWorkerRegistration,
            tag: "my-tag",
            minIntervalMinutes: 60,
        });
        expect(result).toBe(true);
        expect(register).toHaveBeenCalledWith("my-tag", { minInterval: 60 * 60 * 1000 });
    });

    it("returns false when register throws", async () => {
        mockPermissions("granted");
        const register = vi.fn().mockRejectedValue(new Error("nope"));
        const result = await registerPeriodicSync({
            registration: { periodicSync: { register } } as unknown as ServiceWorkerRegistration,
        });
        expect(result).toBe(false);
    });
});
