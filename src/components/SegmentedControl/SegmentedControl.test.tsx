import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const options = [
    { value: "list", label: "List" },
    { value: "grid", label: "Grid" },
    { value: "map", label: "Map" },
];

describe("SegmentedControl", () => {
    it("renders all options", () => {
        render(<SegmentedControl options={options} value="list" onChange={() => {}} />);
        expect(screen.getByText("List")).toBeInTheDocument();
        expect(screen.getByText("Grid")).toBeInTheDocument();
        expect(screen.getByText("Map")).toBeInTheDocument();
    });

    it("marks the selected option with aria-checked", () => {
        render(<SegmentedControl options={options} value="grid" onChange={() => {}} />);
        expect(screen.getByText("Grid").closest("button")).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText("List").closest("button")).toHaveAttribute("aria-checked", "false");
    });

    it("fires onChange with the clicked value", async () => {
        const onChange = vi.fn();
        render(<SegmentedControl options={options} value="list" onChange={onChange} />);
        await userEvent.click(screen.getByText("Map"));
        expect(onChange).toHaveBeenCalledWith("map");
    });

    it("does not fire onChange for disabled options", async () => {
        const onChange = vi.fn();
        render(
            <SegmentedControl
                options={[options[0], { ...options[1], disabled: true }]}
                value="list"
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByText("Grid"));
        expect(onChange).not.toHaveBeenCalled();
    });
});
