import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

const items = [
    { key: "home", label: "Home" },
    { key: "settings", label: "Settings" },
];

describe("Sidebar", () => {
    it("renders header, items and footer", () => {
        render(<Sidebar header={<span>BRAND</span>} items={items} footer={<span>FOOT</span>} />);
        expect(screen.getByText("BRAND")).toBeInTheDocument();
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("FOOT")).toBeInTheDocument();
    });

    it("marks active item with aria-current=page", () => {
        render(<Sidebar items={items} value="settings" />);
        const selected = screen.getByText("Settings").closest("button")!;
        expect(selected).toHaveAttribute("aria-current", "page");
    });

    it("fires onChange when an item is clicked", async () => {
        const onChange = vi.fn();
        render(<Sidebar items={items} onChange={onChange} />);
        await userEvent.click(screen.getByText("Settings"));
        expect(onChange).toHaveBeenCalledWith("settings");
    });

    it("hides labels when collapsed", () => {
        render(<Sidebar items={items} collapsed />);
        expect(screen.queryByText("Home")).toBeNull();
    });

    it("applies width style based on collapsed state", () => {
        const { container, rerender } = render(<Sidebar items={items} width={300} />);
        expect((container.firstElementChild as HTMLElement).style.width).toBe("300px");
        rerender(<Sidebar items={items} collapsed collapsedWidth={80} />);
        expect((container.firstElementChild as HTMLElement).style.width).toBe("80px");
    });
});
