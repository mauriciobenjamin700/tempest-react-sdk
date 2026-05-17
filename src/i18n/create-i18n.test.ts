import { describe, expect, it } from "vitest";
import { createI18n } from "./create-i18n";

const i18n = createI18n({
    locale: "pt-BR",
    fallbackLocale: "en",
    messages: {
        "pt-BR": {
            greet: "Olá, {name}",
            alos_one: "{count} Alô",
            alos_other: "{count} Alôs",
        },
        en: { greet: "Hi, {name}", alos_one: "{count} Alo", alos_other: "{count} Alos" },
    },
});

describe("createI18n.t", () => {
    it("interpolates placeholders", () => {
        expect(i18n.t("greet", { name: "Mau" })).toBe("Olá, Mau");
    });

    it("returns the key when missing", () => {
        expect(i18n.t("missing.key")).toBe("missing.key");
    });

    it("falls back to fallbackLocale", () => {
        const en = i18n.withLocale("en");
        expect(en.t("greet", { name: "Mau" })).toBe("Hi, Mau");
    });
});

describe("createI18n.plural", () => {
    it("picks _one when count === 1", () => {
        expect(i18n.plural("alos", 1)).toBe("1 Alô");
    });

    it("picks _other otherwise", () => {
        expect(i18n.plural("alos", 5)).toBe("5 Alôs");
    });
});
