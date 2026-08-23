import { describe, expect, it, vi } from "vitest";
import { retry } from "./retry";

describe("retry — signal", () => {
    it("rejects with AbortError when signal already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            retry(() => Promise.resolve(1), { signal: controller.signal }),
        ).rejects.toMatchObject({ name: "AbortError" });
    });

    it("invokes onRetry between attempts", async () => {
        const onRetry = vi.fn();
        let attempt = 0;
        await retry(
            async () => {
                attempt += 1;
                if (attempt < 2) throw new Error("again");
                return "ok";
            },
            { retries: 3, initialDelay: 1, onRetry },
        );
        expect(onRetry).toHaveBeenCalled();
    });
});

describe("retry — abort during the backoff", () => {
    it("rejects as soon as the signal fires, without waiting the delay out", async () => {
        const controller = new AbortController();
        const factory = vi.fn(async () => {
            throw new Error("falhou");
        });

        const pending = retry(factory, {
            retries: 5,
            initialDelay: 10_000,
            signal: controller.signal,
        });
        const settled = expect(pending).rejects.toMatchObject({ name: "AbortError" });

        await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
        controller.abort();

        await settled;
        expect(factory, "the aborted attempt never ran").toHaveBeenCalledTimes(1);
    });

    it("rejects with the last error when the caller allows no attempt at all", async () => {
        const factory = vi.fn(async () => "nunca");

        await expect(retry(factory, { retries: 0 })).rejects.toBeUndefined();
        expect(factory).not.toHaveBeenCalled();
    });

    it("stops before the backoff even starts when the abort lands during onRetry", async () => {
        const controller = new AbortController();
        const factory = vi.fn(async () => {
            throw new Error("falhou");
        });

        await expect(
            retry(factory, {
                retries: 5,
                initialDelay: 10_000,
                signal: controller.signal,
                onRetry: () => controller.abort(),
            }),
        ).rejects.toMatchObject({ name: "AbortError" });

        expect(factory).toHaveBeenCalledTimes(1);
    });
});
