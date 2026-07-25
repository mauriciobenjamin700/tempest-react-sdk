import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
    it("renders label and description", () => {
        render(<Checkbox label="Terms" description="Read first" />);
        expect(screen.getByText("Terms")).toBeInTheDocument();
        expect(screen.getByText("Read first")).toBeInTheDocument();
    });

    it("toggles when clicked", async () => {
        const onChange = vi.fn();
        render(<Checkbox label="x" onChange={onChange} />);
        await userEvent.click(screen.getByRole("checkbox"));
        expect(onChange).toHaveBeenCalled();
    });

    it("applies indeterminate state", () => {
        render(<Checkbox label="x" indeterminate />);
        const input = screen.getByRole("checkbox") as HTMLInputElement;
        expect(input.indeterminate).toBe(true);
    });
});

describe("Checkbox — ref forwarding, indeterminate and description", () => {
    it("accepts a callback ref", () => {
        const seen: (HTMLInputElement | null)[] = [];
        render(
            <Checkbox
                label="x"
                ref={(node) => {
                    seen.push(node);
                }}
            />,
        );
        expect(seen[0]).toBeInstanceOf(HTMLInputElement);
    });

    it("accepts an object ref", () => {
        const ref = createRef<HTMLInputElement>();
        render(<Checkbox label="x" ref={ref} />);
        expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it("renders the dash icon while indeterminate", () => {
        const { container } = render(<Checkbox label="x" indeterminate />);
        expect(container.querySelector("svg path")?.getAttribute("d")).toContain("M5 12h14");
    });

    it("renders a description next to the label", () => {
        render(<Checkbox label="Aceito" description="Você pode mudar depois" />);
        expect(screen.getByText("Você pode mudar depois")).toBeInTheDocument();
    });

    it("renders with neither label nor description", () => {
        const { container } = render(<Checkbox aria-label="sem rótulo" />);
        expect(container.querySelector("[class*='labelWrap']")).toBeNull();
    });
});
