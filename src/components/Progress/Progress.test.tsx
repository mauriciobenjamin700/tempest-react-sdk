import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "./Progress";

describe("Progress", () => {
    it("sets aria-valuenow when determinate", () => {
        render(<Progress value={42} />);
        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-valuenow", "42");
    });

    it("omits aria-valuenow when indeterminate", () => {
        render(<Progress indeterminate />);
        const bar = screen.getByRole("progressbar");
        expect(bar).not.toHaveAttribute("aria-valuenow");
    });

    it("renders the percentage label when showLabel", () => {
        render(<Progress value={50} showLabel />);
        expect(screen.getByText("50%")).toBeInTheDocument();
    });
});
