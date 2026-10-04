import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MultiSelect, type MultiSelectOption } from "./MultiSelect";

const OPTIONS: MultiSelectOption[] = [
    { value: "sp", label: "São Paulo" },
    { value: "rj", label: "Rio de Janeiro" },
    { value: "mg", label: "Minas Gerais" },
];

/**
 * Renders the multi-select, with one chip, before a plain button, and opens it
 * by clicking the input.
 *
 * @param portal - Forwarded to the multi-select.
 * @param onChange - Spy for the selection.
 * @returns The combobox input.
 */
async function renderOpen(
    portal: boolean,
    onChange: (value: string[]) => void = vi.fn(),
): Promise<HTMLElement> {
    render(
        <>
            <MultiSelect options={OPTIONS} value={["sp"]} onChange={onChange} portal={portal} />
            <button type="button">Depois</button>
        </>,
    );
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    return input;
}

describe.each([true, false])("MultiSelect focus exit (portal=%s)", (portal) => {
    it("Tab moves to the next control and closes the list", async () => {
        const input = await renderOpen(portal);

        await userEvent.tab();

        expect(screen.getByRole("button", { name: "Depois" })).toHaveFocus();
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(input).toHaveAttribute("aria-expanded", "false");
    });

    it("Shift+Tab to a chip's remove button closes the list", async () => {
        const input = await renderOpen(portal);

        await userEvent.tab({ shift: true });

        expect(screen.getByRole("button", { name: "Remover São Paulo" })).toHaveFocus();
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(input).toHaveAttribute("aria-expanded", "false");
    });

    it("a press on the empty message does not take focus from the input", async () => {
        const input = await renderOpen(portal);
        await userEvent.type(input, "zzz");

        expect(fireEvent.mouseDown(screen.getByText("Nenhuma opção encontrada"))).toBe(false);
        expect(fireEvent.mouseDown(screen.getByRole("listbox"))).toBe(false);
    });

    it("a click on an option still toggles it and keeps the list open on the input", async () => {
        const onChange = vi.fn();
        const input = await renderOpen(portal, onChange);

        await userEvent.click(screen.getByRole("option", { name: /Minas Gerais/ }));

        expect(onChange).toHaveBeenCalledWith(["sp", "mg"]);
        expect(input).toHaveFocus();
        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("points aria-activedescendant at the active option, and drops it when closed", async () => {
        const input = await renderOpen(portal);
        const [first, second] = screen.getAllByRole("option");
        expect(input).toHaveAttribute("aria-activedescendant", first.id);

        await userEvent.keyboard("{ArrowDown}");
        expect(input).toHaveAttribute("aria-activedescendant", second.id);

        await userEvent.keyboard("{Escape}");
        expect(input).not.toHaveAttribute("aria-activedescendant");
    });
});
