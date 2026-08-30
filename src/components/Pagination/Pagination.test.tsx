import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
    it("renders nothing when totalPages <= 1 and no size selector", () => {
        const { container } = render(<Pagination page={1} totalPages={1} onPageChange={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it("fires onPageChange when a page number is clicked", async () => {
        const onPageChange = vi.fn();
        render(<Pagination page={1} totalPages={5} onPageChange={onPageChange} />);
        await userEvent.click(screen.getByRole("button", { name: "3" }));
        expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it("disables previous on first page", () => {
        render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
        expect(screen.getByLabelText("Página anterior")).toBeDisabled();
    });

    it("disables next on last page", () => {
        render(<Pagination page={5} totalPages={5} onPageChange={vi.fn()} />);
        expect(screen.getByLabelText("Próxima página")).toBeDisabled();
    });
});

describe("Pagination — narrow screens", () => {
    /**
     * jsdom computes no layout, so the media query itself is not observable
     * here: what these pin is the switch the CSS keys off and the scrolling the
     * component owns. The rendered result at 360px is checked in a real browser
     * (see the PR), which is the only place a media query means anything.
     */
    it("declares the compact mode on the wrapper, and defaults to it", () => {
        const { container, rerender } = render(
            <Pagination page={1} totalPages={20} onPageChange={vi.fn()} />,
        );
        expect(container.firstChild).toHaveAttribute("data-compact", "true");

        rerender(
            <Pagination page={1} totalPages={20} onPageChange={vi.fn()} compactOnMobile={false} />,
        );
        expect(container.firstChild).toHaveAttribute("data-compact", "false");
    });

    it("renders the numbered buttons in both modes — the collapse is CSS, not markup", () => {
        const { getByRole, rerender } = render(
            <Pagination page={1} totalPages={20} onPageChange={vi.fn()} />,
        );
        expect(getByRole("button", { name: "3" })).toBeInTheDocument();

        rerender(
            <Pagination page={1} totalPages={20} onPageChange={vi.fn()} compactOnMobile={false} />,
        );
        expect(getByRole("button", { name: "3" })).toBeInTheDocument();
    });

    it("scrolls the current page into view when it changes, only when the row can scroll", () => {
        const scrollIntoView = vi.fn();
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoView,
        });

        const { rerender } = render(
            <Pagination page={1} totalPages={20} onPageChange={vi.fn()} compactOnMobile={false} />,
        );
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });

        scrollIntoView.mockClear();
        rerender(
            <Pagination page={7} totalPages={20} onPageChange={vi.fn()} compactOnMobile={false} />,
        );
        expect(scrollIntoView).toHaveBeenCalledTimes(1);

        scrollIntoView.mockClear();
        rerender(<Pagination page={8} totalPages={20} onPageChange={vi.fn()} />);
        expect(scrollIntoView).not.toHaveBeenCalled();
    });
});
