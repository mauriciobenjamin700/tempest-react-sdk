import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoverCard } from "./HoverCard";

afterEach(() => {
    vi.useRealTimers();
});

describe("HoverCard in a portal", () => {
    it("renders the card outside the trigger wrapper, so an overflow ancestor cannot clip it", () => {
        vi.useFakeTimers();
        render(
            <div style={{ overflow: "auto" }} data-testid="clip">
                <HoverCard trigger={<span>@ana</span>} openDelay={0}>
                    profile
                </HoverCard>
            </div>,
        );
        fireEvent.mouseEnter(screen.getByText("@ana"));
        act(() => {
            vi.runAllTimers();
        });
        const card = screen.getByRole("dialog");
        expect(screen.getByTestId("clip").contains(card)).toBe(false);
        expect(card.style.position).toBe("fixed");
    });

    it("keeps the consumer's style next to the positioning", () => {
        vi.useFakeTimers();
        render(
            <HoverCard trigger={<span>@ana</span>} openDelay={0} style={{ maxWidth: 400 }}>
                profile
            </HoverCard>,
        );
        fireEvent.mouseEnter(screen.getByText("@ana"));
        act(() => {
            vi.runAllTimers();
        });
        const card = screen.getByRole("dialog");
        expect(card.style.maxWidth).toBe("400px");
        expect(card.style.position).toBe("fixed");
    });

    it("stays open while the pointer moves from the trigger into the card", () => {
        vi.useFakeTimers();
        render(
            <HoverCard trigger={<span>@ana</span>} openDelay={0} closeDelay={100}>
                profile
            </HoverCard>,
        );
        fireEvent.mouseEnter(screen.getByText("@ana"));
        act(() => {
            vi.runAllTimers();
        });
        const card = screen.getByRole("dialog");
        fireEvent.mouseLeave(screen.getByText("@ana"));
        fireEvent.mouseEnter(card);
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("makes a link in the card the next Tab stop after the trigger", async () => {
        render(
            <>
                <HoverCard trigger={<button type="button">@ana</button>} openDelay={0}>
                    <a href="#perfil">perfil</a>
                </HoverCard>
                <button type="button">after</button>
            </>,
        );
        screen.getByText("@ana").focus();
        await screen.findByRole("dialog");
        await userEvent.tab();
        expect(screen.getByText("perfil")).toHaveFocus();
    });
});
