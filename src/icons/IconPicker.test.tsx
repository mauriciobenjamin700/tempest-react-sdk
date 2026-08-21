import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { IconPicker } from "./IconPicker";
import { DEFAULT_ICON_PICKER_MESSAGE, validateIconName } from "./validate-icon-name";

/** A controlled host, since the picker always emits the canonical slug. */
function Host({ initial = "", ...rest }: { initial?: string; limit?: number; required?: boolean }) {
    const [value, setValue] = useState(initial);
    return (
        <form onSubmit={(event) => event.preventDefault()}>
            <IconPicker value={value} onChange={setValue} aria-label="Ícone" {...rest} />
            <output>{value}</output>
            <button type="submit">Salvar</button>
        </form>
    );
}

describe("validateIconName", () => {
    it("accepts a canonical slug", () => {
        expect(validateIconName("circle-alert")).toBeUndefined();
    });

    it("accepts the legacy spellings the picker emits from", () => {
        expect(validateIconName(" Alert_Circle ")).toBeUndefined();
        expect(validateIconName("SHOPPING_CART")).toBeUndefined();
    });

    it("rejects a name lucide does not ship", () => {
        expect(validateIconName("not-an-icon")).toBe(DEFAULT_ICON_PICKER_MESSAGE);
    });

    it("takes a custom message", () => {
        expect(validateIconName("nope", "Escolha outro")).toBe("Escolha outro");
    });

    it("treats empty as a question for `required`, not a spelling mistake", () => {
        expect(validateIconName("")).toBeUndefined();
        expect(validateIconName("   ")).toBeUndefined();
    });
});

describe("IconPicker", () => {
    it("emits the canonical slug for a legacy code", async () => {
        render(<Host />);
        await userEvent.type(screen.getByLabelText("Ícone"), "Shopping_Cart");
        expect(screen.getByText("shopping-cart")).toBeInTheDocument();
    });

    it("resolves a deprecated alias to the canonical slug", async () => {
        render(<Host />);
        await userEvent.type(screen.getByLabelText("Ícone"), "alert-circle");
        expect(screen.getByText("circle-alert")).toBeInTheDocument();
    });

    it("previews the chosen icon", async () => {
        render(<Host initial="save" />);
        await waitFor(() => expect(document.querySelector("svg")).toHaveClass("lucide-save"));
    });

    it("previews nothing for a name that does not exist", () => {
        render(<Host initial="not-an-icon" />);
        expect(document.querySelector("svg")).toBeNull();
    });

    it("caps the suggestions, because 2024 options freeze a datalist", () => {
        const { container } = render(<Host initial="c" limit={5} />);
        expect(container.querySelectorAll("datalist option")).toHaveLength(5);
    });

    it("suggests names matching what was typed", async () => {
        const { container } = render(<Host initial="shopping" />);
        const values = [...container.querySelectorAll("datalist option")].map(
            (option) => (option as HTMLOptionElement).value,
        );
        expect(values.length).toBeGreaterThan(0);
        for (const value of values) expect(value).toContain("shopping");
    });

    it("marks the field invalid for an unknown slug, and blocks a native submit", async () => {
        render(<Host initial="not-an-icon" />);
        const input = screen.getByLabelText("Ícone") as HTMLInputElement;

        await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
        expect(input.validationMessage).toBe(DEFAULT_ICON_PICKER_MESSAGE);
        expect(input.checkValidity()).toBe(false);
    });

    it("clears the custom validity once the slug is real", async () => {
        render(<Host initial="not-an-icon" />);
        const input = screen.getByLabelText("Ícone") as HTMLInputElement;
        await waitFor(() => expect(input.checkValidity()).toBe(false));

        await userEvent.clear(input);
        await userEvent.type(input, "save");

        await waitFor(() => expect(input.checkValidity()).toBe(true));
        expect(input).not.toHaveAttribute("aria-invalid");
    });

    it("uses the custom invalid message", async () => {
        function Custom() {
            const [value, setValue] = useState("nope");
            return (
                <IconPicker
                    value={value}
                    onChange={setValue}
                    aria-label="Ícone"
                    invalidMessage="Escolha outro"
                />
            );
        }
        render(<Custom />);
        const input = screen.getByLabelText("Ícone") as HTMLInputElement;
        await waitFor(() => expect(input.validationMessage).toBe("Escolha outro"));
    });

    it("passes input attributes through", () => {
        render(<Host required />);
        expect(screen.getByLabelText("Ícone")).toBeRequired();
    });

    it("renders the empty preview while nothing is chosen", () => {
        function Empty() {
            return (
                <IconPicker
                    value=""
                    onChange={vi.fn()}
                    aria-label="Ícone"
                    emptyPreview={<span data-testid="ph" />}
                />
            );
        }
        render(<Empty />);
        expect(screen.getByTestId("ph")).toBeInTheDocument();
    });
});
