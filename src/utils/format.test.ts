import { describe, expect, it } from "vitest";
import {
    formatCPF,
    formatCurrency,
    formatDate,
    formatDateTime,
    formatPercent,
    formatPhone,
} from "./format";

describe("formatCurrency", () => {
    it("formats BRL value", () => {
        expect(formatCurrency(1234.5)).toContain("R$");
        expect(formatCurrency(1234.5)).toContain("1.234,5");
    });
});

describe("formatDate", () => {
    it("formats ISO string as PT-BR", () => {
        expect(formatDate("2026-05-16T12:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it("returns empty string for invalid date", () => {
        expect(formatDate("not-a-date")).toBe("");
    });

    it("accepts Date instances", () => {
        expect(formatDate(new Date("2026-05-16"))).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
});

describe("formatDateTime", () => {
    it("formats date + time", () => {
        const out = formatDateTime(new Date("2026-05-16T12:30:00Z"));
        expect(out).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        expect(out).toMatch(/\d{2}:\d{2}/);
    });

    it("returns empty string for invalid", () => {
        expect(formatDateTime("nope")).toBe("");
    });
});

describe("formatPhone", () => {
    it("formats 11-digit mobile", () => {
        expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    });

    it("formats 10-digit landline", () => {
        expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    });

    it("strips non-digits before masking", () => {
        expect(formatPhone("(11) 9 8765-4321")).toBe("(11) 98765-4321");
    });

    it("clamps at 11 digits", () => {
        expect(formatPhone("119876543219999")).toBe("(11) 98765-4321");
    });
});

describe("formatCPF", () => {
    it("formats CPF", () => {
        expect(formatCPF("12345678900")).toBe("123.456.789-00");
    });

    it("handles partial input", () => {
        expect(formatCPF("123")).toBe("123");
    });
});

describe("formatPercent", () => {
    it("formats fraction as PT-BR percent", () => {
        expect(formatPercent(0.125)).toBe("12,5%");
    });

    it("formats zero", () => {
        expect(formatPercent(0)).toBe("0,0%");
    });
});
