import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
    it("renders nothing when totalPages <= 1 and no size selector", () => {
        const { container } = render(
            <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />,
        );
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
