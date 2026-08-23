import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RatingStars } from "./RatingStars";

describe("RatingStars", () => {
    it("renders max stars", () => {
        render(<RatingStars value={0} max={5} />);
        expect(screen.getAllByRole("radio")).toHaveLength(5);
    });

    it("calls onChange when star clicked", async () => {
        const onChange = vi.fn();
        render(<RatingStars value={0} onChange={onChange} />);
        await userEvent.click(screen.getAllByRole("radio")[2]);
        expect(onChange).toHaveBeenCalledWith(3);
    });

    it("readonly mode does not call onChange", async () => {
        const onChange = vi.fn();
        render(<RatingStars value={3} onChange={onChange} readonly />);
        await userEvent.click(screen.getAllByRole("radio")[0]);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("aria-checked reflects value", () => {
        render(<RatingStars value={3} />);
        const stars = screen.getAllByRole("radio");
        expect(stars[2]).toHaveAttribute("aria-checked", "true");
        expect(stars[0]).toHaveAttribute("aria-checked", "false");
    });

    it("previews on hover and drops the preview when the pointer leaves", async () => {
        const user = userEvent.setup();
        render(<RatingStars value={0} onChange={() => {}} max={5} />);
        const stars = screen.getAllByRole("radio");
        const third = stars[2];

        await user.hover(third);
        expect(third.className).toMatch(/filled/);

        await user.unhover(third);
        await user.unhover(screen.getByRole("radiogroup"));

        expect(screen.getAllByRole("radio")[2].className).not.toMatch(/filled/);
    });
});
