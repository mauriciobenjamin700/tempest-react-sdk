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

describe("useServiceWorkerUpdate — onReady and no-ops", () => {
    it("detects a worker already waiting at registration time", async () => {
        const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
        const registration = { waiting } as unknown as ServiceWorkerRegistration;
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: { controller: {}, addEventListener: vi.fn() },
        });
        registerMock.mockImplementation((options: RegisterServiceWorkerOptions) => {
            options.onReady?.(registration);
            return Promise.resolve(registration);
        });

        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        await waitFor(() => expect(result.current.updateAvailable).toBe(true));
        expect(result.current.registration).toBe(registration);
    });

    it("ignores a waiting worker when the page is not controlled yet", async () => {
        const waiting = { postMessage: vi.fn() } as unknown as ServiceWorker;
        const registration = { waiting } as unknown as ServiceWorkerRegistration;
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: { controller: null, addEventListener: vi.fn() },
        });
        registerMock.mockImplementation((options: RegisterServiceWorkerOptions) => {
            options.onReady?.(registration);
            return Promise.resolve(registration);
        });

        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        await waitFor(() => expect(result.current.registration).toBe(registration));
        expect(result.current.updateAvailable).toBe(false);
    });

    it("forwards onReady to the caller", async () => {
        const onReady = vi.fn();
        const registration = { waiting: null } as unknown as ServiceWorkerRegistration;
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: { controller: null, addEventListener: vi.fn() },
        });
        registerMock.mockImplementation((options: RegisterServiceWorkerOptions) => {
            options.onReady?.(registration);
            return Promise.resolve(registration);
        });

        renderHook(() => useServiceWorkerUpdate({ url: "/sw.js", onReady }));
        await waitFor(() => expect(onReady).toHaveBeenCalledWith(registration));
    });

    it("leaves registration null when support is missing", async () => {
        registerMock.mockResolvedValue(null);
        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        await waitFor(() => expect(registerMock).toHaveBeenCalled());
        expect(result.current.registration).toBeNull();
        expect(result.current.updateAvailable).toBe(false);
    });

    it("applyUpdate is a no-op with nothing waiting", async () => {
        registerMock.mockResolvedValue({ waiting: null } as unknown as ServiceWorkerRegistration);
        const { result } = renderHook(() => useServiceWorkerUpdate({ url: "/sw.js" }));
        await waitFor(() => expect(registerMock).toHaveBeenCalled());
        act(() => result.current.applyUpdate());
        expect(skipWaitingMock).not.toHaveBeenCalled();
    });

    it("reloads once when the controller changes", async () => {
        const reload = vi.fn();
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, reload },
        });
        const listeners: (() => void)[] = [];
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: {
                controller: {},
                addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
            },
        });

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
        act(() => result.current.applyUpdate());

        expect(skipWaitingMock).toHaveBeenCalledWith(waiting);
        listeners.forEach((listener) => listener());
        listeners.forEach((listener) => listener());
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
