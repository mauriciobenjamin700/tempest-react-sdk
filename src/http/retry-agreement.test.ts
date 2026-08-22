import { describe, expect, it, vi } from "vitest";

import { isRetriableStatus, TempestApiError } from "./errors";
import { retry } from "./retry";
import { shouldRetryQuery } from "../query/retry-policy";

/**
 * Every status the SDK has an opinion about, plus the shape of that opinion.
 *
 * `0` is a request that never landed, `425` is the one the query default used to
 * miss, and the 4xx block is the server's final answer.
 */
const STATUSES: ReadonlyArray<readonly [number, boolean]> = [
    [0, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [408, true],
    [409, false],
    [422, false],
    [425, true],
    [429, true],
    [500, true],
    [502, true],
    [503, true],
    [504, true],
];

const apiError = (status: number): TempestApiError =>
    new TempestApiError({ status, detail: `Erro ${status}` });

/**
 * Observe the decision `retry()` makes with no `shouldRetry` supplied.
 *
 * Counts attempts rather than reading the option, because the default is the
 * thing under test: a caller who passes nothing has to get the shared policy.
 *
 * @param status - Status of the API error the factory throws.
 * @returns Whether the helper tried more than once.
 */
async function retryDefaultReplays(status: number): Promise<boolean> {
    const factory = vi.fn(() => Promise.reject(apiError(status)));
    await expect(retry(factory, { retries: 2, initialDelay: 0 })).rejects.toThrow();
    return factory.mock.calls.length > 1;
}

/**
 * The three retry surfaces have to agree, and they did not.
 *
 * `createApiClient({ retry: true })`, the `QueryProvider` default and the bare
 * `retry()` helper each carried their own status list. The query copy was
 * missing `425`, so the same `425 Too Early` was replayed through one path and
 * not the other — same app, same error, and no test noticed, because each file
 * asserted against its own copy.
 *
 * These tests assert the *agreement*, not three separate images, so a future
 * edit to one surface fails here instead of drifting quietly. The client's own
 * policy is not re-tested: `isRetriableFailure` now calls `isRetriableStatus`
 * directly, so it cannot disagree without the shared function changing, and its
 * method check stays covered by `api-client.resilience.test.ts`.
 */
describe("retry policy agreement", () => {
    it("classifies every known status the documented way", () => {
        for (const [status, retriable] of STATUSES) {
            expect(isRetriableStatus(status), `status ${status}`).toBe(retriable);
        }
    });

    it("has the query default follow the shared classification", () => {
        for (const [status, retriable] of STATUSES) {
            expect(shouldRetryQuery(0, apiError(status)), `status ${status}`).toBe(retriable);
        }
    });

    it("has the bare retry() default follow the shared classification", async () => {
        for (const [status, retriable] of STATUSES) {
            expect(await retryDefaultReplays(status), `status ${status}`).toBe(retriable);
        }
    });

    it("replays an error with no API shape, which may be a transport failure", async () => {
        expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);

        const factory = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
        await expect(retry(factory, { retries: 2, initialDelay: 0 })).rejects.toThrow();
        expect(factory).toHaveBeenCalledTimes(2);
    });
});
