import { describe, expect, it } from "vitest";

import {
    chaveNFeCheckDigit,
    ChaveNFeError,
    formatChaveNFe,
    parseChaveNFe,
    validateChaveNFe,
} from "./nfe";

/**
 * Keys whose check digit was computed by a separate Python implementation of the
 * módulo 11 rule in the NF-e manual, from field values chosen here.
 */
const KEYS = {
    /** SP · 2026-01 · NF-e · série 001 · nº 123 · emissão normal. */
    nfe: "35260112345678000195550010000001231123456785",
    /** PR · 2023-06 · NFC-e · série 002 · nº 456 · contingência off-line. */
    nfce: "41230698765432000188650020000004569876543210",
    /** RO · 2024-05 · NF-e · nº 1 — the check digit lands on 9. */
    ro: "11240511222333000191550010000000011000000019",
    /** DF · 2019-12 · CT-e · nº 999999999 · contingência FS-DA. */
    cte: "53191200000000000191570009999999995999999997",
} as const;

describe("chaveNFeCheckDigit", () => {
    it.each([
        [KEYS.nfe, 5],
        [KEYS.nfce, 0],
        [KEYS.ro, 9],
        [KEYS.cte, 7],
    ])("computes the digit that closes %s", (key, expected) => {
        expect(chaveNFeCheckDigit(key.slice(0, 43))).toBe(expected);
        expect(String(expected)).toBe(key.slice(43));
    });

    it("resolves a remainder of 0 or 1 to zero", () => {
        expect(chaveNFeCheckDigit("0".repeat(43))).toBe(0);
    });

    it("rejects a body that is not exactly 43 digits", () => {
        expect(() => chaveNFeCheckDigit("0".repeat(42))).toThrow(ChaveNFeError);
        expect(() => chaveNFeCheckDigit("0".repeat(44))).toThrow(ChaveNFeError);
        expect(() => chaveNFeCheckDigit(`${"0".repeat(42)}a`)).toThrow(ChaveNFeError);
    });
});

describe("validateChaveNFe", () => {
    it.each(Object.values(KEYS))("accepts %s", (key) => {
        expect(validateChaveNFe(key)).toBe(true);
    });

    it("accepts the spacing a DANFE prints", () => {
        expect(validateChaveNFe(formatChaveNFe(KEYS.nfe))).toBe(true);
    });

    it("rejects a length other than 44", () => {
        expect(validateChaveNFe(KEYS.nfe.slice(0, 43))).toBe(false);
        expect(validateChaveNFe(`${KEYS.nfe}0`)).toBe(false);
        expect(validateChaveNFe("")).toBe(false);
    });

    it("rejects a cUF that is not a federative unit", () => {
        expect(validateChaveNFe(`99${KEYS.nfe.slice(2)}`)).toBe(false);
        expect(validateChaveNFe(`20${KEYS.nfe.slice(2)}`)).toBe(false);
    });

    it("rejects a check digit that does not recompute", () => {
        expect(validateChaveNFe(`${KEYS.nfe.slice(0, 43)}6`)).toBe(false);
    });
});

describe("parseChaveNFe", () => {
    it("splits every field of an NF-e key", () => {
        expect(parseChaveNFe(KEYS.nfe)).toEqual({
            uf: "SP",
            cUF: "35",
            anoMes: "2601",
            ano: 2026,
            mes: 1,
            cnpj: "12345678000195",
            modelo: "55",
            modeloLabel: "NF-e",
            serie: "001",
            numero: "000000123",
            tipoEmissao: "1",
            tipoEmissaoLabel: "Normal",
            codigoNumerico: "12345678",
            dv: "5",
        });
    });

    it("recognises an NFC-e issued off-line", () => {
        expect(parseChaveNFe(KEYS.nfce)).toMatchObject({
            uf: "PR",
            ano: 2023,
            mes: 6,
            modelo: "65",
            modeloLabel: "NFC-e",
            serie: "002",
            numero: "000000456",
            tipoEmissao: "9",
            tipoEmissaoLabel: "Contingência off-line (NFC-e)",
        });
    });

    it("recognises a CT-e, which shares the same key layout", () => {
        expect(parseChaveNFe(KEYS.cte)).toMatchObject({
            uf: "DF",
            modelo: "57",
            modeloLabel: "CT-e",
            numero: "999999999",
            tipoEmissaoLabel: "Contingência FS-DA",
        });
    });

    it("maps every IBGE code to a UF the locations module knows", () => {
        const codes = [
            "11",
            "12",
            "13",
            "14",
            "15",
            "16",
            "17",
            "21",
            "22",
            "23",
            "24",
            "25",
            "26",
            "27",
            "28",
            "29",
            "31",
            "32",
            "33",
            "35",
            "41",
            "42",
            "43",
            "50",
            "51",
            "52",
            "53",
        ];
        const seen = new Set<string>();
        for (const code of codes) {
            const body = `${code}${KEYS.nfe.slice(2, 43)}`;
            const key = `${body}${chaveNFeCheckDigit(body)}`;
            seen.add(parseChaveNFe(key).uf);
        }
        expect(seen.size).toBe(27);
    });

    it("accepts the spacing a DANFE prints", () => {
        expect(parseChaveNFe(formatChaveNFe(KEYS.nfe)).numero).toBe("000000123");
    });

    it("labels a model outside the table as null rather than guessing", () => {
        const body = `${KEYS.nfe.slice(0, 20)}99${KEYS.nfe.slice(22, 43)}`;
        const key = `${body}${chaveNFeCheckDigit(body)}`;
        expect(parseChaveNFe(key).modeloLabel).toBeNull();
    });

    it("labels a tpEmis outside the table as null rather than guessing", () => {
        const body = `${KEYS.nfe.slice(0, 34)}8${KEYS.nfe.slice(35, 43)}`;
        const key = `${body}${chaveNFeCheckDigit(body)}`;
        expect(parseChaveNFe(key).tipoEmissaoLabel).toBeNull();
    });

    it("rejects a length other than 44", () => {
        expect(() => parseChaveNFe("123")).toThrow(/44 digits/);
    });

    it("rejects an unknown cUF", () => {
        expect(() => parseChaveNFe(`99${KEYS.nfe.slice(2)}`)).toThrow(/IBGE code/);
    });

    it("rejects a month outside 1-12", () => {
        const body = `${KEYS.nfe.slice(0, 4)}13${KEYS.nfe.slice(6, 43)}`;
        const key = `${body}${chaveNFeCheckDigit(body)}`;
        expect(() => parseChaveNFe(key)).toThrow(/not a month/);
    });

    it("rejects a check digit that does not recompute", () => {
        expect(() => parseChaveNFe(`${KEYS.nfe.slice(0, 43)}6`)).toThrow(/Check digit/);
    });
});

describe("formatChaveNFe", () => {
    it("groups a key in eleven blocks of four", () => {
        expect(formatChaveNFe(KEYS.nfe)).toBe(
            "3526 0112 3456 7800 0195 5500 1000 0001 2311 2345 6785",
        );
    });

    it("returns anything else untouched, because it is a display helper", () => {
        expect(formatChaveNFe("123")).toBe("123");
    });
});
