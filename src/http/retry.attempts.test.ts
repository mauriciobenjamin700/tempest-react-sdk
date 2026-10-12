import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { retry } from "./retry";

/**
 * `retries` counts **total attempts**, the first one included, and never fewer
 * than one.
 *
 * Measured on `main` before #486: `retry(factory, { retries: 0 })` never called
 * `factory` and rejected with `undefined`, because the loop was
 * `while (attempt < retries)`. The same held for any negative value, and `NaN`
 * also skipped the loop (`0 < NaN` is false).
 */
describe("retry — attempt count (#486)", () => {
    const failing = (): ReturnType<typeof vi.fn<() => Promise<never>>> =>
        vi.fn(async (): Promise<never> => {
            throw new Error("falhou");
        });

    it.each([0, -1, -10])(
        "runs the factory once and forwards its error when retries is %d",
        async (retries) => {
            const factory = failing();

            await expect(retry(factory, { retries, initialDelay: 0 })).rejects.toThrow("falhou");
            expect(factory).toHaveBeenCalledTimes(1);
        },
    );

    it("resolves with the value of the single attempt when retries is 0", async () => {
        const factory = vi.fn(async () => "ok");

        await expect(retry(factory, { retries: 0 })).resolves.toBe("ok");
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it.each([
        [1, 1],
        [2, 2],
        [3, 3],
        [5, 5],
    ])("makes %d attempts in total when retries is %d", async (retries, total) => {
        const factory = failing();

        await expect(retry(factory, { retries, initialDelay: 0 })).rejects.toThrow("falhou");
        expect(factory).toHaveBeenCalledTimes(total);
    });

    it("keeps three attempts in total when retries is omitted", async () => {
        const factory = failing();

        await expect(retry(factory, { initialDelay: 0 })).rejects.toThrow("falhou");
        expect(factory).toHaveBeenCalledTimes(3);
    });

    it("treats NaN as the default of three attempts", async () => {
        const factory = failing();

        await expect(retry(factory, { retries: Number.NaN, initialDelay: 0 })).rejects.toThrow(
            "falhou",
        );
        expect(factory).toHaveBeenCalledTimes(3);
    });

    it("rounds a fractional count down, keeping the floor of one", async () => {
        const twoAndAHalf = failing();
        await expect(retry(twoAndAHalf, { retries: 2.5, initialDelay: 0 })).rejects.toThrow();
        expect(twoAndAHalf).toHaveBeenCalledTimes(2);

        const half = failing();
        await expect(retry(half, { retries: 0.5, initialDelay: 0 })).rejects.toThrow();
        expect(half).toHaveBeenCalledTimes(1);
    });

    it("keeps createApiClient at three requests when retries is omitted", async () => {
        const fetcher = vi.fn(
            async () =>
                new Response("{}", {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                }),
        );
        const api = createApiClient({ baseURL: "https://x", fetcher, retry: { initialDelay: 0 } });

        await expect(api.get("/y")).rejects.toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("makes createApiClient send exactly one request for `retries: 0`", async () => {
        const fetcher = vi.fn(
            async () =>
                new Response("{}", {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                }),
        );
        const api = createApiClient({ baseURL: "https://x", fetcher, retry: { retries: 0 } });

        await expect(api.get("/y")).rejects.toMatchObject({ status: 503 });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
