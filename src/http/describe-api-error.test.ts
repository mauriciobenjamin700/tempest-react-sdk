import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_API_ERROR_STRINGS, describeApiError } from "./describe-api-error";
import { buildApiError, TempestApiError } from "./errors";

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

    it("says to check the fields instead of showing the assembled 422 line", () => {
        const error = new TempestApiError({
            status: 422,
            detail: "email: Field required; items.0.price: Input should be greater than 0",
            fields: {
                email: "Field required",
                "items.0.price": "Input should be greater than 0",
            },
        });

        const sentence = describeApiError(error, FALLBACK);

        expect(sentence).toBe(DEFAULT_API_ERROR_STRINGS.validation);
        expect(sentence).not.toContain("items.0.price");
        expect(sentence).not.toContain("Field required");
    });

    it("takes an override for the validation sentence", () => {
        const error = new TempestApiError({
            status: 422,
            detail: "email: Field required",
            fields: { email: "Field required" },
        });
        expect(describeApiError(error, FALLBACK, { validation: "Revise o formulário" })).toBe(
            "Revise o formulário",
        );
    });

    it("still prefers detail when the 422 carried no field entries", () => {
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

describe("describeApiError — catálogo de codes", () => {
    const CODES = {
        SERVICE_FULL: "Este serviço atingiu o limite de vagas.",
        EMAIL_TAKEN: "Este e-mail já está em uso.",
    } as const;

    const coded = (overrides: Partial<ConstructorParameters<typeof TempestApiError>[0]> = {}) =>
        new TempestApiError({ status: 409, detail: "conflict", ...overrides });

    it("maps a known code to the sentence written for it", () => {
        setOnline(true);
        expect(describeApiError(coded({ code: "SERVICE_FULL" }), FALLBACK, { codes: CODES })).toBe(
            CODES.SERVICE_FULL,
        );
    });

    it("prefers the mapped sentence over the backend detail", () => {
        setOnline(true);
        const error = coded({ code: "EMAIL_TAKEN", detail: "email already registered" });
        expect(describeApiError(error, FALLBACK, { codes: CODES })).toBe(CODES.EMAIL_TAKEN);
    });

    it("wins over the offline sentence, which cannot carry a code anyway", () => {
        setOnline(false);
        const error = new TempestApiError({ status: 0, detail: "", code: "SERVICE_FULL" });
        expect(describeApiError(error, FALLBACK, { codes: CODES })).toBe(CODES.SERVICE_FULL);
    });

    it("wins over the validation sentence", () => {
        setOnline(true);
        const error = coded({
            status: 422,
            code: "EMAIL_TAKEN",
            fields: { email: "Field required" },
        });
        expect(describeApiError(error, FALLBACK, { codes: CODES })).toBe(CODES.EMAIL_TAKEN);
    });

    it("falls through to detail for a code the catalog does not know", () => {
        setOnline(true);
        const error = coded({ code: "UNKNOWN_CODE", detail: "algo deu errado" });
        expect(describeApiError(error, FALLBACK, { codes: CODES })).toBe("algo deu errado");
    });

    it("ignores an error that carries no code at all", () => {
        setOnline(true);
        expect(describeApiError(coded({ detail: "conflito" }), FALLBACK, { codes: CODES })).toBe(
            "conflito",
        );
    });

    it("keeps the previous behaviour when no catalog is given", () => {
        setOnline(true);
        expect(describeApiError(coded({ code: "SERVICE_FULL" }), FALLBACK)).toBe("conflict");
    });
});

describe("describeApiError — useDetail", () => {
    it("hides a developer-facing detail and says the status instead", () => {
        setOnline(true);
        const error = new TempestApiError({ status: 500, detail: "stack trace interno" });
        expect(describeApiError(error, FALLBACK, { useDetail: false })).toBe(
            `${FALLBACK} (HTTP 500)`,
        );
    });

    it("still answers with a mapped code, which the app wrote itself", () => {
        setOnline(true);
        const error = new TempestApiError({
            status: 409,
            detail: "stack trace interno",
            code: "SERVICE_FULL",
        });
        expect(
            describeApiError(error, FALLBACK, {
                useDetail: false,
                codes: { SERVICE_FULL: "Sem vagas." },
            }),
        ).toBe("Sem vagas.");
    });

    it("still answers offline and validation, which are not the backend's detail", () => {
        setOnline(false);
        const offline = new TempestApiError({ status: 0, detail: "Failed to fetch" });
        expect(describeApiError(offline, FALLBACK, { useDetail: false })).toBe(
            DEFAULT_API_ERROR_STRINGS.offline,
        );

        const invalid = new TempestApiError({
            status: 422,
            detail: "body.email: Field required",
            fields: { email: "Field required" },
        });
        expect(describeApiError(invalid, FALLBACK, { useDetail: false })).toBe(
            DEFAULT_API_ERROR_STRINGS.validation,
        );
    });

    it("shows the detail when useDetail is left at its default", () => {
        setOnline(true);
        const error = new TempestApiError({ status: 500, detail: "algo deu errado" });
        expect(describeApiError(error, FALLBACK)).toBe("algo deu errado");
    });
});

describe("describeApiError — erro de negócio que nomeia um campo", () => {
    const businessError = (): TempestApiError =>
        new TempestApiError(
            buildApiError(422, {
                detail: {
                    detail: "Cidade não encontrada para o estado informado.",
                    field: "city",
                },
                code: "VALIDATION_ERROR",
                details: { field: "city" },
            }),
        );

    it("mostra a sentença do backend, que é a mesma string que foi para o campo", () => {
        // Este teste fixava o contrário até a #302. O `namedField` da 0.54.0 fez
        // `fields` vir sempre preenchido contra um backend tempest-fastapi-sdk, e
        // com isso a frase genérica passou a substituir uma sentença específica
        // que o servidor já tinha escrito na língua do app. A frase genérica
        // pressupõe uma tela destacando campos, e nenhum app destacava nada no dia
        // do bump: o recurso novo piorou o único que todo mundo usava.
        expect(describeApiError(businessError(), FALLBACK)).toBe(
            "Cidade não encontrada para o estado informado.",
        );
    });

    it("useDetail: false é o jeito de forçar a frase genérica", () => {
        expect(describeApiError(businessError(), FALLBACK, { useDetail: false })).toBe(
            DEFAULT_API_ERROR_STRINGS.validation,
        );
    });

    it("passar validation NÃO desliga a sentença de campo único", () => {
        // Deliberado: `useDescribeApiError` sempre passa `validation` (traduzida ou
        // default), então tratar isso como override faria o ramo nunca rodar em
        // componente nenhum — que é onde estão os chamadores que importam. O
        // contrato do `validation` é a frase de um payload rejeitado *campo a
        // campo*, e um campo com uma sentença pronta não é isso.
        expect(
            describeApiError(businessError(), FALLBACK, { validation: "Confira os campos." }),
        ).toBe("Cidade não encontrada para o estado informado.");
    });

    it("mantém a frase genérica quando o 422 do FastAPI nomeia vários campos", () => {
        // O caminho da lista: `detail` é montado pelo validador, meio em inglês e
        // nomeando caminho interno de payload. Nunca chega ao ramo novo, porque as
        // entradas de `fields` são as mensagens por issue, não o `detail`.
        const error = new TempestApiError(
            buildApiError(422, {
                detail: [
                    { loc: ["body", "items", 0, "price"], msg: "Input should be greater than 0" },
                    { loc: ["body", "email"], msg: "value is not a valid email address" },
                ],
            }),
        );

        expect(Object.keys(error.fields ?? {})).toHaveLength(2);
        expect(describeApiError(error, FALLBACK)).toBe(DEFAULT_API_ERROR_STRINGS.validation);
    });

    it("mantém a frase genérica quando um único campo tem mensagem diferente do detail", () => {
        const error = new TempestApiError(
            buildApiError(422, {
                detail: [{ loc: ["body", "price"], msg: "Input should be greater than 0" }],
            }),
        );

        expect(error.fields).toEqual({ price: "Input should be greater than 0" });
        expect(describeApiError(error, FALLBACK)).toBe(DEFAULT_API_ERROR_STRINGS.validation);
    });

    it("e a sentença específica continua no campo, para o input", () => {
        expect(businessError().fields).toEqual({
            city: "Cidade não encontrada para o estado informado.",
        });
    });

    it("um codes catalogado ainda ganha da frase de validação", () => {
        expect(
            describeApiError(businessError(), FALLBACK, {
                codes: { VALIDATION_ERROR: "Escolha uma cidade do estado selecionado." },
            }),
        ).toBe("Escolha uma cidade do estado selecionado.");
    });

    it("um erro de negócio que NÃO nomeia campo continua mostrando o detail", () => {
        const error = new TempestApiError(
            buildApiError(409, { detail: "Email já cadastrado", code: "EMAIL_TAKEN" }),
        );

        expect(describeApiError(error, FALLBACK)).toBe("Email já cadastrado");
    });
});
