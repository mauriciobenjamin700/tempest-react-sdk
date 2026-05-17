import { describe, expect, it } from "vitest";
import { createI18n } from "./create-i18n";

describe("createI18n extras", () => {
    const messages = {
        "pt-BR": { hi: "Olá" },
        en: { hi: "Hi" },
    };

    it("formatNumber uses locale", () => {
        const i18n = createI18n({ locale: "pt-BR", messages });
        expect(i18n.formatNumber(1234.5)).toBe("1.234,5");
    });

    it("formatDate uses locale", () => {
        const i18n = createI18n({ locale: "pt-BR", messages });
        const date = i18n.formatDate("2026-05-16");
        expect(date).toMatch(/16\/05\/2026|15\/05\/2026/);
    });

    it("formatDate returns empty string for invalid input", () => {
        const i18n = createI18n({ locale: "pt-BR", messages });
        expect(i18n.formatDate("not-a-date")).toBe("");
    });

    it("withLocale switches and preserves fallback", () => {
        const i18n = createI18n({ locale: "pt-BR", fallbackLocale: "en", messages });
        const en = i18n.withLocale("en");
        expect(en.locale).toBe("en");
        expect(en.t("hi")).toBe("Hi");
    });

    it("missing locale falls through fallback", () => {
        const i18n = createI18n({
            locale: "fr",
            fallbackLocale: "en",
            messages,
        });
        expect(i18n.t("hi")).toBe("Hi");
    });
});
