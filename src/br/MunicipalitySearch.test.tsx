import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MunicipalitySearch } from "./MunicipalitySearch";

/**
 * Renders the search followed by a plain button, so `Tab` has somewhere to go.
 *
 * @param onSelect - Spy for the picked municipality.
 * @returns The combobox input.
 */
function renderWithNextControl(onSelect: (m: unknown) => void = vi.fn()): HTMLElement {
    render(
        <>
            <MunicipalitySearch uf="SP" onSelect={onSelect} debounceMs={0} label="Município" />
            <button type="button">Depois</button>
        </>,
    );
    return screen.getByLabelText("Município");
}

/**
 * Focuses the input and enters `text` as a single change, so exactly one search
 * runs. Typing key by key starts one search per prefix, and a late prefix result
 * would reset the active index under the assertions.
 *
 * @param input - The combobox input.
 * @param text - The query.
 * @returns The options rendered for `text`.
 */
async function search(input: HTMLElement, text: string): Promise<HTMLElement[]> {
    await userEvent.click(input);
    await userEvent.paste(text);
    return screen.findAllByRole("option");
}

describe("MunicipalitySearch", () => {
    it("shows debounced results and fires onSelect on pick", async () => {
        const onSelect = vi.fn();
        render(<MunicipalitySearch uf="SP" onSelect={onSelect} debounceMs={0} label="Município" />);

        await userEvent.type(screen.getByLabelText("Município"), "santos");
        const option = await screen.findByRole("option", { name: /Santos/i });
        await userEvent.click(option);

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0]).toMatchObject({ name: "Santos", uf: "SP" });
    });

    it("shows no list for an empty query", async () => {
        render(<MunicipalitySearch onSelect={() => {}} label="Município" debounceMs={0} />);
        await userEvent.type(screen.getByLabelText("Município"), "zzzznotacity");
        await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
    });

    /**
     * Rewritten for #426. It used to assert only that the list closed after `Tab`,
     * which the 120 ms blur timer satisfied while focus went to the first result
     * and then fell to `<body>` when the timer unmounted it. Now `Tab` must land
     * on the next control of the page and close the list at once.
     */
    it("Tab leaves for the next control and closes the list, without dropping focus", async () => {
        const input = renderWithNextControl();
        await search(input, "santos");

        await userEvent.tab();

        expect(screen.getByRole("button", { name: "Depois" })).toHaveFocus();
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(input).toHaveAttribute("aria-expanded", "false");
    });

    it("keeps results out of the tab order", async () => {
        const input = renderWithNextControl();
        const options = await search(input, "san");

        for (const option of options) expect(option.tabIndex).toBe(-1);
    });

    it("ArrowDown/ArrowUp move the active result and Enter picks it", async () => {
        const onSelect = vi.fn();
        const input = renderWithNextControl(onSelect);
        const options = await search(input, "san");
        expect(options.length).toBeGreaterThan(2);

        expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
        await userEvent.keyboard("{ArrowDown}{ArrowDown}");
        expect(input).toHaveAttribute("aria-activedescendant", options[2].id);
        expect(options[2]).toHaveAttribute("aria-selected", "true");
        await userEvent.keyboard("{ArrowUp}");
        expect(input).toHaveAttribute("aria-activedescendant", options[1].id);

        const expected = options[1].textContent;
        await userEvent.keyboard("{Enter}");

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(expected).toContain(onSelect.mock.calls[0][0].name);
        expect(input).toHaveFocus();
        expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("clamps the active result at both ends of the list", async () => {
        const input = renderWithNextControl();
        const options = await search(input, "santos");

        await userEvent.keyboard("{ArrowUp}");
        expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
        await userEvent.keyboard("{ArrowDown}".repeat(options.length + 2));
        expect(input).toHaveAttribute("aria-activedescendant", options[options.length - 1].id);
    });

    it("Escape closes the list, keeps focus, and ArrowDown reopens it", async () => {
        const input = renderWithNextControl();
        await search(input, "santos");

        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("listbox")).toBeNull();
        expect(input).toHaveFocus();
        expect(input).not.toHaveAttribute("aria-activedescendant");

        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("consumes Escape and Enter only while the list is open", async () => {
        const input = renderWithNextControl();
        await search(input, "santos");

        expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
        expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(true);
        expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(true);
    });

    it("a press on the list does not blur the input, so the click lands", async () => {
        const onSelect = vi.fn();
        const input = renderWithNextControl(onSelect);
        await search(input, "santos");
        const listbox = screen.getByRole("listbox");

        expect(fireEvent.mouseDown(listbox)).toBe(false);

        const option = screen.getByRole("option", { name: /Santos/i });
        await userEvent.hover(option);
        expect(option).toHaveAttribute("aria-selected", "true");
        await userEvent.click(option);

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(input).toHaveFocus();
    });
});
