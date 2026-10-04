import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";

const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
];

/**
 * Renders the combobox between two plain buttons, so `Tab` and `Shift+Tab` have
 * somewhere to go, and opens it by clicking the input.
 *
 * @param portal - Forwarded to the combobox.
 * @returns The combobox input.
 */
async function renderOpen(portal: boolean): Promise<HTMLElement> {
    render(
        <>
            <button type="button">Antes</button>
            <Combobox options={options} value="" onChange={vi.fn()} portal={portal} />
            <button type="button">Depois</button>
        </>,
    );
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    return input;
}

describe.each([true, false])("Combobox focus exit (portal=%s)", (portal) => {
    it("Tab moves to the next control and closes the list", async () => {
        const input = await renderOpen(portal);

        await userEvent.tab();

        expect(screen.getByRole("button", { name: "Depois" })).toHaveFocus();
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(input).toHaveAttribute("aria-expanded", "false");
    });

    it("Shift+Tab moves to the previous control and closes the list", async () => {
        const input = await renderOpen(portal);

        await userEvent.tab({ shift: true });

        expect(screen.getByRole("button", { name: "Antes" })).toHaveFocus();
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(input).toHaveAttribute("aria-expanded", "false");
    });

    it("a blur with no next focus target leaves the list to the outside-press rule", async () => {
        await renderOpen(portal);

        fireEvent.blur(screen.getByRole("combobox"));

        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("a press on the empty message does not take focus from the input", async () => {
        const input = await renderOpen(portal);
        await userEvent.type(input, "zzz");

        expect(fireEvent.mouseDown(screen.getByText("Nenhuma opção encontrada"))).toBe(false);
        expect(fireEvent.mouseDown(screen.getByRole("listbox"))).toBe(false);
    });

    it("a click on an option still selects it, with focus kept on the input", async () => {
        const onChange = vi.fn();
        render(<Combobox options={options} value="" onChange={onChange} portal={portal} />);
        const input = screen.getByRole("combobox");
        await userEvent.click(input);

        await userEvent.click(screen.getByRole("option", { name: "Gamma" }));

        expect(onChange).toHaveBeenCalledWith("c");
        expect(input).toHaveFocus();
        expect(screen.queryByRole("listbox")).toBeNull();
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

    it("drops aria-activedescendant when no option matches", async () => {
        const input = await renderOpen(portal);
        await userEvent.type(input, "zzz");

        expect(input).not.toHaveAttribute("aria-activedescendant");
    });
});
