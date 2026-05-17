import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "./DropdownMenu";

describe("DropdownMenu", () => {
    it("opens on trigger click", async () => {
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[{ type: "item", id: "a", label: "Item A", onSelect: vi.fn() }]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        expect(screen.getByText("Item A")).toBeInTheDocument();
    });

    it("invokes onSelect and closes", async () => {
        const onSelect = vi.fn();
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[{ type: "item", id: "a", label: "A", onSelect }]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        await userEvent.click(screen.getByRole("menuitem"));
        expect(onSelect).toHaveBeenCalled();
        expect(screen.queryByText("A")).not.toBeInTheDocument();
    });

    it("renders separator + label entries", async () => {
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[
                    { type: "label", id: "l", label: "Group" },
                    { type: "item", id: "a", label: "A", onSelect: vi.fn() },
                    { type: "separator", id: "s" },
                    { type: "item", id: "b", label: "B", onSelect: vi.fn() },
                ]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        expect(screen.getByText("Group")).toBeInTheDocument();
        expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    });

    it("danger entry gets danger class", async () => {
        const { container } = render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[
                    { type: "item", id: "a", label: "Delete", danger: true, onSelect: vi.fn() },
                ]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        const item = container.querySelector("[role=menuitem]");
        expect(item?.className).toContain("danger");
    });
});
