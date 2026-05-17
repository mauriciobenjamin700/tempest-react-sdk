import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
    it("marks current step via aria-current", () => {
        render(<Stepper current={1} steps={[{ label: "A" }, { label: "B" }, { label: "C" }]} />);
        const items = screen.getAllByRole("listitem");
        expect(items[1]).toHaveAttribute("aria-current", "step");
        expect(items[0]).not.toHaveAttribute("aria-current");
    });
});
