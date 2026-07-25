import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
    it("renders label + helper", () => {
        render(<Input label="Email" helperText="Required" />);
        expect(screen.getByText("Email")).toBeInTheDocument();
        expect(screen.getByText("Required")).toBeInTheDocument();
    });

    it("renders error and sets aria-invalid", () => {
        render(<Input label="Email" error="Invalid" />);
        const input = screen.getByRole("textbox");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("Invalid")).toBeInTheDocument();
    });
});

describe("Input — icons, required marker and sizes", () => {
    it("renders left and right icons and marks the input accordingly", () => {
        const { container } = render(
            <Input
                label="Busca"
                leftIcon={<span data-testid="left">L</span>}
                rightIcon={<span data-testid="right">R</span>}
            />,
        );
        expect(screen.getByTestId("left")).toBeInTheDocument();
        expect(screen.getByTestId("right")).toBeInTheDocument();

        const input = container.querySelector("input") as HTMLInputElement;
        expect(input.className).toContain("hasLeftIcon");
        expect(input.className).toContain("hasRightIcon");
    });

    it("omits the icon classes when no icons are passed", () => {
        const { container } = render(<Input label="Simples" />);
        const input = container.querySelector("input") as HTMLInputElement;
        expect(input.className).not.toContain("hasLeftIcon");
        expect(input.className).not.toContain("hasRightIcon");
    });

    it("shows the required marker and sets the attribute", () => {
        const { container } = render(<Input label="Nome" required />);
        expect(container.querySelector("[class*='required']")).not.toBeNull();
        expect(container.querySelector("input")).toBeRequired();
    });

    it("omits the required marker by default", () => {
        const { container } = render(<Input label="Nome" />);
        expect(container.querySelector("[class*='required']")).toBeNull();
    });

    it.each([
        ["sm", "sizeSm"],
        ["md", "sizeMd"],
        ["lg", "sizeLg"],
    ] as const)("maps size=%s to %s", (size, expected) => {
        const { container } = render(<Input label="x" size={size} />);
        expect((container.querySelector("input") as HTMLInputElement).className).toContain(
            expected,
        );
    });
});
