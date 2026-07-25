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

describe("Sidebar — widths, icons, badges and disabled items", () => {
    const items = [
        { key: "home", label: "Início", icon: <span data-testid="icon">i</span>, badge: 3 },
        { key: "off", label: "Bloqueado", disabled: true },
    ];

    it("accepts string widths for both states", () => {
        const { container, unmount } = render(<Sidebar items={items} width="18rem" />);
        expect((container.firstChild as HTMLElement).style.width).toBe("18rem");
        unmount();

        const { container: small } = render(
            <Sidebar items={items} collapsed collapsedWidth="4rem" />,
        );
        expect((small.firstChild as HTMLElement).style.width).toBe("4rem");
    });

    it("renders icons and badges expanded, hiding the badge when collapsed", () => {
        const { unmount } = render(<Sidebar items={items} />);
        expect(screen.getByTestId("icon")).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();
        unmount();

        render(<Sidebar items={items} collapsed />);
        expect(screen.getByTestId("icon")).toBeInTheDocument();
        expect(screen.queryByText("3")).not.toBeInTheDocument();
    });

    it("uses the label as a title only when collapsed and the label is a string", () => {
        const { unmount } = render(<Sidebar items={items} collapsed />);
        expect(screen.getByTitle("Início")).toBeInTheDocument();
        unmount();

        render(<Sidebar items={[{ key: "n", label: <em>Node</em> }]} collapsed />);
        expect(document.querySelector("button[title]")).toBeNull();
    });

    it("disables an item and never calls onChange for it", async () => {
        const onChange = vi.fn();
        render(<Sidebar items={items} onChange={onChange} />);
        const blocked = screen.getByRole("button", { name: "Bloqueado" });
        expect(blocked).toBeDisabled();
        await userEvent.click(blocked);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("merges an inline style over the computed width", () => {
        const { container } = render(<Sidebar items={items} style={{ width: "10px" }} />);
        expect((container.firstChild as HTMLElement).style.width).toBe("10px");
    });
});
