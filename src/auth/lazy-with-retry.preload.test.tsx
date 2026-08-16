import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { lazyWithRetry } from "./lazy-with-retry";

function Loaded() {
    return <p>loaded</p>;
}

describe("lazyWithRetry — preload", () => {
    it("exposes preload and resolves to the module", async () => {
        const factory = vi.fn(() => Promise.resolve({ default: Loaded }));
        const Lazy = lazyWithRetry(factory);

        expect(typeof Lazy.preload).toBe("function");
        await expect(Lazy.preload()).resolves.toEqual({ default: Loaded });
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("does not fetch twice when called repeatedly", async () => {
        const factory = vi.fn(() => Promise.resolve({ default: Loaded }));
        const Lazy = lazyWithRetry(factory);

        await Promise.all([Lazy.preload(), Lazy.preload(), Lazy.preload()]);

        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("shares the fetch with the render path", async () => {
        const factory = vi.fn(() => Promise.resolve({ default: Loaded }));
        const Lazy = lazyWithRetry(factory);

        await Lazy.preload();
        render(
            <Suspense fallback={<p>loading</p>}>
                <Lazy />
            </Suspense>,
        );

        expect(await screen.findByText("loaded")).toBeInTheDocument();
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("retries through preload and reports the eventual success", async () => {
        const factory = vi
            .fn<() => Promise<{ default: typeof Loaded }>>()
            .mockRejectedValueOnce(new Error("stale chunk"))
            .mockResolvedValue({ default: Loaded });

        const Lazy = lazyWithRetry(factory, { initialDelay: 1, reloadOnFinalFailure: false });

        await expect(Lazy.preload()).resolves.toEqual({ default: Loaded });
        expect(factory).toHaveBeenCalledTimes(2);
    });

    it("rejects once every retry failed, and lets a later call try again", async () => {
        const factory = vi
            .fn<() => Promise<{ default: typeof Loaded }>>()
            .mockRejectedValue(new Error("gone"));

        const Lazy = lazyWithRetry(factory, {
            retries: 2,
            initialDelay: 1,
            reloadOnFinalFailure: false,
        });

        await expect(Lazy.preload()).rejects.toThrow("gone");
        expect(factory).toHaveBeenCalledTimes(2);

        // The memo was cleared, so the component is not permanently poisoned.
        await expect(Lazy.preload()).rejects.toThrow("gone");
        expect(factory).toHaveBeenCalledTimes(4);
    });

    it("does not raise an unhandled rejection when nobody awaits it", async () => {
        const onUnhandled = vi.fn();
        window.addEventListener("unhandledrejection", onUnhandled);

        const factory = vi
            .fn<() => Promise<{ default: typeof Loaded }>>()
            .mockRejectedValue(new Error("gone"));
        const Lazy = lazyWithRetry(factory, {
            retries: 1,
            initialDelay: 1,
            reloadOnFinalFailure: false,
        });

        void Lazy.preload();
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(onUnhandled).not.toHaveBeenCalled();
        window.removeEventListener("unhandledrejection", onUnhandled);
    });
});
