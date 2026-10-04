import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Button } from "./Button";
import { ButtonSlot } from "./ButtonSlot";

/**
 * The real `Button.module.css`, applied to the jsdom document.
 *
 * Vitest does not process CSS modules and hands back each key verbatim
 * (`styles.hiddenText` is `"hiddenText"`), so the raw sheet's selectors match the
 * rendered classes as written. jsdom computes no layout, but it does cascade
 * `visibility`, which is what the accessible-name computation reads — enough to
 * see the label leave the accessibility tree, which a test without the sheet
 * cannot (#416: every loading button was announced with no name).
 */
const SHEET: string = readFileSync(resolve(__dirname, "Button.module.css"), "utf8");

let style: HTMLStyleElement;

beforeEach(() => {
    style = document.createElement("style");
    style.textContent = SHEET;
    document.head.append(style);
});

afterEach(() => {
    style.remove();
});

describe("Button — a loading button keeps its accessible name (#416)", () => {
    it("a loading <button> is still found by its label", () => {
        render(<Button loading>Salvar</Button>);
        const button = screen.getByRole("button", { name: "Salvar" });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute("aria-busy", "true");
    });

    it("a loading href link is still found by its label", () => {
        render(
            <Button href="/planos" loading>
                Ver planos
            </Button>,
        );
        expect(screen.getByRole("link", { name: "Ver planos" })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
    });

    it("a loading ButtonSlot child is still found by its label", () => {
        render(
            <ButtonSlot loading>
                <a href="/planos">Ver planos</a>
            </ButtonSlot>,
        );
        expect(screen.getByRole("link", { name: "Ver planos" })).toHaveAttribute(
            "aria-busy",
            "true",
        );
    });

    it("the spinner adds nothing to the name, so it is not announced twice", () => {
        render(
            <Button loading leftIcon={<svg aria-hidden />}>
                Salvar
            </Button>,
        );
        expect(screen.getByRole("button")).toHaveAccessibleName("Salvar");
    });

    it("hides the label by paint only: no visibility or display on the loading label", () => {
        const rule = /\.loading \.hiddenText \{([^}]*)\}/.exec(SHEET)?.[1] ?? "";
        expect(rule).toMatch(/opacity:\s*0/);
        expect(rule).not.toMatch(/visibility|display/);
    });
});
