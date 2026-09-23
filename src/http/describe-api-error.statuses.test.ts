import { describe, expect, it } from "vitest";

import { describeApiError, DEFAULT_API_ERROR_STRINGS } from "./describe-api-error";
import { TempestApiError } from "./errors";

/**
 * The axis `codes` could not cover.
 *
 * `codes` translates what the backend named. A `403` on an admin-only route
 * names nothing: the body carries a generic `detail` or none at all, so the
 * funnel fell through to the fallback and an administrator read "Não foi
 * possível carregar" — while the fact that answers their question is that the
 * listing is restricted. The way out apps took was `isApiError(error) &&
 * error.status === 403` in front of `describeApiError`, which is the same
 * `switch` the `codes` option exists to delete.
 */
function apiError(init: {
    status: number;
    detail?: string;
    code?: string;
    fields?: Record<string, string>;
}): TempestApiError {
    return new TempestApiError({
        status: init.status,
        detail: init.detail ?? "",
        ...(init.code === undefined ? {} : { code: init.code }),
        ...(init.fields === undefined ? {} : { fields: init.fields }),
    });
}

describe("describeApiError statuses", () => {
    it("answers the sentence written for that status", () => {
        const sentence = describeApiError(apiError({ status: 403 }), "Não foi possível carregar.", {
            statuses: { 403: "Listagem restrita a administradores." },
        });

        expect(sentence).toBe("Listagem restrita a administradores.");
    });

    it("changes nothing when the map is absent", () => {
        const withoutMap = describeApiError(
            apiError({ status: 403 }),
            "Não foi possível carregar.",
        );

        expect(withoutMap).toBe("Não foi possível carregar. (HTTP 403)");
    });

    it("changes nothing for a status the map does not name", () => {
        const sentence = describeApiError(apiError({ status: 500 }), "Não foi possível carregar.", {
            statuses: { 403: "Listagem restrita a administradores." },
        });

        expect(sentence).toBe("Não foi possível carregar. (HTTP 500)");
    });

    it("lets codes win, because it names the exact case", () => {
        const sentence = describeApiError(
            apiError({ status: 403, code: "PLAN_REQUIRED" }),
            "Não foi possível carregar.",
            {
                codes: { PLAN_REQUIRED: "Esta tela exige plano PRO ativo." },
                statuses: { 403: "Listagem restrita a administradores." },
            },
        );

        expect(sentence).toBe("Esta tela exige plano PRO ativo.");
    });

    /**
     * The point of the precedence: a generic line the framework emitted is worse
     * than the sentence the app wrote for that status.
     */
    it("wins over the backend's detail", () => {
        const sentence = describeApiError(
            apiError({ status: 403, detail: "Forbidden" }),
            "Não foi possível carregar.",
            { statuses: { 403: "Listagem restrita a administradores." } },
        );

        expect(sentence).toBe("Listagem restrita a administradores.");
    });

    it("wins over the validation sentence, for a status the caller mapped", () => {
        const sentence = describeApiError(
            apiError({ status: 422, detail: "Unprocessable", fields: { email: "obrigatório" } }),
            "Não foi possível salvar.",
            { statuses: { 422: "Confira os campos antes de enviar." } },
        );

        expect(sentence).toBe("Confira os campos antes de enviar.");
    });

    it("leaves the offline sentence in place when nobody maps status 0", () => {
        const sentence = describeApiError(apiError({ status: 0 }), "Não foi possível carregar.", {
            statuses: { 403: "Listagem restrita a administradores." },
        });

        expect(sentence).toBe(DEFAULT_API_ERROR_STRINGS.offline);
    });

    /**
     * Mapping `0` is honoured, and the docstring says so: `statuses` is the
     * caller's explicit map, and `offline` already exists to reword that case.
     * Status `0` also covers a request the client timed out, so an app mapping
     * it takes both.
     */
    it("honours an explicit status 0, ahead of the offline sentence", () => {
        const sentence = describeApiError(apiError({ status: 0 }), "Não foi possível carregar.", {
            statuses: { 0: "Sem conexão com o servidor." },
        });

        expect(sentence).toBe("Sem conexão com o servidor.");
    });

    it("does not reach a non-ApiError", () => {
        const sentence = describeApiError(new Error("boom"), "Não foi possível carregar.", {
            statuses: { 403: "Listagem restrita a administradores." },
        });

        expect(sentence).toBe("Não foi possível carregar.");
    });
});
