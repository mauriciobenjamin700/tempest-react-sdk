import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NavigationRail, type NavigationRailItem } from "./NavigationRail";

const items: NavigationRailItem[] = [
    { key: "home", label: "Início", icon: <span>H</span> },
    { key: "inbox", label: "Caixa", icon: <span>I</span>, badge: 3 },
    { key: "profile", label: "Perfil", icon: <span>P</span> },
];

describe("NavigationRail", () => {
    it("renders all items", () => {
        render(<NavigationRail items={items} value="home" onChange={() => {}} />);
        expect(screen.getByText("Início")).toBeInTheDocument();
        expect(screen.getByText("Caixa")).toBeInTheDocument();
        expect(screen.getByText("Perfil")).toBeInTheDocument();
    });

    it("fires onChange with the item key on click", () => {
        const onChange = vi.fn();
        render(<NavigationRail items={items} value="home" onChange={onChange} />);
        fireEvent.click(screen.getByText("Caixa"));
        expect(onChange).toHaveBeenCalledWith("inbox");
    });

    it("marks the active item with aria-current", () => {
        render(<NavigationRail items={items} value="inbox" onChange={() => {}} />);
        const active = screen.getByText("Caixa").closest("button");
        expect(active).toHaveAttribute("aria-current", "page");
    });

    it("renders header and footer slots", () => {
        render(
            <NavigationRail
                items={items}
                value="home"
                onChange={() => {}}
                header={<span>HEADER</span>}
                footer={<span>FOOTER</span>}
            />,
        );
        expect(screen.getByText("HEADER")).toBeInTheDocument();
        expect(screen.getByText("FOOTER")).toBeInTheDocument();
    });

    it("hides non-active labels when labelVisibility is selected", () => {
        render(
            <NavigationRail
                items={items}
                value="home"
                onChange={() => {}}
                labelVisibility="selected"
            />,
        );
        expect(screen.getByText("Início")).toBeInTheDocument();
        expect(screen.queryByText("Caixa")).not.toBeInTheDocument();
        expect(screen.queryByText("Perfil")).not.toBeInTheDocument();
    });
});
