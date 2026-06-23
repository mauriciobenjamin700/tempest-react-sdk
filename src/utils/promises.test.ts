import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sleep, withTimeout } from "./promises";

describe("sleep", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("resolves after the given delay", async () => {
        const resolved = vi.fn();
        const promise = sleep(500).then(resolved);

        expect(resolved).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(500);
        await promise;
        expect(resolved).toHaveBeenCalledTimes(1);
    });
});

describe("withTimeout", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("resolves with the value when the promise settles in time", async () => {
        const promise = withTimeout(Promise.resolve("ok"), 1000);
        await expect(promise).resolves.toBe("ok");
    });

    it("rejects with a TimeoutError when the promise is too slow", async () => {
        const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5000));
        const promise = withTimeout(slow, 1000);

        const assertion = expect(promise).rejects.toMatchObject({ name: "TimeoutError" });
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });

    it("uses a custom message when provided", async () => {
        const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5000));
        const promise = withTimeout(slow, 1000, "too slow");

        const assertion = expect(promise).rejects.toThrow("too slow");
        await vi.advanceTimersByTimeAsync(1000);
        await assertion;
    });

    it("propagates rejection from the wrapped promise", async () => {
        const failing = Promise.reject(new Error("boom"));
        await expect(withTimeout(failing, 1000)).rejects.toThrow("boom");
    });
});
