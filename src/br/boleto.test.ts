import { describe, expect, it } from "vitest";

import {
    boletoDueDate,
    BoletoError,
    boletoKind,
    codigoBarrasToLinhaDigitavel,
    fatorVencimento,
    formatLinhaDigitavel,
    linhaDigitavelToCodigoBarras,
    mod10Dac,
    mod11DacArrecadacao,
    mod11DacCobranca,
    parseCodigoBarras,
    parseLinhaDigitavel,
    validateBoleto,
} from "./boleto";

/**
 * The 43-digit auxiliary field the FEBRABAN version 07 layout uses to demonstrate
 * both general check digits.
 *
 * Section 08 prints the resulting barcode with `1` in position 4 (módulo 10) and
 * section 10 prints it with `0` (módulo 11), from the same 43 digits — which is
 * what makes it a real oracle for both functions at once.
 */
const FEBRABAN_SPEC_BODY = "8220000215048200974123220154098290108605940";

/**
 * Boleto pairs derived outside this codebase.
 *
 * Each barcode was assembled by a separate Python implementation of the FEBRABAN
 * layout — check digits included — and its typed line computed there too, so the
 * expectations below do not come from the code they test.
 */
const BANCO = {
    /** Itaú, R$ 1 234,56, fator 1570 = 2026-09-15 under the current epoch. */
    current: {
        barcode: "34191157000001234560000123456789012345678901",
        line: "34190000172345678901723456789017115700000123456",
    },
    /** Santander, R$ 250,00, fator 9649 = 2024-03-08 under the legacy epoch. */
    legacy: {
        barcode: "03395964900000250001234567890123456789012345",
        line: "03391234576789012345767890123457596490000025000",
    },
    /** Bradesco, fator 0 — a boleto with no due date and no amount. */
    noDueDate: {
        barcode: "23792000000000000009999999999999999999999999",
        line: "23799999949999999999099999999990200000000000000",
    },
} as const;

const ARRECADACAO = {
    /** Segmento 5, identificação 6: real money, general DV by módulo 10. */
    mod10: {
        barcode: "85600000012345612342026091500000000000000000",
        line: "856000000120345612342021609150000006000000000000",
    },
    /** Segmento 6, identificação 8: real money, módulo 11, company as CNPJ prefix. */
    mod11: {
        barcode: "86800000099887712345678555555555555555555555",
        line: "868000000990887712345678855555555559555555555550",
    },
    /** Segmento 3, identificação 7: a reference quantity, not currency. */
    reference: {
        barcode: "83780000000000099991234567890123456789012345",
        line: "837800000007000099991234456789012345567890123456",
    },
} as const;

/** A fixed clock, so the `"auto"` epoch tests do not rot. */
const REFERENCE = new Date(2026, 7, 2);

/** `YYYY-MM-DD` of a local-midnight date, without going through UTC. */
function iso(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");
}

describe("mod10Dac", () => {
    it("reproduces the worked example in the FEBRABAN layout", () => {
        expect(mod10Dac("01230067896")).toBe(3);
    });

    it("reproduces the general check digit of the spec's 43-digit body", () => {
        expect(mod10Dac(FEBRABAN_SPEC_BODY)).toBe(1);
    });

    it.each([
        ["0", 0],
        ["1", 8],
        ["2", 6],
        ["5", 9],
        ["6", 7],
    ])("maps %s to %i", (value, expected) => {
        expect(mod10Dac(value)).toBe(expected);
    });

    it("rejects anything that is not digits", () => {
        expect(() => mod10Dac("")).toThrow(BoletoError);
        expect(() => mod10Dac("12a4")).toThrow(BoletoError);
    });
});

describe("mod11DacCobranca", () => {
    it("resolves remainders 0, 1 and 10 to one", () => {
        expect(mod11DacCobranca("0")).toBe(1);
        expect(mod11DacCobranca("6")).toBe(1);
        expect(mod11DacCobranca("5")).toBe(1);
    });

    it("subtracts any other remainder from eleven", () => {
        expect(mod11DacCobranca("1")).toBe(9);
        expect(mod11DacCobranca("2")).toBe(7);
        expect(mod11DacCobranca("3")).toBe(5);
    });

    it("rejects anything that is not digits", () => {
        expect(() => mod11DacCobranca("x")).toThrow(BoletoError);
    });
});

describe("mod11DacArrecadacao", () => {
    it("reproduces the check digit printed in the FEBRABAN layout", () => {
        expect(mod11DacArrecadacao(FEBRABAN_SPEC_BODY)).toBe(0);
    });

    it("resolves remainders 0 and 1 to zero, unlike the cobrança flavour", () => {
        expect(mod11DacArrecadacao("0")).toBe(0);
        expect(mod11DacArrecadacao("6")).toBe(0);
        expect(mod11DacCobranca("0")).toBe(1);
    });

    it("still subtracts a remainder of ten from eleven", () => {
        expect(mod11DacArrecadacao("5")).toBe(1);
    });

    it("rejects anything that is not digits", () => {
        expect(() => mod11DacArrecadacao("1.2")).toThrow(BoletoError);
    });
});

describe("boletoKind", () => {
    it.each([
        [BANCO.current.barcode, "banco"],
        [BANCO.current.line, "banco"],
        [ARRECADACAO.mod10.barcode, "arrecadacao"],
        [ARRECADACAO.mod10.line, "arrecadacao"],
    ])("recognises %s", (value, expected) => {
        expect(boletoKind(value)).toBe(expected);
    });

    it("returns null for a length that is not 44, 47 or 48", () => {
        expect(boletoKind("1234")).toBeNull();
        expect(boletoKind("")).toBeNull();
    });
});

describe("boletoDueDate", () => {
    it("puts the legacy ceiling on 2025-02-21", () => {
        expect(iso(boletoDueDate(9999, { epoch: "legacy" })!.date)).toBe("2025-02-21");
    });

    it("puts the restart of the counter on 2025-02-22", () => {
        expect(iso(boletoDueDate(1000, { epoch: "current" })!.date)).toBe("2025-02-22");
    });

    it("puts the first fator ever issued on 2000-07-03", () => {
        expect(iso(boletoDueDate(1000, { epoch: "legacy" })!.date)).toBe("2000-07-03");
    });

    it("returns null for the reserved fator 0", () => {
        expect(boletoDueDate(0)).toBeNull();
    });

    it("picks the epoch whose date is nearer the reference", () => {
        const recent = boletoDueDate(1570, { reference: REFERENCE })!;
        expect(recent.epoch).toBe("current");
        expect(iso(recent.date)).toBe("2026-09-15");

        const old = boletoDueDate(9649, { reference: REFERENCE })!;
        expect(old.epoch).toBe("legacy");
        expect(iso(old.date)).toBe("2024-03-08");
    });

    it("reads a fator below 1000 under the legacy epoch, which is the only one it fits", () => {
        const early = boletoDueDate(1, { reference: REFERENCE })!;
        expect(early.epoch).toBe("legacy");
        expect(iso(early.date)).toBe("1997-10-08");
    });
});

describe("fatorVencimento", () => {
    it("inverts the current epoch", () => {
        expect(fatorVencimento(new Date(2025, 1, 22))).toBe(1000);
        expect(fatorVencimento(new Date(2026, 8, 15))).toBe(1570);
    });

    it("inverts the legacy epoch", () => {
        expect(fatorVencimento(new Date(2025, 1, 21), "legacy")).toBe(9999);
        expect(fatorVencimento(new Date(2024, 2, 8), "legacy")).toBe(9649);
    });

    it("refuses a date no fator can hold", () => {
        expect(() => fatorVencimento(new Date(2020, 0, 1))).toThrow(BoletoError);
        expect(() => fatorVencimento(new Date(2099, 0, 1))).toThrow(BoletoError);
    });
});

describe("parseCodigoBarras — bank boleto", () => {
    it("splits the fields and resolves the due date", () => {
        const boleto = parseCodigoBarras(BANCO.current.barcode, { reference: REFERENCE });
        expect(boleto).toMatchObject({
            kind: "banco",
            banco: "341",
            moeda: "9",
            moedaLabel: "Real",
            dv: "1",
            fatorVencimento: 1570,
            vencimentoEpoch: "current",
            valor: 1234.56,
            campoLivre: "0000123456789012345678901",
            linhaDigitavel: BANCO.current.line,
        });
        expect(iso(boleto.kind === "banco" ? boleto.vencimento! : new Date())).toBe("2026-09-15");
    });

    it("reads a boleto from the legacy epoch", () => {
        const boleto = parseCodigoBarras(BANCO.legacy.barcode, { reference: REFERENCE });
        expect(boleto).toMatchObject({ banco: "033", valor: 250, vencimentoEpoch: "legacy" });
        expect(boleto.linhaDigitavel).toBe(BANCO.legacy.line);
    });

    it("leaves the due date null when the fator is 0", () => {
        const boleto = parseCodigoBarras(BANCO.noDueDate.barcode);
        expect(boleto).toMatchObject({
            fatorVencimento: 0,
            vencimento: null,
            vencimentoEpoch: null,
            valor: 0,
        });
    });

    it("labels an unknown currency code as null instead of guessing", () => {
        const body = `3411${BANCO.current.barcode.slice(5)}`;
        const barcode = `3411${mod11DacCobranca(body)}${BANCO.current.barcode.slice(5)}`;
        const boleto = parseCodigoBarras(barcode);
        expect(boleto.kind === "banco" && boleto.moeda).toBe("1");
        expect(boleto.kind === "banco" && boleto.moedaLabel).toBeNull();
    });

    it("ignores punctuation a scanner or a human may add", () => {
        const masked = BANCO.current.barcode.replace(/(\d{4})/g, "$1 ");
        expect(parseCodigoBarras(masked).codigoBarras).toBe(BANCO.current.barcode);
    });

    it("rejects a wrong length and points at the other parser", () => {
        expect(() => parseCodigoBarras(BANCO.current.line)).toThrow(/parseLinhaDigitavel/);
    });

    it("rejects a general check digit that does not recompute", () => {
        const digit = BANCO.current.barcode[4] === "1" ? "2" : "1";
        const broken = BANCO.current.barcode.slice(0, 4) + digit + BANCO.current.barcode.slice(5);
        expect(() => parseCodigoBarras(broken)).toThrow(/check digit/);
    });
});

describe("parseCodigoBarras — arrecadação", () => {
    it("reads a módulo 10 slip and the due date convention in the campo livre", () => {
        const boleto = parseCodigoBarras(ARRECADACAO.mod10.barcode);
        expect(boleto).toMatchObject({
            kind: "arrecadacao",
            segmento: 5,
            segmentoLabel: "Órgãos governamentais",
            identificacaoValor: 6,
            dvModulo: 10,
            dv: "0",
            valor: 1234.56,
            valorRaw: "00000123456",
            empresa: "1234",
            empresaIsCnpj: false,
            campoLivre: "2026091500000000000000000",
            linhaDigitavel: ARRECADACAO.mod10.line,
        });
        expect(iso(boleto.kind === "arrecadacao" ? boleto.vencimentoCampoLivre! : new Date())).toBe(
            "2026-09-15",
        );
    });

    it("reads a módulo 11 slip whose company identifier is a CNPJ prefix", () => {
        expect(parseCodigoBarras(ARRECADACAO.mod11.barcode)).toMatchObject({
            segmento: 6,
            identificacaoValor: 8,
            dvModulo: 11,
            valor: 9988.77,
            empresa: "12345678",
            empresaIsCnpj: true,
            campoLivre: "555555555555555555555",
            vencimentoCampoLivre: null,
            linhaDigitavel: ARRECADACAO.mod11.line,
        });
    });

    it("leaves valor null when position 3 says the field is a reference", () => {
        expect(parseCodigoBarras(ARRECADACAO.reference.barcode)).toMatchObject({
            identificacaoValor: 7,
            valor: null,
            valorRaw: "00000000000",
            vencimentoCampoLivre: null,
        });
    });

    it("labels a segmento the layout does not define as null", () => {
        const body = `888${"00000123450"}${"1".repeat(29)}`;
        const barcode = `888${mod11DacArrecadacao(body)}${body.slice(3)}`;
        const boleto = parseCodigoBarras(barcode);
        expect(boleto.kind).toBe("arrecadacao");
        expect(boleto.kind === "arrecadacao" && boleto.segmentoLabel).toBeNull();
        expect(boleto.kind === "arrecadacao" && boleto.vencimentoCampoLivre).toBeNull();
    });

    it("refuses to roll a campo livre date that is not a real day", () => {
        const body = `856${"00000123456"}1234${"20260231"}${"0".repeat(17)}`;
        const barcode = `856${mod10Dac(body)}${body.slice(3)}`;
        const boleto = parseCodigoBarras(barcode);
        expect(boleto.kind === "arrecadacao" && boleto.vencimentoCampoLivre).toBeNull();
    });

    it("rejects a position 3 outside 6-9 instead of mis-reading the value", () => {
        const broken = `85${"5"}${ARRECADACAO.mod10.barcode.slice(3)}`;
        expect(() => parseCodigoBarras(broken)).toThrow(/identificação do valor/);
    });

    it("rejects a general check digit that does not recompute", () => {
        const digit = ARRECADACAO.mod10.barcode[3] === "1" ? "2" : "1";
        const broken =
            ARRECADACAO.mod10.barcode.slice(0, 3) + digit + ARRECADACAO.mod10.barcode.slice(4);
        expect(() => parseCodigoBarras(broken)).toThrow(/Arrecadação check digit/);
    });
});

describe("parseLinhaDigitavel", () => {
    it.each([
        ["banco / current epoch", BANCO.current],
        ["banco / legacy epoch", BANCO.legacy],
        ["banco / no due date", BANCO.noDueDate],
        ["arrecadação / módulo 10", ARRECADACAO.mod10],
        ["arrecadação / módulo 11", ARRECADACAO.mod11],
        ["arrecadação / reference value", ARRECADACAO.reference],
    ])("rebuilds the barcode of a %s line", (_label, pair) => {
        expect(parseLinhaDigitavel(pair.line).codigoBarras).toBe(pair.barcode);
    });

    it("accepts the printed grouping of a 47-digit line", () => {
        expect(linhaDigitavelToCodigoBarras(formatLinhaDigitavel(BANCO.current.line))).toBe(
            BANCO.current.barcode,
        );
    });

    it("rejects a wrong length and points at the other parser", () => {
        expect(() => parseLinhaDigitavel(BANCO.current.barcode)).toThrow(/parseCodigoBarras/);
        expect(() => parseLinhaDigitavel("123")).toThrow(BoletoError);
    });

    it.each([0, 1, 2])("rejects a bad check digit in bank field %i", (field) => {
        const at = [9, 20, 31][field]!;
        const digit = BANCO.current.line[at] === "1" ? "2" : "1";
        const broken = BANCO.current.line.slice(0, at) + digit + BANCO.current.line.slice(at + 1);
        expect(() => parseLinhaDigitavel(broken)).toThrow(
            new RegExp(`Field ${field + 1} check digit`),
        );
    });

    it.each([0, 1, 2, 3])("rejects a bad check digit in arrecadação block %i", (block) => {
        const at = block * 12 + 11;
        const digit = ARRECADACAO.mod10.line[at] === "1" ? "2" : "1";
        const broken =
            ARRECADACAO.mod10.line.slice(0, at) + digit + ARRECADACAO.mod10.line.slice(at + 1);
        expect(() => parseLinhaDigitavel(broken)).toThrow(
            new RegExp(`Block ${block + 1} check digit`),
        );
    });

    it("rejects a 48-digit line that does not start with 8", () => {
        const broken = `7${ARRECADACAO.mod10.line.slice(1)}`;
        expect(() => parseLinhaDigitavel(broken)).toThrow(/must start with 8/);
    });
});

describe("round trips", () => {
    it.each([
        ["banco", BANCO.current],
        ["arrecadação módulo 10", ARRECADACAO.mod10],
        ["arrecadação módulo 11", ARRECADACAO.mod11],
    ])("converts a %s pair in both directions", (_label, pair) => {
        expect(linhaDigitavelToCodigoBarras(pair.line)).toBe(pair.barcode);
        expect(codigoBarrasToLinhaDigitavel(pair.barcode)).toBe(pair.line);
        expect(codigoBarrasToLinhaDigitavel(linhaDigitavelToCodigoBarras(pair.line))).toBe(
            pair.line,
        );
    });
});

describe("validateBoleto", () => {
    it.each([
        BANCO.current.barcode,
        BANCO.current.line,
        BANCO.legacy.line,
        ARRECADACAO.mod10.barcode,
        ARRECADACAO.mod11.line,
        ARRECADACAO.reference.line,
    ])("accepts %s", (value) => {
        expect(validateBoleto(value)).toBe(true);
    });

    it.each([
        ["an empty string", ""],
        ["a short string", "1234"],
        [
            "a 47-digit line with a broken field DV",
            `${BANCO.current.line.slice(0, 9)}00000000000000000000000000000000000000`,
        ],
        [
            "a 44-digit barcode with a broken general DV",
            `3419915700000123456000012345678901234567890`,
        ],
        ["a 48-digit arrecadação line with a broken block DV", `8${"0".repeat(47)}`],
    ])("rejects %s", (_label, value) => {
        expect(validateBoleto(value)).toBe(false);
    });
});

describe("formatLinhaDigitavel", () => {
    it("groups a 47-digit line the way it is printed", () => {
        expect(formatLinhaDigitavel(BANCO.current.line)).toBe(
            "34190.00017 23456.789017 23456.789017 1 15700000123456",
        );
    });

    it("groups a 48-digit line in four blocks of twelve", () => {
        expect(formatLinhaDigitavel(ARRECADACAO.mod10.line)).toBe(
            "856000000120 345612342021 609150000006 000000000000",
        );
    });

    it("returns anything else untouched, because it is a display helper", () => {
        expect(formatLinhaDigitavel("1234")).toBe("1234");
        expect(formatLinhaDigitavel(BANCO.current.barcode)).toBe(BANCO.current.barcode);
    });
});
