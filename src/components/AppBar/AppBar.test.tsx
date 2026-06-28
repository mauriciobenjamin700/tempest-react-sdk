import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppBar } from "./AppBar";

describe("AppBar", () => {
    it("renders the title as a heading", () => {
        render(<AppBar title="Profile" />);
        expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    });

    it("omits the heading when no title", () => {
        render(<AppBar actions={<button>act</button>} />);
        expect(screen.queryByRole("heading")).toBeNull();
    });

    it("renders a back button only when showBack is set", () => {
        const { rerender } = render(<AppBar title="x" />);
        expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
        rerender(<AppBar title="x" showBack />);
        expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
    });

    it("calls onBack when the back button is clicked", async () => {
        const onBack = vi.fn();
        render(<AppBar title="x" showBack onBack={onBack} />);
        await userEvent.click(screen.getByRole("button", { name: "Go back" }));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("falls back to history.back() without onBack", async () => {
        const spy = vi.spyOn(window.history, "back").mockImplementation(() => {});
        render(<AppBar title="x" showBack />);
        await userEvent.click(screen.getByRole("button", { name: "Go back" }));
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it("uses a custom back label", () => {
        render(<AppBar title="x" showBack backLabel="Voltar" />);
        expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    });

    it("renders brand and actions slots", () => {
        render(<AppBar brand="Tempest" actions={<button>menu</button>} />);
        expect(screen.getByText("Tempest")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "menu" })).toBeInTheDocument();
    });

    it("leading overrides the auto back button and brand", () => {
        render(<AppBar title="x" showBack brand="B" leading={<span>custom</span>} />);
        expect(screen.getByText("custom")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
        expect(screen.queryByText("B")).toBeNull();
    });

    it("forwards className and rest props to the header", () => {
        const { container } = render(<AppBar title="x" className="mine" data-testid="bar" />);
        const header = container.querySelector("header");
        expect(header).toHaveClass("mine");
        expect(header).toHaveAttribute("data-testid", "bar");
    });
});
