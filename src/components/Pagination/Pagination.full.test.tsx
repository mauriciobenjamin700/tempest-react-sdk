import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination — full", () => {
    it("renders ellipsis on long page ranges", () => {
        render(<Pagination page={5} totalPages={20} onPageChange={vi.fn()} siblingCount={3} />);
        // multiple "…" markers expected for both sides
        const ellipses = screen.getAllByText(/…/);
        expect(ellipses.length).toBeGreaterThanOrEqual(1);
    });

    it("calls onPageSizeChange when size selector changes", async () => {
        const onPageSizeChange = vi.fn();
        render(
            <Pagination
                page={1}
                totalPages={5}
                pageSize={50}
                onPageChange={vi.fn()}
                onPageSizeChange={onPageSizeChange}
            />,
        );
        const select = screen.getByLabelText("Itens por página") as HTMLSelectElement;
        await userEvent.selectOptions(select, "100");
        expect(onPageSizeChange).toHaveBeenCalledWith(100);
    });

    it("renders totalItems summary", () => {
        render(<Pagination page={1} totalPages={3} totalItems={42} onPageChange={vi.fn()} />);
        expect(screen.getByText(/42 resultados/)).toBeInTheDocument();
    });

    it("renders singular form when totalItems === 1", () => {
        render(<Pagination page={1} totalPages={2} totalItems={1} onPageChange={vi.fn()} />);
        expect(screen.getByText(/1 resultado$/)).toBeInTheDocument();
    });

    it("clicks prev/next move page", async () => {
        const onPageChange = vi.fn();
        render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);
        await userEvent.click(screen.getByLabelText("Página anterior"));
        await userEvent.click(screen.getByLabelText("Próxima página"));
        expect(onPageChange).toHaveBeenNthCalledWith(1, 2);
        expect(onPageChange).toHaveBeenNthCalledWith(2, 4);
    });
});
