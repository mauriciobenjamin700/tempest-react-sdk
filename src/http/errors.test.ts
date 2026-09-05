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

    it("indexes the validation entries on fields, keyed by the field path", () => {
        const err = buildApiError(422, {
            detail: [
                { type: "missing", loc: ["body", "email"], msg: "Field required" },
                {
                    type: "greater_than",
                    loc: ["body", "items", 0, "price"],
                    msg: "Input should be greater than 0",
                },
            ],
        });
        expect(err.fields).toEqual({
            email: "Field required",
            "items.0.price": "Input should be greater than 0",
        });
    });

    it("keeps the first message when a field fails twice", () => {
        const err = buildApiError(422, {
            detail: [
                { loc: ["body", "email"], msg: "primeira" },
                { loc: ["body", "email"], msg: "segunda" },
            ],
        });
        expect(err.fields).toEqual({ email: "primeira" });
    });

    it("leaves fields undefined when the body is not a validation list", () => {
        expect(buildApiError(409, { detail: "Email já cadastrado" }).fields).toBeUndefined();
        expect(buildApiError(422, { detail: [{ msg: "sem loc" }] }).fields).toBeUndefined();
        expect(buildApiError(422, { detail: [{ loc: ["body", "email"] }] }).fields).toBeUndefined();
    });

    it("carries fields onto the thrown TempestApiError", () => {
        const err = new TempestApiError(
            buildApiError(422, { detail: [{ loc: ["body", "email"], msg: "Field required" }] }),
        );
        expect(err.fields).toEqual({ email: "Field required" });
        expect(err).toBeInstanceOf(Error);
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

    it("reads a nested detail down to the depth cap, then gives up", () => {
        expect(buildApiError(400, { detail: { detail: { msg: "três níveis" } } }).detail).toBe(
            "três níveis",
        );
        expect(
            buildApiError(400, {
                detail: { detail: { detail: { detail: { detail: { msg: "fundo" } } } } },
            }).detail,
        ).toBe("Erro 400");
    });

    it("survives a hostile deeply nested detail instead of overflowing the stack", () => {
        const depth = 20_000;
        const raw = '{"detail":'.repeat(depth) + '{"msg":"x"}' + "}".repeat(depth);
        const body: unknown = JSON.parse(raw);

        const err = buildApiError(422, body);

        expect(err.status).toBe(422);
        expect(err.detail).toBe("Erro 422");
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

describe("buildApiError — os envelopes que um backend tempest-fastapi-sdk realmente manda", () => {
    const flattenedValidation = {
        detail: "Value error, Numero de telefone invalido for field 'phone' in 'body'",
        field: "phone",
        location: "body -> phone",
        type: "value_error",
    };

    const businessError = {
        detail: {
            detail: "Cidade nao encontrada para o estado informado.",
            field: "city",
        },
        code: "VALIDATION_ERROR",
        details: { field: "city" },
    };

    it("mapeia o campo que um RequestValidationError achatado nomeia, sem a cauda", () => {
        // A cauda `for field 'x' in 'y'` é inglês colado numa mensagem que o
        // servidor escreveu na língua do app, e os dois valores dela já chegam
        // como `field` e `location` no envelope — é de lá que `fields` os lê.
        // Deixada de pé, ela ia para a tela do usuário, e cada app consumidor
        // criou o próprio regex para apará-la.
        const err = buildApiError(422, flattenedValidation);

        expect(err.fields).toEqual({ phone: "Value error, Numero de telefone invalido" });
        expect(err.detail).toBe("Value error, Numero de telefone invalido");
    });

    it("deixa a cauda de pé quando ela nomeia um campo que não é o resolvido", () => {
        // O aparo só dispara quando pode atribuir o que está apagando. Uma cauda
        // que nomeia outro campo é outro formato de envelope, ou uma frase que
        // genuinamente se lê assim — nos dois casos, texto que não é meu para
        // apagar.
        const err = buildApiError(422, {
            detail: "CPF inválido for field 'documento' in 'body'",
            field: "cpf",
        });

        expect(err.detail).toBe("CPF inválido for field 'documento' in 'body'");
    });

    it("não esvazia o detail quando a mensagem é só a cauda", () => {
        const err = buildApiError(422, {
            detail: "for field 'cpf' in 'body'",
            field: "cpf",
        });

        expect(err.detail).toBe("for field 'cpf' in 'body'");
    });

    it("mapeia o campo que um AppException põe dentro do detail", () => {
        const err = buildApiError(422, businessError);

        expect(err.fields).toEqual({ city: "Cidade nao encontrada para o estado informado." });
        expect(err.detail).toBe("Cidade nao encontrada para o estado informado.");
        expect(err.code).toBe("VALIDATION_ERROR");
    });

    it("lê o campo do saco de contexto details quando nada mais o nomeia", () => {
        const err = buildApiError(422, {
            detail: "Coluna de ordenação inválida",
            code: "INVALID_SORT",
            details: { field: "criado_em", allowed: ["created_at"] },
        });

        expect(err.fields).toEqual({ criado_em: "Coluna de ordenação inválida" });
    });

    it("prefere o field de dentro do detail a todos os outros", () => {
        const err = buildApiError(422, {
            detail: { detail: "msg", field: "de-dentro" },
            field: "de-fora",
            details: { field: "do-contexto" },
        });

        expect(err.fields).toEqual({ "de-dentro": "msg" });
    });

    it("prefere o field do topo ao do saco de contexto", () => {
        const err = buildApiError(422, {
            detail: "msg",
            field: "de-fora",
            details: { field: "do-contexto" },
        });

        expect(err.fields).toEqual({ "de-fora": "msg" });
    });

    it("deixa fields indefinido no erro de negócio que não nomeia campo nenhum", () => {
        const err = buildApiError(409, {
            detail: "Email já cadastrado",
            code: "EMAIL_TAKEN",
            details: { request_id: "req-1" },
        });

        expect(err.fields).toBeUndefined();
        expect(err.requestId).toBe("req-1");
    });

    it("não deixa o detail sintético cair num input quando não há mensagem legível", () => {
        for (const body of [
            { field: "phone" },
            { field: "phone", detail: [] },
            { field: "phone", detail: null },
        ]) {
            const err = buildApiError(422, body);

            expect(err.fields).toBeUndefined();
            expect(err.detail).toBe("Erro 422");
        }
    });

    it("ignora um field que não é string não-vazia", () => {
        expect(buildApiError(422, { detail: "msg", field: "" }).fields).toBeUndefined();
        expect(buildApiError(422, { detail: "msg", field: 42 }).fields).toBeUndefined();
        expect(buildApiError(422, { detail: "msg", field: null }).fields).toBeUndefined();
        expect(
            buildApiError(422, { detail: "msg", details: { field: ["a"] } }).fields,
        ).toBeUndefined();
    });

    it("a lista do FastAPI ganha de um field nomeado ao lado dela", () => {
        const err = buildApiError(422, {
            detail: [{ loc: ["body", "email"], msg: "Field required" }],
            field: "phone",
        });

        expect(err.fields).toEqual({ email: "Field required" });
    });

    it("cai no field nomeado quando a lista não nomeia nenhum", () => {
        const err = buildApiError(422, { detail: [{ msg: "sem loc" }], field: "phone" });

        expect(err.fields).toEqual({ phone: "sem loc" });
    });

    it("tira a mensagem do campo de message quando não há detail", () => {
        const err = buildApiError(422, { message: "boom", field: "phone" });

        expect(err.fields).toEqual({ phone: "boom" });
        expect(err.detail).toBe("boom");
    });

    it("carrega o campo nomeado até o TempestApiError lançado", () => {
        const err = new TempestApiError(buildApiError(422, flattenedValidation));

        expect(err.fields).toEqual({ phone: "Value error, Numero de telefone invalido" });
        expect(err).toBeInstanceOf(Error);
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

describe("errors — the shapes the normaliser cannot read", () => {
    it("reads Retry-After given as an HTTP date", () => {
        const when = new Date(Date.now() + 120_000).toUTCString();

        expect(parseRetryAfter(when)).toBeGreaterThan(100);
        expect(parseRetryAfter(when)).toBeLessThanOrEqual(120);
    });

    it("never reports a negative wait for a date already in the past", () => {
        expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
    });

    it("falls through to the synthetic detail when the body carries no readable one", () => {
        const error = buildApiError(422, { detail: [{ loc: ["body"], ctx: { limit: 3 } }] });

        expect(error.detail).toBe("Erro 422");
    });
});
