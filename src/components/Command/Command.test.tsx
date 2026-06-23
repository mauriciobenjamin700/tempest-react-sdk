import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Command } from "./Command";
import type { CommandItem } from "./Command";

function makeItems(onSelect: () => void): CommandItem[] {
    return [
        { id: "new", label: "New file", group: "File", keywords: ["create"], onSelect },
        { id: "open", label: "Open file", group: "File", onSelect },
        { id: "settings", label: "Settings", group: "Preferences", onSelect },
    ];
}

describe("Command", () => {
    it("renders nothing when closed", () => {
        const { container } = render(
            <Command open={false} onOpenChange={vi.fn()} items={makeItems(vi.fn())} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("renders dialog, combobox and options when open", () => {
        render(<Command open onOpenChange={vi.fn()} items={makeItems(vi.fn())} />);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getAllByRole("option")).toHaveLength(3);
    });

    it("filters the list as the user types", async () => {
        render(<Command open onOpenChange={vi.fn()} items={makeItems(vi.fn())} />);
        await userEvent.type(screen.getByRole("combobox"), "set");
        const options = screen.getAllByRole("option");
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent("Settings");
    });

    it("matches against keywords case-insensitively", async () => {
        render(<Command open onOpenChange={vi.fn()} items={makeItems(vi.fn())} />);
        await userEvent.type(screen.getByRole("combobox"), "CREATE");
        const options = screen.getAllByRole("option");
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent("New file");
    });

    it("ArrowDown then Enter selects the active item and closes", async () => {
        const onSelectNew = vi.fn();
        const onSelectOpen = vi.fn();
        const onOpenChange = vi.fn();
        const items: CommandItem[] = [
            { id: "new", label: "New file", group: "File", onSelect: onSelectNew },
            { id: "open", label: "Open file", group: "File", onSelect: onSelectOpen },
        ];
        render(<Command open onOpenChange={onOpenChange} items={items} />);
        const input = screen.getByRole("combobox");
        await userEvent.type(input, "{ArrowDown}{Enter}");
        expect(onSelectOpen).toHaveBeenCalledTimes(1);
        expect(onSelectNew).not.toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("clicking an item selects it and closes", async () => {
        const onSelect = vi.fn();
        const onOpenChange = vi.fn();
        const items: CommandItem[] = [{ id: "go", label: "Go home", onSelect }];
        render(<Command open onOpenChange={onOpenChange} items={items} />);
        await userEvent.click(screen.getByRole("option"));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("Escape closes the palette", async () => {
        const onOpenChange = vi.fn();
        render(<Command open onOpenChange={onOpenChange} items={makeItems(vi.fn())} />);
        await userEvent.type(screen.getByRole("combobox"), "{Escape}");
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("shows the empty message when the query matches nothing", async () => {
        render(
            <Command
                open
                onOpenChange={vi.fn()}
                items={makeItems(vi.fn())}
                emptyMessage="Nothing here"
            />,
        );
        await userEvent.type(screen.getByRole("combobox"), "zzzzz");
        expect(screen.queryAllByRole("option")).toHaveLength(0);
        expect(screen.getByText("Nothing here")).toBeInTheDocument();
    });

    it("renders group headings", () => {
        render(<Command open onOpenChange={vi.fn()} items={makeItems(vi.fn())} />);
        expect(screen.getByText("File")).toBeInTheDocument();
        expect(screen.getByText("Preferences")).toBeInTheDocument();
    });
});
