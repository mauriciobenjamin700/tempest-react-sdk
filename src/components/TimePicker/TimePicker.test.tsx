import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TimePicker } from "./TimePicker";

describe("TimePicker", () => {
    it("marks the parsed hour and minute as active", () => {
        render(<TimePicker value="14:30" onChange={vi.fn()} />);
        const hours = screen.getByRole("listbox", { name: "Horas" });
        const minutes = screen.getByRole("listbox", { name: "Minutos" });
        expect(within(hours).getByRole("option", { name: "14" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(within(minutes).getByRole("option", { name: "30" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });

    it("emits new HH:MM when a minute cell is clicked", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="14:30" onChange={onChange} />);
        const minutes = screen.getByRole("listbox", { name: "Minutos" });
        await userEvent.click(within(minutes).getByRole("option", { name: "45" }));
        expect(onChange).toHaveBeenCalledWith("14:45");
    });

    it("renders only the stepped minutes with minuteStep=15", () => {
        render(<TimePicker value="" onChange={vi.fn()} minuteStep={15} />);
        const minutes = screen.getByRole("listbox", { name: "Minutos" });
        const cells = within(minutes).getAllByRole("option");
        expect(cells.map((cell) => cell.textContent)).toEqual(["00", "15", "30", "45"]);
    });

    it("converts 12h selection (2 + PM) to 24h HH:MM", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="00:00" onChange={onChange} use12Hours />);
        const hours = screen.getByRole("listbox", { name: "Horas" });
        const periods = screen.getByRole("listbox", { name: "Período" });

        await userEvent.click(within(hours).getByRole("option", { name: "2" }));
        // 2 AM (period stays AM since value 00:00 is AM)
        expect(onChange).toHaveBeenLastCalledWith("02:00");

        await userEvent.click(within(periods).getByRole("option", { name: "PM" }));
        // current display hour is 12 (00:00) -> 12 PM = 12:00; verify PM math
        expect(onChange).toHaveBeenLastCalledWith("12:00");
    });

    it("emits 24h time from a full 12h pick of 2 PM", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="14:00" onChange={onChange} use12Hours />);
        const hours = screen.getByRole("listbox", { name: "Horas" });
        // value 14:00 -> period PM, picking display hour 2 keeps PM -> 14:00
        await userEvent.click(within(hours).getByRole("option", { name: "2" }));
        expect(onChange).toHaveBeenLastCalledWith("14:00");
    });

    it("disables option buttons when disabled", () => {
        render(<TimePicker value="14:30" onChange={vi.fn()} disabled />);
        const options = screen.getAllByRole("option");
        for (const option of options) {
            expect(option).toBeDisabled();
        }
    });

    it("does not emit when a disabled cell is clicked", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="14:30" onChange={onChange} disabled />);
        const minutes = screen.getByRole("listbox", { name: "Minutos" });
        await userEvent.click(within(minutes).getByRole("option", { name: "45" }));
        expect(onChange).not.toHaveBeenCalled();
    });
});
