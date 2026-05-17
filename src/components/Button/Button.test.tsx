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
});
