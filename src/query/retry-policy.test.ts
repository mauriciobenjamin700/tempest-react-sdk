import { describe, expect, it } from "vitest";

import { TempestApiError } from "../http/errors";
import { shouldRetryQuery } from "./retry-policy";

const error = (status: number): TempestApiError =>
    new TempestApiError({ status, detail: `Erro ${status}` });

describe("shouldRetryQuery", () => {
    it("does not replay a deliberate client-side refusal", () => {
        for (const status of [400, 401, 403, 404, 409, 422]) {
            expect(shouldRetryQuery(0, error(status))).toBe(false);
        }
    });

    it("replays the two 4xx that describe a condition which changes on its own", () => {
        expect(shouldRetryQuery(0, error(408))).toBe(true);
        expect(shouldRetryQuery(0, error(429))).toBe(true);
    });

    it("replays server failures", () => {
        for (const status of [500, 502, 503, 504]) {
            expect(shouldRetryQuery(0, error(status))).toBe(true);
        }
    });

    it("replays a request that never reached the server", () => {
        expect(shouldRetryQuery(0, error(0))).toBe(true);
    });

    it("replays an error of an unknown shape, which may be a transport failure", () => {
        expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
        expect(shouldRetryQuery(0, "boom")).toBe(true);
        expect(shouldRetryQuery(0, undefined)).toBe(true);
    });

    it("stops after one retry, which is the previous default", () => {
        expect(shouldRetryQuery(1, error(500))).toBe(false);
        expect(shouldRetryQuery(2, error(503))).toBe(false);
        expect(shouldRetryQuery(1, new TypeError("Failed to fetch"))).toBe(false);
    });
});
