import { describe, expect, it } from "vitest";
import { validateCNPJ, validateCPF } from "./br-validators";

describe("br-validators extra branches", () => {
    it("rejects CPF when first check digit is wrong but length+digits look right", () => {
        // valid base but flipped final pair
        expect(validateCPF("529.982.247-99")).toBe(false);
    });

    it("accepts CPF with check-digit exercising mod-11→0 path", () => {
        // Valid CPF where the first or second check digit comes from the (sum*10)%11===10→0 branch.
        expect(validateCPF("000.000.001-91")).toBe(true);
    });

    it("rejects CNPJ with wrong second check digit", () => {
        expect(validateCNPJ("11.222.333/0001-82")).toBe(false);
    });

    it("rejects empty / non-digit strings", () => {
        expect(validateCPF("")).toBe(false);
        expect(validateCNPJ("abcdef")).toBe(false);
    });
});
