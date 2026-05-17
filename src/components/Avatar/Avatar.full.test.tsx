import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar — full", () => {
    it("renders ? when name is empty", () => {
        render(<Avatar name="" />);
        expect(screen.getByText("?")).toBeInTheDocument();
    });

    it("falls back to initials when image errors", () => {
        const { container } = render(<Avatar src="https://bad/x.png" name="Maria Silva" />);
        const img = container.querySelector("img");
        fireEvent.error(img as HTMLImageElement);
        expect(screen.getByText("MS")).toBeInTheDocument();
    });

    it("becomes a button when onClick is provided", async () => {
        const onClick = vi.fn();
        render(<Avatar name="X" onClick={onClick} />);
        const role = screen.getByRole("button");
        await userEvent.click(role);
        expect(onClick).toHaveBeenCalled();
    });

    it("activates onClick via Enter/Space", () => {
        const onClick = vi.fn();
        render(<Avatar name="X" onClick={onClick} />);
        const role = screen.getByRole("button");
        fireEvent.keyDown(role, { key: "Enter" });
        fireEvent.keyDown(role, { key: " " });
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("renders status dot when status is set", () => {
        const { container } = render(<Avatar name="X" status="online" />);
        const dot = container.querySelector("[aria-hidden]");
        expect(dot).not.toBeNull();
    });
});
