import { describe, expect, it } from "vitest";
import { formatCEP, formatCNPJ, validateCNPJ, validateCPF } from "./br-validators";

describe("validateCPF", () => {
    it("accepts a known-valid CPF (with mask)", () => {
        expect(validateCPF("529.982.247-25")).toBe(true);
    });

    it("rejects all-equal digits", () => {
        expect(validateCPF("111.111.111-11")).toBe(false);
    });

    it("rejects wrong length", () => {
        expect(validateCPF("123")).toBe(false);
    });
});

describe("validateCNPJ", () => {
    it("accepts a known-valid CNPJ", () => {
        expect(validateCNPJ("11.222.333/0001-81")).toBe(true);
    });

    it("rejects invalid CNPJ", () => {
        expect(validateCNPJ("12.345.678/0001-99")).toBe(false);
    });
});

describe("formatCEP / formatCNPJ", () => {
    it("masks CEP", () => {
        expect(formatCEP("01310100")).toBe("01310-100");
    });

    it("masks CNPJ", () => {
        expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
    });
});
