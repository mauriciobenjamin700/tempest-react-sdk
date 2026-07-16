import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RegisterServiceWorkerOptions } from "../sw/register-service-worker";

const registerMock = vi.fn();
const skipWaitingMock = vi.fn();

vi.mock("../sw/register-service-worker", () => ({
    registerServiceWorker: (options: RegisterServiceWorkerOptions) => registerMock(options),
    skipWaiting: (worker: ServiceWorker) => skipWaitingMock(worker),
}));

import { useServiceWorkerUpdate } from "./use-service-worker-update";

afterEach(() => {
    registerMock.mockReset();
    skipWaitingMock.mockReset();
});

describe("useServiceWorkerUpdate", () => {
    it("stays idle when no update is waiting", async () => {
        const registration = { waiting: null } as unknown as ServiceWorkerRegistration;
        registerMock.mockResolvedValue(registration);
        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        await waitFor(() => expect(result.current.registration).toBe(registration));
        expect(result.current.updateAvailable).toBe(false);
    });

    it("flips updateAvailable when onUpdate fires", async () => {
        let capturedOnUpdate:
            | ((w: ServiceWorker, r: ServiceWorkerRegistration) => void)
            | undefined;
        const registration = { waiting: null } as unknown as ServiceWorkerRegistration;
        registerMock.mockImplementation((options: RegisterServiceWorkerOptions) => {
            capturedOnUpdate = options.onUpdate;
            return Promise.resolve(registration);
        });
        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        await waitFor(() => expect(capturedOnUpdate).toBeDefined());
        const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
        act(() => capturedOnUpdate!(waiting, registration));
        expect(result.current.updateAvailable).toBe(true);
    });

    it("applyUpdate posts skipWaiting to the waiting worker", async () => {
        let capturedOnUpdate:
            | ((w: ServiceWorker, r: ServiceWorkerRegistration) => void)
            | undefined;
        const registration = { waiting: null } as unknown as ServiceWorkerRegistration;
        registerMock.mockImplementation((options: RegisterServiceWorkerOptions) => {
            capturedOnUpdate = options.onUpdate;
            return Promise.resolve(registration);
        });
        Object.assign(navigator, {
            serviceWorker: { addEventListener: vi.fn() },
        });
        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        await waitFor(() => expect(capturedOnUpdate).toBeDefined());
        const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
        act(() => capturedOnUpdate!(waiting, registration));
        act(() => result.current.applyUpdate());
        expect(skipWaitingMock).toHaveBeenCalledWith(waiting);
    });

    it("applyUpdate is a no-op when nothing is waiting", () => {
        registerMock.mockResolvedValue({ waiting: null });
        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        act(() => result.current.applyUpdate());
        expect(skipWaitingMock).not.toHaveBeenCalled();
    });
});
