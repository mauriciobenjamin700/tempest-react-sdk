import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverCard } from "./HoverCard";

describe("HoverCard", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows content after openDelay on mouseenter", () => {
        render(
            <HoverCard trigger={<button type="button">trigger</button>} openDelay={300}>
                <p>preview</p>
            </HoverCard>,
        );
        const root = screen.getByText("trigger").closest("span")?.parentElement;
        fireEvent.mouseEnter(root as HTMLElement);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("preview")).toBeInTheDocument();
    });

    it("hides content after closeDelay on mouseleave", () => {
        render(
            <HoverCard
                trigger={<button type="button">trigger</button>}
                openDelay={300}
                closeDelay={150}
            >
                <p>preview</p>
            </HoverCard>,
        );
        const root = screen.getByText("trigger").closest("span")?.parentElement as HTMLElement;
        fireEvent.mouseEnter(root);
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        fireEvent.mouseLeave(root);
        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens on focus and applies the placement class", () => {
        render(
            <HoverCard
                trigger={<button type="button">trigger</button>}
                openDelay={300}
                placement="top"
            >
                <p>preview</p>
            </HoverCard>,
        );
        const root = screen.getByText("trigger").closest("span")?.parentElement as HTMLElement;
        fireEvent.focus(root);
        act(() => {
            vi.advanceTimersByTime(300);
        });
        const card = screen.getByRole("dialog");
        expect(card).toBeInTheDocument();
        expect(card.className).toContain("top");
    });
});
