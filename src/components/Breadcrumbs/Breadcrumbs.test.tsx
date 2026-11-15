import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs", () => {
    it("renders items and marks the last as current", () => {
        render(<Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Settings" }]} />);
        expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
        expect(screen.getByText("Settings")).toHaveAttribute("aria-current", "page");
    });

    it("routes a plain click through onClick without letting the browser follow the href", () => {
        const onClick = vi.fn();
        render(
            <Breadcrumbs items={[{ label: "Home", href: "/", onClick }, { label: "Settings" }]} />,
        );
        expect(fireEvent.click(screen.getByRole("link", { name: "Home" }))).toBe(false);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("leaves a ctrl-click to the browser so the crumb opens in a new tab", () => {
        const onClick = vi.fn();
        render(
            <Breadcrumbs items={[{ label: "Home", href: "/", onClick }, { label: "Settings" }]} />,
        );
        expect(fireEvent.click(screen.getByRole("link", { name: "Home" }), { ctrlKey: true })).toBe(
            true,
        );
        expect(onClick).not.toHaveBeenCalled();
    });

    it("calls onClick on a crumb without href", () => {
        const onClick = vi.fn();
        render(<Breadcrumbs items={[{ label: "Home", onClick }, { label: "Settings" }]} />);
        fireEvent.click(screen.getByText("Home"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
