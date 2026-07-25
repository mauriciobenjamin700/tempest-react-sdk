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

describe("check-digit branches", () => {
    it("accepts a CPF whose first check digit lands on the 10 → 0 wrap", () => {
        // 526.018.159 has remainder 10 for the first digit, so it must become 0.
        expect(validateCPF("526.018.159-06")).toBe(true);
    });

    it("accepts a CPF with both check digits zero", () => {
        expect(validateCPF("478.245.040-00")).toBe(true);
    });

    it("rejects a CPF with a wrong second check digit", () => {
        expect(validateCPF("111.444.777-36")).toBe(false);
    });

    it("accepts a CNPJ whose check digit computes below 2 → 0", () => {
        expect(validateCNPJ("11.222.333/0001-81")).toBe(true);
    });

    it("rejects a CNPJ with a wrong second check digit", () => {
        expect(validateCNPJ("11.222.333/0001-82")).toBe(false);
    });
});

describe("validateCNPJ — check-digit wrap to zero", () => {
    it("accepts a CNPJ whose first check digit wraps to 0 (remainder < 2)", () => {
        expect(validateCNPJ("09.005.474/9952-08")).toBe(true);
    });

    it("accepts a CNPJ whose second check digit wraps to 0", () => {
        expect(validateCNPJ("04.661.099/0695-90")).toBe(true);
    });

    it("rejects the same CNPJ with a tampered first digit", () => {
        expect(validateCNPJ("09.005.474/9952-18")).toBe(false);
    });
});
