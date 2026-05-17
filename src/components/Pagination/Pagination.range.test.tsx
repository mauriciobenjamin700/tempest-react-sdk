import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination range building", () => {
    it("renders compact range when totalPages fits in slots", () => {
        render(<Pagination page={3} totalPages={5} onPageChange={vi.fn()} siblingCount={3} />);
        for (let i = 1; i <= 5; i++) {
            expect(screen.getByRole("button", { name: String(i) })).toBeInTheDocument();
        }
    });

    it("renders single ellipsis on left edge", () => {
        render(<Pagination page={1} totalPages={20} onPageChange={vi.fn()} siblingCount={3} />);
        const ellipses = screen.getAllByText(/…/);
        expect(ellipses.length).toBeGreaterThanOrEqual(1);
    });

    it("renders single ellipsis on right edge", () => {
        render(<Pagination page={20} totalPages={20} onPageChange={vi.fn()} siblingCount={3} />);
        const ellipses = screen.getAllByText(/…/);
        expect(ellipses.length).toBeGreaterThanOrEqual(1);
    });
});
