import { describe, it, expect } from "vitest";

import { buildApiError, isApiError, parseRetryAfter, TempestApiError } from "./errors";

describe("buildApiError — Tempest envelope", () => {
    it("extracts detail, code and request_id from the FastAPI envelope", () => {
        const err = buildApiError(409, {
            detail: "Email já cadastrado",
            code: "EMAIL_TAKEN",
            details: { request_id: "req-123" },
        });
        expect(err.status).toBe(409);
        expect(err.detail).toBe("Email já cadastrado");
        expect(err.code).toBe("EMAIL_TAKEN");
        expect(err.requestId).toBe("req-123");
    });

    it("falls back to message, then a default detail", () => {
        expect(buildApiError(500, { message: "boom" }).detail).toBe("boom");
        expect(buildApiError(500, null).detail).toBe("Erro 500");
    });

    it("falls back to the X-Request-ID header then the sent id", () => {
        const headers = new Headers({ "X-Request-ID": "from-header" });
        expect(buildApiError(400, {}, headers).requestId).toBe("from-header");
        expect(buildApiError(400, {}, undefined, "sent-id").requestId).toBe("sent-id");
    });

    it("parses Retry-After (delta seconds)", () => {
        const headers = new Headers({ "Retry-After": "120" });
        expect(buildApiError(429, {}, headers).retryAfter).toBe(120);
    });
});

describe("parseRetryAfter", () => {
    it("parses integer seconds", () => {
        expect(parseRetryAfter("30")).toBe(30);
    });

    it("returns undefined for absent/garbage", () => {
        expect(parseRetryAfter(null)).toBeUndefined();
        expect(parseRetryAfter("soon")).toBeUndefined();
    });
});

describe("TempestApiError + isApiError", () => {
    it("is a real Error carrying the envelope fields", () => {
        const err = new TempestApiError({
            status: 403,
            detail: "Forbidden",
            code: "FORBIDDEN",
            requestId: "r-1",
        });
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe("Forbidden");
        expect(err.code).toBe("FORBIDDEN");
        expect(isApiError(err)).toBe(true);
    });

    it("isApiError matches plain envelope objects and rejects others", () => {
        expect(isApiError({ status: 404, detail: "nope" })).toBe(true);
        expect(isApiError(new Error("x"))).toBe(false);
        expect(isApiError(null)).toBe(false);
    });
});
