import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomNavigation } from "./BottomNavigation";

const items = [
    { key: "home", label: "Home" },
    { key: "search", label: "Search" },
    { key: "profile", label: "Profile" },
];

describe("BottomNavigation", () => {
    it("renders all items", () => {
        render(<BottomNavigation items={items} value="home" onChange={() => {}} />);
        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Search")).toBeInTheDocument();
        expect(screen.getByText("Profile")).toBeInTheDocument();
    });

    it("marks the selected item with aria-current=page", () => {
        render(<BottomNavigation items={items} value="search" onChange={() => {}} />);
        const selected = screen.getByText("Search").closest("button")!;
        expect(selected).toHaveAttribute("aria-current", "page");
    });

    it("fires onChange with the clicked key", async () => {
        const onChange = vi.fn();
        render(<BottomNavigation items={items} value="home" onChange={onChange} />);
        await userEvent.click(screen.getByText("Profile"));
        expect(onChange).toHaveBeenCalledWith("profile");
    });

    it("hides labels when showLabels=false", () => {
        render(
            <BottomNavigation items={items} value="home" onChange={() => {}} showLabels={false} />,
        );
        expect(screen.queryByText("Home")).toBeNull();
    });

    it("does not fire onChange when item is disabled", async () => {
        const onChange = vi.fn();
        const disabled = [{ ...items[0], disabled: true }, items[1]];
        render(<BottomNavigation items={disabled} value="search" onChange={onChange} />);
        await userEvent.click(screen.getByText("Home"));
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("BottomNavigation — icons and badges", () => {
    it("renders an item icon and badge", () => {
        render(
            <BottomNavigation
                value="home"
                onChange={() => undefined}
                items={[
                    {
                        key: "home",
                        label: "Início",
                        icon: <span data-testid="nav-icon">*</span>,
                        badge: 7,
                    },
                ]}
            />,
        );
        expect(screen.getByTestId("nav-icon")).toBeInTheDocument();
        expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("renders an item with href as a real link", () => {
        render(
            <BottomNavigation
                items={[{ key: "patients", label: "Pacientes", href: "/pacientes" }]}
                value="patients"
            />,
        );
        const link = screen.getByRole("link", { name: "Pacientes" });
        expect(link).toHaveAttribute("href", "/pacientes");
        expect(link).toHaveAttribute("aria-current", "page");
    });

    it("routes a plain click through onChange without following the href", async () => {
        const onChange = vi.fn();
        render(
            <BottomNavigation
                items={[{ key: "patients", label: "Pacientes", href: "/pacientes" }]}
                onChange={onChange}
            />,
        );
        const link = screen.getByRole("link", { name: "Pacientes" });
        const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
        link.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(true);
        expect(onChange).toHaveBeenCalledWith("patients");
    });

    it("leaves a ctrl-click with the browser and does not fire onChange", () => {
        const onChange = vi.fn();
        render(
            <BottomNavigation
                items={[{ key: "patients", label: "Pacientes", href: "/pacientes" }]}
                onChange={onChange}
            />,
        );
        const click = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            button: 0,
            ctrlKey: true,
        });
        screen.getByRole("link", { name: "Pacientes" }).dispatchEvent(click);
        expect(click.defaultPrevented).toBe(false);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("keeps a disabled item with href a disabled button", () => {
        render(
            <BottomNavigation
                items={[{ key: "x", label: "Relatórios", href: "/relatorios", disabled: true }]}
            />,
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByRole("button", { name: "Relatórios" })).toBeDisabled();
    });

    it("renders a javascript: href as a button", () => {
        render(
            <BottomNavigation items={[{ key: "x", label: "Mal", href: "javascript:alert(1)" }]} />,
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByRole("button", { name: "Mal" })).toBeInTheDocument();
    });

    it("lights the longest href covering the route with match=route", () => {
        const routeItems = [
            { key: "home", label: "Painel", href: "/" },
            { key: "patients", label: "Pacientes", href: "/pacientes" },
            { key: "settings", label: "Ajustes", href: "/configuracoes" },
        ];
        render(<BottomNavigation items={routeItems} match="route" value="/pacientes/42?tab=2" />);
        expect(screen.getByRole("link", { name: "Pacientes" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("link", { name: "Painel" })).not.toHaveAttribute("aria-current");
    });

    it("lights nothing when no href covers the route", () => {
        render(
            <BottomNavigation
                items={[{ key: "patients", label: "Pacientes", href: "/pacientes" }]}
                match="route"
                value="/pacientes-admin"
            />,
        );
        expect(screen.getByRole("link", { name: "Pacientes" })).not.toHaveAttribute("aria-current");
    });

    it("matches the route against the key when an item has no href", () => {
        render(
            <BottomNavigation
                items={[{ key: "/agenda", label: "Agenda" }]}
                match="route"
                value="/agenda/hoje"
            />,
        );
        expect(screen.getByRole("button", { name: "Agenda" })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});
