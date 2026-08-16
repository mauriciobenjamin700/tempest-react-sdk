import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_API_ERROR_STRINGS, describeApiError } from "./describe-api-error";
import { TempestApiError } from "./errors";

const FALLBACK = "Não foi possível carregar os pedidos";

const apiError = (status: number, detail: string): TempestApiError =>
    new TempestApiError({ status, detail });

const setOnline = (value: boolean): void => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("describeApiError", () => {
    it("prefers the backend detail, which is already written for a person", () => {
        expect(describeApiError(apiError(422, "CPF já cadastrado"), FALLBACK)).toBe(
            "CPF já cadastrado",
        );
    });

    it("says the request never left, instead of rendering 'erro 0'", () => {
        expect(describeApiError(apiError(0, "Network request failed"), FALLBACK)).toBe(
            DEFAULT_API_ERROR_STRINGS.offline,
        );
    });

    it("honours a caller-supplied offline sentence", () => {
        expect(describeApiError(apiError(0, "x"), FALLBACK, { offline: "Sem rede" })).toBe(
            "Sem rede",
        );
    });

    it("falls back with the status when the detail is the synthetic one", () => {
        expect(describeApiError(apiError(500, "Erro 500"), FALLBACK)).toBe(
            `${FALLBACK} (HTTP 500)`,
        );
    });

    it("falls back with the status when the detail is blank", () => {
        expect(describeApiError(apiError(403, "   "), FALLBACK)).toBe(`${FALLBACK} (HTTP 403)`);
    });

    it("keeps a detail that merely resembles the synthetic one for another status", () => {
        expect(describeApiError(apiError(500, "Erro 502"), FALLBACK)).toBe("Erro 502");
    });

    it("accepts a plain object carrying the ApiError shape", () => {
        expect(describeApiError({ status: 404, detail: "Pedido não encontrado" }, FALLBACK)).toBe(
            "Pedido não encontrado",
        );
    });
});

describe("describeApiError — values that are not API errors", () => {
    it("returns the fallback for an arbitrary error while online", () => {
        setOnline(true);
        expect(describeApiError(new TypeError("Failed to fetch"), FALLBACK)).toBe(FALLBACK);
    });

    it("returns the offline sentence when the browser says it is offline", () => {
        setOnline(false);
        expect(describeApiError(new TypeError("Failed to fetch"), FALLBACK)).toBe(
            DEFAULT_API_ERROR_STRINGS.offline,
        );
    });

    it("returns the fallback for a string, a number and undefined", () => {
        setOnline(true);
        expect(describeApiError("boom", FALLBACK)).toBe(FALLBACK);
        expect(describeApiError(500, FALLBACK)).toBe(FALLBACK);
        expect(describeApiError(undefined, FALLBACK)).toBe(FALLBACK);
    });

    it("does not throw on null", () => {
        setOnline(true);
        expect(describeApiError(null, FALLBACK)).toBe(FALLBACK);
    });
});
