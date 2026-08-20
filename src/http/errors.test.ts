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

    it("flattens a FastAPI 422 validation list instead of stringifying it", () => {
        const err = buildApiError(422, {
            detail: [
                {
                    type: "missing",
                    loc: ["body", "email"],
                    msg: "Field required",
                    input: null,
                },
                {
                    type: "greater_than",
                    loc: ["body", "items", 0, "price"],
                    msg: "Input should be greater than 0",
                },
            ],
        });
        expect(err.detail).toBe(
            "email: Field required; items.0.price: Input should be greater than 0",
        );
        expect(err.detail).not.toContain("[object Object]");
    });

    it("keeps the raw validation list on body for field-level mapping", () => {
        const detail = [{ loc: ["body", "email"], msg: "Field required", type: "missing" }];
        expect(buildApiError(422, { detail }).body).toEqual({ detail });
    });

    it("drops only the leading request-part segment from loc", () => {
        expect(
            buildApiError(422, { detail: [{ loc: ["query", "page"], msg: "bad" }] }).detail,
        ).toBe("page: bad");
        expect(
            buildApiError(422, { detail: [{ loc: ["email", "body"], msg: "bad" }] }).detail,
        ).toBe("email.body: bad");
        expect(buildApiError(422, { detail: [{ loc: ["body"], msg: "bad" }] }).detail).toBe("bad");
    });

    it("handles validation entries that are plain strings or lack a message", () => {
        expect(buildApiError(422, { detail: ["campo inválido", "outro"] }).detail).toBe(
            "campo inválido; outro",
        );
        expect(buildApiError(422, { detail: [{ loc: ["body", "email"] }] }).detail).toBe(
            "Erro 422",
        );
        expect(buildApiError(422, { detail: [] }).detail).toBe("Erro 422");
    });

    it("reads a nested object detail through msg/message/detail", () => {
        expect(buildApiError(400, { detail: { msg: "por msg" } }).detail).toBe("por msg");
        expect(buildApiError(400, { detail: { message: "por message" } }).detail).toBe(
            "por message",
        );
        expect(buildApiError(400, { detail: { detail: "aninhado" } }).detail).toBe("aninhado");
        expect(buildApiError(400, { detail: { foo: "bar" } }).detail).toBe("Erro 400");
    });

    it("falls back past an empty or unreadable detail to message", () => {
        expect(buildApiError(500, { detail: "", message: "boom" }).detail).toBe("boom");
        expect(buildApiError(500, { detail: null, message: "boom" }).detail).toBe("boom");
        expect(buildApiError(500, { detail: [], message: "boom" }).detail).toBe("boom");
    });

    it("keeps a non-string scalar detail readable", () => {
        expect(buildApiError(400, { detail: 42 }).detail).toBe("42");
        expect(buildApiError(400, { detail: false }).detail).toBe("false");
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
