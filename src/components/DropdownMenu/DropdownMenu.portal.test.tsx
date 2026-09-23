import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "./DropdownMenu";

const items = [
    { type: "item" as const, id: "view", label: "View", onSelect: vi.fn() },
    { type: "item" as const, id: "edit", label: "Edit", onSelect: vi.fn() },
];

/**
 * Give the trigger wrapper and the menu a layout, which jsdom never computes.
 *
 * @param anchorTop - Viewport top of the trigger wrapper.
 */
function stubLayout(anchorTop: number): void {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
        top: anchorTop,
        left: 100,
        width: 40,
        height: 32,
        right: 140,
        bottom: anchorTop + 32,
        x: 100,
        y: anchorTop,
        toJSON: () => ({}),
    }));
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(180);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(120);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("DropdownMenu in a portal", () => {
    it("renders the menu outside the trigger wrapper, so an overflow ancestor cannot clip it", async () => {
        const { container } = render(
            <div style={{ overflow: "auto" }}>
                <DropdownMenu trigger={<button type="button">menu</button>} items={items} />
            </div>,
        );
        await userEvent.click(screen.getByText("menu"));
        const menu = screen.getByRole("menu");
        expect(container.contains(menu)).toBe(false);
        expect(document.body.contains(menu)).toBe(true);
        expect(menu.style.position).toBe("fixed");
    });

    it("keeps the menu in flow when portal is false", async () => {
        const { container } = render(
            <DropdownMenu
                portal={false}
                trigger={<button type="button">menu</button>}
                items={items}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        const menu = screen.getByRole("menu");
        expect(container.contains(menu)).toBe(true);
        expect(menu.style.position).toBe("");
    });

    it("selects an entry: a press on the portalled menu is not an outside press", async () => {
        const onSelect = vi.fn();
        render(
            <DropdownMenu
                trigger={<button type="button">menu</button>}
                items={[{ type: "item", id: "a", label: "A", onSelect }]}
            />,
        );
        await userEvent.click(screen.getByText("menu"));
        await userEvent.click(screen.getByRole("menuitem"));
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("closes on a press outside both trigger and menu", async () => {
        render(
            <>
                <DropdownMenu trigger={<button type="button">menu</button>} items={items} />
                <p>outside</p>
            </>,
        );
        await userEvent.click(screen.getByText("menu"));
        fireEvent.mouseDown(screen.getByText("outside"));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("focuses the first entry on open although the portal mounts a commit later", async () => {
        render(<DropdownMenu trigger={<button type="button">menu</button>} items={items} />);
        screen.getByText("menu").focus();
        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByText("View")).toHaveFocus();
    });

    it("returns focus to the trigger on Escape", async () => {
        render(<DropdownMenu trigger={<button type="button">menu</button>} items={items} />);
        await userEvent.click(screen.getByText("menu"));
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(screen.getByText("menu")).toHaveFocus();
    });

    it("opens below the trigger aligned to its start edge", async () => {
        stubLayout(100);
        render(<DropdownMenu trigger={<button type="button">menu</button>} items={items} />);
        await userEvent.click(screen.getByText("menu"));
        const menu = screen.getByRole("menu");
        expect(menu.style.top).toBe("136px");
        expect(menu.style.left).toBe("100px");
        expect(menu.style.visibility).not.toBe("hidden");
    });

    it("flips above the trigger when the last row has no room below", async () => {
        stubLayout(window.innerHeight - 40);
        render(<DropdownMenu trigger={<button type="button">menu</button>} items={items} />);
        await userEvent.click(screen.getByText("menu"));
        expect(screen.getByRole("menu").style.top).toBe(`${window.innerHeight - 40 - 4 - 120}px`);
    });

    it("follows the trigger when a container scrolls", async () => {
        vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
        stubLayout(100);
        render(<DropdownMenu trigger={<button type="button">menu</button>} items={items} />);
        fireEvent.click(screen.getByText("menu"));
        expect(screen.getByRole("menu").style.top).toBe("136px");
        stubLayout(50);
        act(() => {
            document.body.dispatchEvent(new Event("scroll"));
            vi.advanceTimersToNextFrame();
        });
        expect(screen.getByRole("menu").style.top).toBe("86px");
        vi.useRealTimers();
    });
});
