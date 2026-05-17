import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Alert } from "./Alert";

describe("Alert", () => {
    it("renders title + description", () => {
        render(<Alert title="Heads up" description="Saved successfully." />);
        expect(screen.getByText("Heads up")).toBeInTheDocument();
        expect(screen.getByText("Saved successfully.")).toBeInTheDocument();
    });

    it("renders children when provided", () => {
        render(<Alert>body</Alert>);
        expect(screen.getByText("body")).toBeInTheDocument();
    });

    it("calls onClose when dismiss button clicked", async () => {
        const onClose = vi.fn();
        render(<Alert title="x" onClose={onClose} closeLabel="Close" />);
        await userEvent.click(screen.getByRole("button", { name: /close/i }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("applies variant class", () => {
        const { container } = render(<Alert variant="danger">err</Alert>);
        expect(container.firstChild?.constructor.name).toBe("HTMLDivElement");
        const div = container.querySelector("div");
        expect(div?.className).toContain("danger");
    });

    it("has alert role", () => {
        render(<Alert>err</Alert>);
        expect(screen.getByRole("alert")).toBeInTheDocument();
    });
});
