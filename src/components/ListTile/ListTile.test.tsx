import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ListTile } from "./ListTile";

describe("ListTile", () => {
    it("renders title, subtitle, leading and trailing", () => {
        render(
            <ListTile
                title="Maria Silva"
                subtitle="maria@example.com"
                leading={<span>L</span>}
                trailing={<span>T</span>}
            />,
        );
        expect(screen.getByText("Maria Silva")).toBeInTheDocument();
        expect(screen.getByText("maria@example.com")).toBeInTheDocument();
        expect(screen.getByText("L")).toBeInTheDocument();
        expect(screen.getByText("T")).toBeInTheDocument();
    });

    it("renders as a div when onClick is not provided", () => {
        const { container } = render(<ListTile title="Static" />);
        expect(container.querySelector("button")).toBeNull();
    });

    it("renders as a button only when onClick is provided", () => {
        render(<ListTile title="Clickable" onClick={() => {}} />);
        expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("fires onClick when clicked", () => {
        const onClick = vi.fn();
        render(<ListTile title="Clickable" onClick={onClick} />);
        fireEvent.click(screen.getByRole("button"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not fire onClick when disabled", () => {
        const onClick = vi.fn();
        render(<ListTile title="Disabled" onClick={onClick} disabled />);
        const button = screen.getByRole("button");
        expect(button).toBeDisabled();
        fireEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("exposes aria-pressed when selected and interactive", () => {
        render(<ListTile title="Selected" onClick={() => {}} selected />);
        expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    });
});
