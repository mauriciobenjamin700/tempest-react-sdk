import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
    it("marks current step via aria-current", () => {
        render(<Stepper current={1} steps={[{ label: "A" }, { label: "B" }, { label: "C" }]} />);
        const items = screen.getAllByRole("listitem");
        expect(items[1]).toHaveAttribute("aria-current", "step");
        expect(items[0]).not.toHaveAttribute("aria-current");
    });

    it("renders a step description", () => {
        render(<Stepper current={0} steps={[{ label: "A", description: "primeiro" }]} />);
        expect(screen.getByText("primeiro")).toBeInTheDocument();
    });

    it("stays read-only without onStepClick", () => {
        render(<Stepper current={0} steps={[{ label: "A" }, { label: "B" }]} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders each step as a button when onStepClick is given", async () => {
        const onStepClick = vi.fn();
        render(
            <Stepper
                current={0}
                steps={[{ label: "A" }, { label: "B", description: "segundo" }]}
                onStepClick={onStepClick}
            />,
        );

        expect(screen.getAllByRole("button")).toHaveLength(2);
        expect(screen.getByText("segundo")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /B/ }));
        expect(onStepClick).toHaveBeenCalledWith(1);
    });

    it("marks the current trigger with aria-current", () => {
        render(
            <Stepper current={1} steps={[{ label: "A" }, { label: "B" }]} onStepClick={vi.fn()} />,
        );

        expect(screen.getByRole("button", { name: /B/ })).toHaveAttribute("aria-current", "step");
        expect(screen.getByRole("button", { name: /A/ })).not.toHaveAttribute("aria-current");
    });

    it("renders vertically on request", () => {
        const { container } = render(
            <Stepper current={0} orientation="vertical" steps={[{ label: "A" }, { label: "B" }]} />,
        );
        expect(container.querySelector("ol")?.className).toMatch(/vertical/);
    });
});
