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

describe("TimePicker — parsing and 12h conversion", () => {
    it.each(["", "abc", "99:00", "10:99", "-1:00", "1030"])(
        "treats %s as no selection",
        (value) => {
            const { container } = render(<TimePicker value={value} onChange={() => {}} />);
            expect(container.querySelectorAll("[aria-selected='true']").length).toBe(0);
        },
    );

    it("accepts a single-digit hour and minute", () => {
        render(<TimePicker value="9:5" onChange={() => {}} />);
        const hours = screen.getByRole("listbox", { name: "Horas" });
        expect(
            within(hours).getByRole("option", { name: "09", selected: true }),
        ).toBeInTheDocument();
    });

    it("shows midnight as 12 AM and noon as 12 PM in 12h mode", () => {
        const { unmount } = render(<TimePicker value="00:00" use12Hours onChange={() => {}} />);
        const hours = screen.getByRole("listbox", { name: "Horas" });
        expect(
            within(hours).getByRole("option", { name: "12", selected: true }),
        ).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "AM", selected: true })).toBeInTheDocument();
        unmount();

        render(<TimePicker value="12:00" use12Hours onChange={() => {}} />);
        expect(screen.getByRole("option", { name: "PM", selected: true })).toBeInTheDocument();
    });

    it("emits midnight when 12 AM is picked", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="13:30" use12Hours onChange={onChange} />);
        await userEvent.click(screen.getByRole("option", { name: "AM" }));
        expect(onChange).toHaveBeenCalledWith("01:30");
    });

    it("keeps the minute when only the hour changes", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="08:45" onChange={onChange} />);
        // "10" exists in both the hour and minute columns — scope to the hours listbox.
        const hours = screen.getByRole("listbox", { name: "Horas" });
        await userEvent.click(within(hours).getByRole("option", { name: "10" }));
        expect(onChange).toHaveBeenCalledWith("10:45");
    });

    it("defaults the missing half of an empty value", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="" onChange={onChange} />);
        const hours = screen.getByRole("listbox", { name: "Horas" });
        await userEvent.click(within(hours).getByRole("option", { name: "07" }));
        expect(onChange).toHaveBeenCalledWith("07:00");
    });
});

describe("TimePicker — column generation and defaults", () => {
    it("lists 24 hour cells in 24h mode and 12 in 12h mode", () => {
        const { unmount } = render(<TimePicker value="" onChange={() => {}} />);
        expect(
            within(screen.getByRole("listbox", { name: "Horas" })).getAllByRole("option"),
        ).toHaveLength(24);
        unmount();

        render(<TimePicker value="" use12Hours onChange={() => {}} />);
        expect(
            within(screen.getByRole("listbox", { name: "Horas" })).getAllByRole("option"),
        ).toHaveLength(12);
    });

    it("falls back to a 1-minute step for a non-positive minuteStep", () => {
        render(<TimePicker value="" minuteStep={0} onChange={() => {}} />);
        expect(
            within(screen.getByRole("listbox", { name: "Minutos" })).getAllByRole("option"),
        ).toHaveLength(60);
    });

    it("defaults an empty 12h value to midnight when a minute is picked", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="" use12Hours onChange={onChange} />);
        const minutes = screen.getByRole("listbox", { name: "Minutos" });
        await userEvent.click(within(minutes).getByRole("option", { name: "30" }));
        expect(onChange).toHaveBeenCalledWith("00:30");
    });

    it("defaults the hour to 12 when only the period is picked", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="" use12Hours onChange={onChange} />);
        await userEvent.click(screen.getByRole("option", { name: "PM" }));
        expect(onChange).toHaveBeenCalledWith("12:00");
    });

    it("keeps the PM period when the hour changes in the afternoon", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="15:20" use12Hours onChange={onChange} />);
        const hours = screen.getByRole("listbox", { name: "Horas" });
        await userEvent.click(within(hours).getByRole("option", { name: "5" }));
        expect(onChange).toHaveBeenCalledWith("17:20");
    });

    it("does not emit a period change while disabled", async () => {
        const onChange = vi.fn();
        render(<TimePicker value="10:00" use12Hours disabled onChange={onChange} />);
        await userEvent.click(screen.getByRole("option", { name: "PM" }));
        expect(onChange).not.toHaveBeenCalled();
    });

    it("renders the label and helper text", () => {
        render(<TimePicker value="" onChange={() => {}} label="Horário" helperText="fuso local" />);
        expect(screen.getByText("Horário")).toBeInTheDocument();
        expect(screen.getByText("fuso local")).toBeInTheDocument();
    });
});
