import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu, type DropdownMenuEntry } from "./DropdownMenu";

/**
 * The keyboard `role="menu"` promises.
 *
 * Every assertion here drives the keyboard through `userEvent`, which sends keys
 * to whatever holds focus. That is the whole point: the previous implementation
 * passed its arrow-key tests by dispatching on `window`, which never asks whether
 * focus reached the menu — and it never did.
 */

const ENTRIES: DropdownMenuEntry[] = [
    { type: "label", id: "l", label: "Conta" },
    { type: "item", id: "perfil", label: "Perfil", onSelect: vi.fn() },
    { type: "item", id: "faturas", label: "Faturas", disabled: true, onSelect: vi.fn() },
    { type: "separator", id: "s" },
    { type: "item", id: "sair", label: "Sair", danger: true, onSelect: vi.fn() },
];

/**
 * Render a menu with a plain trigger.
 *
 * @param items - Entries to show. Defaults to {@link ENTRIES}.
 * @returns The trigger element, already queried.
 */
function setup(items: DropdownMenuEntry[] = ENTRIES): HTMLElement {
    render(<DropdownMenu trigger={<button type="button">Mais opções</button>} items={items} />);
    return screen.getByRole("button", { name: "Mais opções" });
}

describe("DropdownMenu keyboard follows the APG menu button pattern", () => {
    it("opens with ArrowDown from the trigger and lands on the first entry", async () => {
        const trigger = setup();
        trigger.focus();

        await userEvent.keyboard("{ArrowDown}");

        expect(screen.getByRole("menu")).toBeInTheDocument();
        expect(document.activeElement?.textContent).toContain("Perfil");
    });

    it("opens with ArrowUp and lands on the last entry", async () => {
        const trigger = setup();
        trigger.focus();

        await userEvent.keyboard("{ArrowUp}");

        expect(document.activeElement?.textContent).toContain("Sair");
    });

    it("opens with Enter and with Space", async () => {
        const trigger = setup();
        trigger.focus();

        await userEvent.keyboard("{Enter}");
        expect(document.activeElement?.textContent).toContain("Perfil");

        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();

        await userEvent.keyboard(" ");
        expect(document.activeElement?.textContent).toContain("Perfil");
    });

    it("jumps to the ends with Home and End", async () => {
        const trigger = setup();
        await userEvent.click(trigger);

        await userEvent.keyboard("{End}");
        expect(document.activeElement?.textContent).toContain("Sair");

        await userEvent.keyboard("{Home}");
        expect(document.activeElement?.textContent).toContain("Perfil");
    });

    it("manages focus so Tab does not walk the menu one entry at a time", async () => {
        const trigger = setup();
        await userEvent.click(trigger);

        const entries = screen.getAllByRole("menuitem");
        const focusable = entries.filter((entry) => entry.getAttribute("tabindex") === "0");

        expect(entries.length).toBeGreaterThan(1);
        expect(focusable).toHaveLength(1);
        expect(focusable[0]?.textContent).toContain("Perfil");
    });

    it("closes on Tab and leaves the page's own order to take over", async () => {
        const trigger = setup();
        await userEvent.click(trigger);
        expect(screen.getByRole("menu")).toBeInTheDocument();

        await userEvent.keyboard("{Tab}");

        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("returns focus to the trigger on Escape", async () => {
        const trigger = setup();
        await userEvent.click(trigger);

        await userEvent.keyboard("{Escape}");

        expect(document.activeElement).toBe(trigger);
    });

    it("never stops on a disabled entry", async () => {
        const trigger = setup();
        await userEvent.click(trigger);

        for (let step = 0; step < 6; step += 1) {
            await userEvent.keyboard("{ArrowDown}");
            expect(document.activeElement?.textContent).not.toContain("Faturas");
        }
    });
});

describe("DropdownMenu checkbox entries", () => {
    /**
     * A menu holding one toggle, wired to real state.
     *
     * @returns The rendered harness.
     */
    function Harness() {
        const [quiet, setQuiet] = useState(false);
        return (
            <DropdownMenu
                trigger={<button type="button">Mais opções</button>}
                items={[
                    {
                        type: "checkbox",
                        id: "quiet",
                        label: "Silenciar os sons da chamada",
                        checked: quiet,
                        onSelect: () => setQuiet((value) => !value),
                    },
                    { type: "item", id: "cfg", label: "Configurações", onSelect: vi.fn() },
                ]}
            />
        );
    }

    it("announces its state through role and aria-checked", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

        const toggle = screen.getByRole("menuitemcheckbox");
        expect(toggle).toHaveAttribute("aria-checked", "false");

        await userEvent.click(toggle);

        expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
    });

    it("stays open after a toggle, so two settings are one trip", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

        await userEvent.click(screen.getByRole("menuitemcheckbox"));

        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("closes after a plain item, as before", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Mais opções" }));

        await userEvent.click(screen.getByRole("menuitem", { name: "Configurações" }));

        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("takes focus like any other entry", async () => {
        render(<Harness />);
        const trigger = screen.getByRole("button", { name: "Mais opções" });
        trigger.focus();

        await userEvent.keyboard("{ArrowDown}");

        expect(document.activeElement).toBe(screen.getByRole("menuitemcheckbox"));
    });
});
