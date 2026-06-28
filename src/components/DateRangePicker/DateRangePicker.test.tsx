import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateRangePicker, type DateRange } from "./DateRangePicker";

function Harness({ initial }: { initial?: DateRange }) {
    const [range, setRange] = useState<DateRange>(initial ?? { start: null, end: null });
    return (
        <>
            <DateRangePicker
                value={range}
                onChange={setRange}
                numberOfMonths={1}
                defaultMonth={new Date(2026, 5, 1)}
            />
            <output data-testid="state">
                {range.start ? range.start.getDate() : "-"}…{range.end ? range.end.getDate() : "-"}
            </output>
        </>
    );
}

const day = (n: number, month = "June") =>
    screen.getByRole("gridcell", { name: `${month} ${n}, 2026` });

describe("DateRangePicker", () => {
    it("picks start then end", () => {
        render(<Harness />);
        fireEvent.click(day(10));
        expect(screen.getByTestId("state")).toHaveTextContent("10…-");
        fireEvent.click(day(20));
        expect(screen.getByTestId("state")).toHaveTextContent("10…20");
    });

    it("auto-orders when the second click is earlier than the first", () => {
        render(<Harness />);
        fireEvent.click(day(20));
        fireEvent.click(day(10));
        expect(screen.getByTestId("state")).toHaveTextContent("10…20");
    });

    it("a third click starts a new range", () => {
        render(<Harness initial={{ start: new Date(2026, 5, 10), end: new Date(2026, 5, 20) }} />);
        fireEvent.click(day(5));
        expect(screen.getByTestId("state")).toHaveTextContent("5…-");
    });

    it("renders multiple months", () => {
        render(
            <DateRangePicker
                value={{ start: null, end: null }}
                onChange={() => {}}
                numberOfMonths={2}
                defaultMonth={new Date(2026, 5, 1)}
            />,
        );
        expect(screen.getByText("June 2026")).toBeInTheDocument();
        expect(screen.getByText("July 2026")).toBeInTheDocument();
    });
});
