import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
    it("renders the label", () => {
        render(<Button>Save</Button>);
        expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });

    it("forwards onClick", async () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Click</Button>);
        await userEvent.click(screen.getByRole("button"));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("disables interaction when loading", async () => {
        const onClick = vi.fn();
        render(
            <Button loading onClick={onClick}>
                Loading
            </Button>,
        );
        const button = screen.getByRole("button");
        expect(button).toBeDisabled();
        await userEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("announces aria-busy while loading, as the docs have always promised", () => {
        const { rerender } = render(<Button loading>Salvando</Button>);
        expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
        rerender(<Button>Salvar</Button>);
        expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    });
});

describe("Button — fullWidth", () => {
    it("carries the fullWidth class", () => {
        render(<Button fullWidth>Salvar</Button>);
        expect(screen.getByRole("button", { name: "Salvar" }).className).toContain("fullWidth");
    });
});
