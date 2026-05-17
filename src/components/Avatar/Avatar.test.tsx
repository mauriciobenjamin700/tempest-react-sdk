import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
    it("renders initials from name when src is absent", () => {
        render(<Avatar name="Maria Silva" />);
        expect(screen.getByText("MS")).toBeInTheDocument();
    });

    it("uses single name fallback (first two letters)", () => {
        render(<Avatar name="Madonna" />);
        expect(screen.getByText("Ma")).toBeInTheDocument();
    });

    it("renders image when src is provided", () => {
        render(<Avatar src="https://x/y.png" name="Carlos" alt="Carlos avatar" />);
        const img = screen.getByRole("img");
        expect(img).toHaveAttribute("src", "https://x/y.png");
    });
});
