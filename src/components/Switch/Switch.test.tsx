import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

describe("Switch", () => {
    it("has role=switch", () => {
        render(<Switch label="Notify" />);
        expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    it("toggles", async () => {
        const onChange = vi.fn();
        render(<Switch label="x" onChange={onChange} />);
        await userEvent.click(screen.getByRole("switch"));
        expect(onChange).toHaveBeenCalled();
    });
});
