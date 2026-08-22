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

describe("createI18n — interpolation, plural fallback and formatters", () => {
    const i18n = createI18n({
        locale: "pt-BR",
        fallbackLocale: "en",
        messages: {
            "pt-BR": {
                greet: "Olá, {name}",
                items_one: "{count} item",
                items_other: "{count} itens",
                plain: "sem plural",
            },
            en: { onlyEnglish: "English only" },
        },
    });

    it("returns the template untouched with no params", () => {
        expect(i18n.t("greet")).toBe("Olá, {name}");
    });

    it("leaves an unknown placeholder in place", () => {
        expect(i18n.t("greet", { other: "x" })).toBe("Olá, {name}");
    });

    it("stringifies non-string params", () => {
        expect(i18n.t("items_other", { count: 3 })).toBe("3 itens");
    });

    it("picks the _one / _other form by count", () => {
        expect(i18n.plural("items", 1)).toBe("1 item");
        expect(i18n.plural("items", 5)).toBe("5 itens");
    });

    it("falls back to the bare key when no plural form exists", () => {
        expect(i18n.plural("plain", 2)).toBe("sem plural");
    });

    it("returns the key when nothing matches at all", () => {
        expect(i18n.plural("missing", 2)).toBe("missing");
    });

    it("merges extra params into a plural", () => {
        const custom = createI18n({
            locale: "pt-BR",
            messages: { "pt-BR": { files_other: "{count} de {total}" } },
        });
        expect(custom.plural("files", 2, { total: 9 })).toBe("2 de 9");
    });

    it("falls back to the fallback locale", () => {
        expect(i18n.t("onlyEnglish")).toBe("English only");
    });

    it("formats numbers and dates in the active locale", () => {
        expect(i18n.formatNumber(1234.5, { minimumFractionDigits: 1 })).toContain("234");
        expect(i18n.formatDate("2026-05-17T12:00:00Z")).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it("accepts a Date instance and returns empty for an invalid date", () => {
        expect(i18n.formatDate(new Date("2026-05-17T12:00:00Z"))).toMatch(/\d{4}/);
        expect(i18n.formatDate("not-a-date")).toBe("");
    });

    it("withLocale keeps the catalog and the fallback", () => {
        const en = i18n.withLocale("en");
        expect(en.locale).toBe("en");
        expect(en.t("onlyEnglish")).toBe("English only");
    });
});

/**
 * A miss has to be reportable by the layer that knows about it.
 *
 * `t` returning the key on a miss threw that information away, so a caller who
 * wanted its own text had to detect the miss from outside — in practice by
 * comparing the result against the key it had just passed in. That heuristic
 * misreads a catalog which legitimately maps a key to itself, and it was about to
 * become the pattern for every translatable string the SDK ships.
 */
describe("createI18n — default per key", () => {
    const catalog = createI18n({
        locale: "pt-BR",
        fallbackLocale: "en",
        messages: {
            "pt-BR": { greet: "Olá, {name}", "self.mapped": "self.mapped" },
            en: { onlyEn: "English only" },
        },
    });

    it("uses the default when neither locale defines the key", () => {
        expect(catalog.t("cart.empty", undefined, { default: "Carrinho vazio" })).toBe(
            "Carrinho vazio",
        );
    });

    it("prefers the catalog over the default", () => {
        expect(catalog.t("greet", { name: "Mau" }, { default: "ignorado" })).toBe("Olá, Mau");
    });

    it("prefers the fallback locale over the default", () => {
        expect(catalog.t("onlyEn", undefined, { default: "ignorado" })).toBe("English only");
    });

    it("interpolates the default, so it is not second-class", () => {
        expect(catalog.t("cart.count", { n: 3 }, { default: "{n} itens" })).toBe("3 itens");
    });

    it("still returns the key when no default is given", () => {
        expect(catalog.t("cart.empty")).toBe("cart.empty");
    });

    it("treats a key mapped to itself as a hit, which the old heuristic could not", () => {
        expect(catalog.t("self.mapped", undefined, { default: "nunca" })).toBe("self.mapped");
    });

    it("applies the default to plural too, after both suffixed lookups", () => {
        expect(catalog.plural("boxes", 2, undefined, { default: "{count} caixas" })).toBe(
            "2 caixas",
        );
        expect(catalog.plural("alos", 3)).toBe("alos");
    });
});
