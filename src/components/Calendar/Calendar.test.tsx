import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Calendar } from "./Calendar";

describe("Calendar", () => {
    it("renders a 6x7 grid of day cells", () => {
        render(<Calendar month={new Date(2026, 5, 1)} />);
        const grid = screen.getByRole("grid");
        expect(within(grid).getAllByRole("gridcell")).toHaveLength(42);
    });

    it("shows the month and year in the header", () => {
        render(<Calendar month={new Date(2026, 5, 1)} />);
        expect(screen.getByText("June 2026")).toBeInTheDocument();
    });

    it("calls onChange with the clicked date", () => {
        const onChange = vi.fn();
        render(<Calendar month={new Date(2026, 5, 1)} onChange={onChange} />);
        const grid = screen.getByRole("grid");
        // June 1, 2026 is a Monday; with Sunday start there is 1 leading cell.
        fireEvent.click(within(grid).getByText("15"));
        expect(onChange).toHaveBeenCalledTimes(1);
        const arg = onChange.mock.calls[0][0] as Date;
        expect(arg.getFullYear()).toBe(2026);
        expect(arg.getMonth()).toBe(5);
        expect(arg.getDate()).toBe(15);
    });

    it("prev/next changes the displayed month (uncontrolled)", () => {
        render(<Calendar defaultValue={new Date(2026, 5, 10)} />);
        expect(screen.getByText("June 2026")).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText("Next month"));
        expect(screen.getByText("July 2026")).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText("Previous month"));
        fireEvent.click(screen.getByLabelText("Previous month"));
        expect(screen.getByText("May 2026")).toBeInTheDocument();
    });

    it("notifies onMonthChange when controlled", () => {
        const onMonthChange = vi.fn();
        render(<Calendar month={new Date(2026, 5, 1)} onMonthChange={onMonthChange} />);
        fireEvent.click(screen.getByLabelText("Next month"));
        expect(onMonthChange).toHaveBeenCalledTimes(1);
        const next = onMonthChange.mock.calls[0][0] as Date;
        expect(next.getMonth()).toBe(6);
    });

    it("marks the selected day with aria-pressed", () => {
        render(<Calendar month={new Date(2026, 5, 1)} value={new Date(2026, 5, 12)} />);
        const grid = screen.getByRole("grid");
        const selected = within(grid).getByText("12");
        expect(selected).toHaveAttribute("aria-pressed", "true");
        expect(selected).toHaveAttribute("aria-selected", "true");
    });

    it("disables days outside the min/max range", () => {
        render(
            <Calendar
                month={new Date(2026, 5, 1)}
                minDate={new Date(2026, 5, 10)}
                maxDate={new Date(2026, 5, 20)}
            />,
        );
        const grid = screen.getByRole("grid");
        const inMonth = within(grid)
            .getAllByRole("gridcell")
            .filter((cell) => !cell.className.includes("outside"));
        // inMonth[0] is June 1 ... inMonth[n] is June (n+1).
        expect(inMonth[4]).toBeDisabled(); // June 5
        expect(inMonth[14]).not.toBeDisabled(); // June 15
        expect(inMonth[24]).toBeDisabled(); // June 25
    });

    it("respects weekStartsOn for the weekday header", () => {
        render(<Calendar month={new Date(2026, 5, 1)} weekStartsOn={1} />);
        const headers = screen.getAllByRole("columnheader");
        expect(headers[0]).toHaveTextContent("Mon");
    });

    it("forwards className", () => {
        const { container } = render(<Calendar month={new Date(2026, 5, 1)} className="custom" />);
        expect((container.firstChild as HTMLElement).className).toContain("custom");
    });
});

describe("Calendar — keyboard grid navigation", () => {
    function dayButtons(): HTMLButtonElement[] {
        return Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-day]"));
    }

    it("moves focus with the four arrow keys", () => {
        render(<Calendar defaultMonth={new Date(2026, 4, 1)} />);
        const cells = dayButtons();
        cells[10].focus();

        fireEvent.keyDown(cells[10], { key: "ArrowRight" });
        expect(document.activeElement).toBe(dayButtons()[11]);

        fireEvent.keyDown(dayButtons()[11], { key: "ArrowLeft" });
        expect(document.activeElement).toBe(dayButtons()[10]);

        fireEvent.keyDown(dayButtons()[10], { key: "ArrowDown" });
        expect(document.activeElement).toBe(dayButtons()[17]);

        fireEvent.keyDown(dayButtons()[17], { key: "ArrowUp" });
        expect(document.activeElement).toBe(dayButtons()[10]);
    });

    it("clamps navigation at both ends of the grid", () => {
        render(<Calendar defaultMonth={new Date(2026, 4, 1)} />);
        const cells = dayButtons();

        cells[0].focus();
        fireEvent.keyDown(cells[0], { key: "ArrowUp" });
        expect(document.activeElement).toBe(dayButtons()[0]);

        const last = dayButtons().length - 1;
        dayButtons()[last].focus();
        fireEvent.keyDown(dayButtons()[last], { key: "ArrowDown" });
        expect(document.activeElement).toBe(dayButtons()[last]);
    });

    it("selects the focused day with Enter and Space", () => {
        const onChange = vi.fn();
        render(<Calendar defaultMonth={new Date(2026, 4, 1)} onChange={onChange} />);
        const cells = dayButtons();

        fireEvent.keyDown(cells[10], { key: "Enter" });
        fireEvent.keyDown(cells[11], { key: " " });
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("ignores other keys", () => {
        const onChange = vi.fn();
        render(<Calendar defaultMonth={new Date(2026, 4, 1)} onChange={onChange} />);
        fireEvent.keyDown(dayButtons()[10], { key: "Tab" });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("refuses a keyboard selection outside the allowed range", () => {
        const onChange = vi.fn();
        render(
            <Calendar
                defaultMonth={new Date(2026, 4, 1)}
                minDate={new Date(2026, 4, 15)}
                onChange={onChange}
            />,
        );
        const early = dayButtons().find(
            (button) => button.getAttribute("aria-label")?.includes("May 5") ?? false,
        );
        if (early) {
            fireEvent.keyDown(early, { key: "Enter" });
            expect(onChange).not.toHaveBeenCalled();
        }
    });

    it("tracks selection internally when uncontrolled", () => {
        render(<Calendar defaultMonth={new Date(2026, 4, 1)} />);
        const target = dayButtons()[15];
        fireEvent.click(target);
        expect(target).toHaveAttribute("aria-pressed", "true");
    });
});
