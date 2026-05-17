import { describe, expect, it } from "vitest";
import { unmask, validateCNPJ, validateCPF } from "./br-validators";

describe("br-validators edge cases", () => {
    it("unmask strips formatting", () => {
        expect(unmask("123.456.789-00")).toBe("12345678900");
    });

    it("rejects CNPJ with all-equal digits", () => {
        expect(validateCNPJ("11.111.111/1111-11")).toBe(false);
    });

    it("rejects CPF with wrong second check digit", () => {
        expect(validateCPF("529.982.247-26")).toBe(false);
    });

    it("rejects CNPJ shorter than 14 digits", () => {
        expect(validateCNPJ("123")).toBe(false);
    });
});
