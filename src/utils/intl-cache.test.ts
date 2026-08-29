import { beforeEach, describe, expect, it } from "vitest";
import { clearIntlCache, dateTimeFormat, numberFormat } from "@/utils/intl-cache";

describe("intl cache", () => {
    beforeEach(() => {
        clearIntlCache();
    });

    it("hands back the same formatter for the same locale and options", () => {
        const options: Intl.NumberFormatOptions = { style: "currency", currency: "BRL" };
        expect(numberFormat("pt-BR", options)).toBe(numberFormat("pt-BR", options));
        expect(dateTimeFormat("pt-BR")).toBe(dateTimeFormat("pt-BR"));
    });

    it("keys on the option values, not on object identity", () => {
        const first = numberFormat("pt-BR", { style: "currency", currency: "BRL" });
        const second = numberFormat("pt-BR", { style: "currency", currency: "BRL" });
        expect(second).toBe(first);
    });

    it("keeps different locales and different options apart", () => {
        expect(numberFormat("pt-BR")).not.toBe(numberFormat("en-US"));
        expect(numberFormat("pt-BR", { style: "percent" })).not.toBe(
            numberFormat("pt-BR", { style: "decimal" }),
        );
        expect(dateTimeFormat("pt-BR", { dateStyle: "short" })).not.toBe(
            dateTimeFormat("pt-BR", { dateStyle: "full" }),
        );
    });

    it("formats identically to a formatter built on the spot", () => {
        const options: Intl.NumberFormatOptions = { style: "currency", currency: "BRL" };
        expect(numberFormat("pt-BR", options).format(1234.5)).toBe(
            new Intl.NumberFormat("pt-BR", options).format(1234.5),
        );
        const date = new Date("2026-03-14T15:09:00Z");
        expect(dateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)).toBe(
            new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date),
        );
    });

    it("resets instead of growing without bound when a caller varies its options", () => {
        const first = numberFormat("pt-BR", { maximumFractionDigits: 0 });
        for (let digits = 1; digits <= 70; digits += 1) {
            numberFormat("pt-BR", { maximumFractionDigits: digits });
        }
        expect(numberFormat("pt-BR", { maximumFractionDigits: 0 })).not.toBe(first);
    });
});
