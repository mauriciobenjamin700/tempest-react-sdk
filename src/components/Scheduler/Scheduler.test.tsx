import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Scheduler } from "./Scheduler";
import type { SchedulerEvent } from "./scheduler-layout";

/** 2026-07-27, a Monday. Every test pins `now` so nothing depends on the clock. */
const NOW = new Date(2026, 6, 27, 14, 0);

/** An event on the anchor day (or `dayOffset` days later). */
function at(id: string, fromHour: number, toHour: number, dayOffset = 0): SchedulerEvent {
    return {
        id,
        title: id,
        start: new Date(2026, 6, 27 + dayOffset, fromHour, 0),
        end: new Date(2026, 6, 27 + dayOffset, toHour, 0),
    };
}

function renderScheduler(props: Partial<React.ComponentProps<typeof Scheduler>> = {}) {
    return render(<Scheduler events={[at("Reunião", 9, 10)]} anchor={NOW} now={NOW} {...props} />);
}

/**
 * The day columns.
 *
 * Each is a labelled group, not a `gridcell`: see the note in the component on why
 * `role="grid"` cannot describe this layout.
 */
function dayColumns() {
    return screen.getAllByRole("group").filter((el) => el.className.includes("dayColumn"));
}

/** Inline percentage styles of the event buttons, keyed by accessible name. */
function eventBoxes(container: HTMLElement) {
    return [...container.querySelectorAll("button")]
        .filter((b) => b.style.top !== "")
        .map((b) => ({
            name: b.textContent,
            top: b.style.top,
            height: b.style.height,
            left: b.style.left,
            width: b.style.width,
            column: b.style.gridColumn,
        }));
}

describe("Scheduler — structure", () => {
    it("renders one column per requested day", () => {
        renderScheduler({ days: 7 });
        expect(dayColumns()).toHaveLength(7);
    });

    it("renders a single column in day view", () => {
        renderScheduler({ days: 1 });
        expect(dayColumns()).toHaveLength(1);
    });

    it("labels each day column", () => {
        renderScheduler({ days: 2 });
        const cells = dayColumns();
        expect(cells[0]).toHaveAccessibleName();
        expect(cells[0].getAttribute("aria-label")).not.toBe(cells[1].getAttribute("aria-label"));
    });

    it("labels the hour gutter across the window only", () => {
        const { container } = renderScheduler({ startHour: 9, endHour: 12 });
        const labels = [...container.querySelectorAll("span")].filter((s) =>
            /^\d{2}:\d{2}$/.test(s.textContent ?? ""),
        );
        // 09, 10, 11, 12 in the gutter.
        expect(labels.length).toBeGreaterThanOrEqual(4);
    });
});

describe("Scheduler — events", () => {
    it("places an event by time, as a percentage of the window", () => {
        const { container } = renderScheduler({ startHour: 8, endHour: 20 });
        const [box] = eventBoxes(container);
        // 09:00 in an 8→20 window is one twelfth down; a one-hour event is 1/12 tall.
        expect(parseFloat(box.top)).toBeCloseTo(100 / 12, 1);
        expect(parseFloat(box.height)).toBeCloseTo(100 / 12, 1);
    });

    it("puts each event in its own day column", () => {
        const { container } = renderScheduler({
            days: 7,
            events: [at("mon", 9, 10), at("wed", 9, 10, 2)],
        });
        const boxes = eventBoxes(container);
        expect(boxes.find((b) => b.name?.includes("mon"))?.column).toBe("1");
        expect(boxes.find((b) => b.name?.includes("wed"))?.column).toBe("3");
    });

    it("splits overlapping events into side-by-side columns", () => {
        const { container } = renderScheduler({
            days: 1,
            events: [at("a", 9, 11), at("b", 10, 12)],
        });
        const boxes = eventBoxes(container);
        expect(boxes.map((b) => b.width)).toEqual(["50%", "50%"]);
        expect(new Set(boxes.map((b) => b.left))).toEqual(new Set(["0%", "50%"]));
    });

    it("leaves back-to-back events at full width", () => {
        const { container } = renderScheduler({
            days: 1,
            events: [at("a", 9, 10), at("b", 10, 11)],
        });
        expect(eventBoxes(container).map((b) => b.width)).toEqual(["100%", "100%"]);
    });

    it("shows the start time and title by default", () => {
        const { container } = renderScheduler({ events: [at("Consulta", 9, 30)] });
        // Scoped to the event: "09:00" also labels the hour gutter.
        const event = [...container.querySelectorAll("button")].find((b) => b.style.top !== "")!;
        expect(event).toHaveTextContent("Consulta");
        expect(event).toHaveTextContent("09:00");
    });

    it("renders custom event content", () => {
        renderScheduler({ renderEvent: (event) => <b>{`>> ${event.title}`}</b> });
        expect(screen.getByText(">> Reunião")).toBeInTheDocument();
    });

    it("omits an event outside the visible hours", () => {
        const { container } = renderScheduler({
            startHour: 12,
            endHour: 18,
            events: [at("early", 8, 9)],
        });
        expect(eventBoxes(container)).toHaveLength(0);
    });
});

describe("Scheduler — all-day lane", () => {
    const allDay: SchedulerEvent = {
        id: "trip",
        title: "Viagem",
        start: new Date(2026, 6, 28),
        end: new Date(2026, 6, 30),
        allDay: true,
    };

    it("renders an all-day event in its own lane, spanning its days", () => {
        renderScheduler({ days: 7, events: [allDay] });
        const button = screen.getByRole("button", { name: "Viagem" });
        expect(button.style.gridColumn).toBe("2 / span 2");
    });

    it("omits the lane entirely when there is nothing all-day", () => {
        renderScheduler({ events: [at("a", 9, 10)] });
        expect(screen.queryByText("Dia inteiro")).not.toBeInTheDocument();
    });

    it("keeps an all-day event out of the time grid", () => {
        const { container } = renderScheduler({ days: 7, events: [allDay] });
        expect(eventBoxes(container)).toHaveLength(0);
    });
});

describe("Scheduler — interaction", () => {
    it("calls onEventClick with the event", () => {
        const onEventClick = vi.fn();
        renderScheduler({ onEventClick });
        fireEvent.click(screen.getByRole("button", { name: /Reunião/ }));
        expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ id: "Reunião" }));
    });

    it("disables the event button when there is nothing to do", () => {
        renderScheduler();
        expect(screen.getByRole("button", { name: /Reunião/ })).toBeDisabled();
    });

    it("calls onSlotClick with the snapped instant", () => {
        const onSlotClick = vi.fn();
        renderScheduler({ days: 1, startHour: 8, endHour: 20, onSlotClick });
        const column = dayColumns()[0] as HTMLElement;
        vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
            top: 0,
            height: 1200,
        } as DOMRect);

        // Halfway down an 8→20 window is 14:00.
        fireEvent.click(column, { clientY: 600 });
        const [start] = onSlotClick.mock.calls[0];
        expect([start.getHours(), start.getMinutes()]).toEqual([14, 0]);
    });

    it("snaps to the requested granularity", () => {
        const onSlotClick = vi.fn();
        renderScheduler({
            days: 1,
            startHour: 8,
            endHour: 20,
            snapMinutes: 60,
            onSlotClick,
        });
        const column = dayColumns()[0] as HTMLElement;
        vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
            top: 0,
            height: 1200,
        } as DOMRect);

        // 14:20-ish must land on the hour.
        fireEvent.click(column, { clientY: 634 });
        const [start] = onSlotClick.mock.calls[0];
        expect(start.getMinutes()).toBe(0);
    });

    it("does not fire onSlotClick when the click landed on an event", () => {
        const onSlotClick = vi.fn();
        renderScheduler({ days: 1, onSlotClick, onEventClick: vi.fn() });
        fireEvent.click(screen.getByRole("button", { name: /Reunião/ }));
        expect(onSlotClick).not.toHaveBeenCalled();
    });

    it("clamps a click below the window to its last minute", () => {
        const onSlotClick = vi.fn();
        renderScheduler({ days: 1, startHour: 8, endHour: 20, onSlotClick });
        const column = dayColumns()[0] as HTMLElement;
        vi.spyOn(column, "getBoundingClientRect").mockReturnValue({
            top: 0,
            height: 1200,
        } as DOMRect);

        fireEvent.click(column, { clientY: 99_999 });
        const [start] = onSlotClick.mock.calls[0];
        expect(start.getHours()).toBe(20);
    });
});

describe("Scheduler — current time", () => {
    it("draws the line when today is in range", () => {
        renderScheduler({ days: 7 });
        expect(screen.getByTestId("scheduler-now")).toBeInTheDocument();
    });

    it("positions the line by the reference time", () => {
        renderScheduler({ days: 1, startHour: 8, endHour: 20 });
        // 14:00 in an 8→20 window is halfway.
        expect(parseFloat(screen.getByTestId("scheduler-now").style.top)).toBeCloseTo(50, 1);
    });

    it("omits the line when now is outside the visible hours", () => {
        renderScheduler({ startHour: 8, endHour: 12 });
        expect(screen.queryByTestId("scheduler-now")).not.toBeInTheDocument();
    });

    it("omits the line when today is not in the rendered range", () => {
        renderScheduler({ anchor: new Date(2026, 7, 10), days: 7 });
        expect(screen.queryByTestId("scheduler-now")).not.toBeInTheDocument();
    });

    it("omits the line when asked to", () => {
        renderScheduler({ showCurrentTime: false });
        expect(screen.queryByTestId("scheduler-now")).not.toBeInTheDocument();
    });

    it("does not start a timer when now is supplied", () => {
        const setInterval = vi.spyOn(globalThis, "setInterval");
        renderScheduler();
        expect(setInterval).not.toHaveBeenCalled();
        setInterval.mockRestore();
    });

    it("ticks on its own when now is not supplied", () => {
        vi.useFakeTimers();
        try {
            render(<Scheduler events={[]} anchor={NOW} />);
            expect(vi.getTimerCount()).toBeGreaterThan(0);
        } finally {
            vi.useRealTimers();
        }
    });
});
