import { describe, expect, it } from "vitest";

import { foldText } from "./fold-text";

describe("foldText", () => {
    it.each([
        ["João", "joao"],
        ["Usuários", "usuarios"],
        ["Ação", "acao"],
        ["SÃO PAULO", "sao paulo"],
        ["Pão de Açúcar", "pao de acucar"],
    ])("folds %s to %s, so an unaccented search finds it", (input, expected) => {
        expect(foldText(input)).toBe(expected);
    });

    it("leaves text without diacritics as lowercase only", () => {
        expect(foldText("MER-CAFE-500")).toBe("mer-cafe-500");
    });
});
