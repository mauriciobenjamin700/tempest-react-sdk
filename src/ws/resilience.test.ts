import { describe, expect, it } from "vitest";
import {
    backoffDelay,
    HEARTBEAT_CLOSE_CODE,
    isRejectionCloseCode,
    REJECTION_CLOSE_MAX,
    REJECTION_CLOSE_MIN,
    shouldRetryClose,
} from "./resilience";

describe("isRejectionCloseCode", () => {
    it("treats the server's refusal range as fatal", () => {
        expect(isRejectionCloseCode(REJECTION_CLOSE_MIN)).toBe(true);
        expect(isRejectionCloseCode(4401)).toBe(true);
        expect(isRejectionCloseCode(4403)).toBe(true);
        expect(isRejectionCloseCode(4409)).toBe(true);
        expect(isRejectionCloseCode(REJECTION_CLOSE_MAX)).toBe(true);
    });

    it("excludes the heartbeat timeout, which sits inside the range but is a link failure", () => {
        expect(isRejectionCloseCode(HEARTBEAT_CLOSE_CODE)).toBe(false);
    });

    it("leaves standard codes alone", () => {
        expect(isRejectionCloseCode(1000)).toBe(false);
        expect(isRejectionCloseCode(1006)).toBe(false);
        expect(isRejectionCloseCode(4500)).toBe(false);
        expect(isRejectionCloseCode(4399)).toBe(false);
    });
});

describe("shouldRetryClose", () => {
    it("always retries a connection that died rather than ended", () => {
        expect(shouldRetryClose(1006, false)).toBe(true);
        expect(shouldRetryClose(1000, false)).toBe(true);
    });

    it("never retries a refusal, clean or not", () => {
        expect(shouldRetryClose(4401, true)).toBe(false);
        expect(shouldRetryClose(4401, false)).toBe(false);
    });

    it("retries a clean close that means the server is temporarily away", () => {
        expect(shouldRetryClose(1001, true)).toBe(true);
        expect(shouldRetryClose(1011, true)).toBe(true);
        expect(shouldRetryClose(1012, true)).toBe(true);
        expect(shouldRetryClose(1013, true)).toBe(true);
        expect(shouldRetryClose(HEARTBEAT_CLOSE_CODE, true)).toBe(true);
    });

    it("takes a clean 1000 as a goodbye meant on purpose", () => {
        expect(shouldRetryClose(1000, true)).toBe(false);
        expect(shouldRetryClose(1005, true)).toBe(false);
    });
});

describe("backoffDelay", () => {
    const schedule = { initialBackoff: 1000, maxBackoff: 8000, jitter: 0 };

    it("doubles each attempt up to the ceiling", () => {
        expect(backoffDelay(0, schedule)).toBe(1000);
        expect(backoffDelay(1, schedule)).toBe(2000);
        expect(backoffDelay(2, schedule)).toBe(4000);
        expect(backoffDelay(3, schedule)).toBe(8000);
        expect(backoffDelay(9, schedule)).toBe(8000);
    });

    it("only ever adds time, so the floor stays predictable", () => {
        const jittered = { ...schedule, jitter: 0.3 };
        expect(backoffDelay(0, jittered, () => 0)).toBe(1000);
        expect(backoffDelay(0, jittered, () => 1)).toBe(1300);
        expect(backoffDelay(0, jittered, () => 0.5)).toBe(1150);
    });

    it("uses Math.random when no source is injected", () => {
        const value = backoffDelay(0, { ...schedule, jitter: 0.3 });
        expect(value).toBeGreaterThanOrEqual(1000);
        expect(value).toBeLessThanOrEqual(1300);
    });
});
