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

describe("Sidebar — sections and separators", () => {
    const grouped = [
        { type: "section" as const, key: "monitoring", label: "Monitoramento" },
        { key: "overview", label: "Visão Geral" },
        { key: "activity", label: "Atividade" },
        { type: "section" as const, key: "admin", label: "Administração" },
        { key: "settings", label: "Configurações" },
    ];

    it("keeps a plain item list working, with no group wrapper needed", () => {
        render(<Sidebar items={items} />);
        expect(screen.queryAllByRole("group")).toHaveLength(0);
        expect(screen.getByText("Home")).toBeInTheDocument();
    });

    it("names each group with its section label", () => {
        render(<Sidebar items={grouped} />);
        const groups = screen.getAllByRole("group");
        expect(groups).toHaveLength(2);
        expect(groups[0]).toHaveAccessibleName("Monitoramento");
        expect(groups[1]).toHaveAccessibleName("Administração");
    });

    it("puts each item inside the group its section opened", () => {
        render(<Sidebar items={grouped} />);
        const [monitoring, administration] = screen.getAllByRole("group");
        expect(monitoring).toContainElement(screen.getByText("Atividade"));
        expect(administration).toContainElement(screen.getByText("Configurações"));
        expect(monitoring).not.toContainElement(screen.getByText("Configurações"));
    });

    it("keeps items clickable inside a group", async () => {
        const onChange = vi.fn();
        render(<Sidebar items={grouped} onChange={onChange} />);
        await userEvent.click(screen.getByText("Configurações"));
        expect(onChange).toHaveBeenCalledWith("settings");
    });

    it("leaves items before the first section outside any group", () => {
        render(<Sidebar items={[{ key: "home", label: "Home" }, ...grouped]} />);
        for (const group of screen.getAllByRole("group")) {
            expect(group).not.toContainElement(screen.getByText("Home"));
        }
    });

    it("keeps the group named when collapsed, with the label out of sight", () => {
        render(<Sidebar items={grouped} collapsed />);
        const groups = screen.getAllByRole("group");
        expect(groups[0]).toHaveAccessibleName("Monitoramento");
        expect(screen.getByText("Monitoramento").className).toContain("sectionCollapsed");
    });

    it("renders a separator that no user can focus", async () => {
        render(
            <Sidebar
                items={[
                    { key: "home", label: "Home" },
                    { type: "separator", key: "div" },
                    { key: "settings", label: "Settings" },
                ]}
            />,
        );
        const separator = screen.getByRole("separator");
        expect(separator.tagName).toBe("HR");
        await userEvent.tab();
        await userEvent.tab();
        expect(document.activeElement).toBe(screen.getByText("Settings").closest("button"));
    });

    it("closes the open section, so items after a separator are loose again", () => {
        render(
            <Sidebar
                items={[
                    { type: "section", key: "monitoring", label: "Monitoramento" },
                    { key: "overview", label: "Visão Geral" },
                    { type: "separator", key: "div" },
                    { key: "logout", label: "Sair" },
                ]}
            />,
        );
        const [group] = screen.getAllByRole("group");
        expect(group).not.toContainElement(screen.getByText("Sair"));
    });
});

describe("Sidebar — href", () => {
    it("renders an anchor when the item carries an href", () => {
        render(<Sidebar items={[{ key: "docs", label: "Docs", href: "/docs" }]} />);
        const link = screen.getByRole("link", { name: "Docs" });
        expect(link).toHaveAttribute("href", "/docs");
    });

    it("still reports the selection through onChange", async () => {
        const onChange = vi.fn();
        render(
            <Sidebar items={[{ key: "docs", label: "Docs", href: "/docs" }]} onChange={onChange} />,
        );
        await userEvent.click(screen.getByRole("link", { name: "Docs" }));
        expect(onChange).toHaveBeenCalledWith("docs");
    });

    it("marks the active link with aria-current=page", () => {
        render(<Sidebar items={[{ key: "docs", label: "Docs", href: "/docs" }]} value="docs" />);
        expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "page");
    });

    it("stays a disabled button when the item is disabled", () => {
        render(<Sidebar items={[{ key: "docs", label: "Docs", href: "/docs", disabled: true }]} />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByRole("button", { name: "Docs" })).toBeDisabled();
    });
});
