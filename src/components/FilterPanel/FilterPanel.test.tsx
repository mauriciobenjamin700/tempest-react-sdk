import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Input } from "../Input";
import { FilterPanel } from "./FilterPanel";

describe("FilterPanel — the frame", () => {
    it("renders a search landmark titled Filtros by default, with the fields inside", () => {
        render(
            <FilterPanel>
                <Input label="Busca" />
            </FilterPanel>,
        );

        expect(screen.getByRole("search", { name: "Filtros" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Filtros" })).toBeInTheDocument();
        expect(screen.getByLabelText("Busca")).toBeInTheDocument();
    });

    it("takes the English defaults from locale", () => {
        render(
            <FilterPanel locale="en" onClear={() => {}} onApply={() => {}}>
                <Input label="Search" />
            </FilterPanel>,
        );

        expect(screen.getByRole("search", { name: "Filters" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Apply filters" })).toBeInTheDocument();
    });

    it("lets labels override any single default", () => {
        render(
            <FilterPanel onApply={() => {}} labels={{ apply: "Buscar" }}>
                <Input label="Busca" />
            </FilterPanel>,
        );

        expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Filtros" })).toBeInTheDocument();
    });

    it("renders a node title as given, without naming the landmark after it", () => {
        render(
            <FilterPanel title={<h2>Busca avançada</h2>} aria-labelledby="custom">
                <Input label="Busca" />
            </FilterPanel>,
        );

        expect(
            screen.getByRole("heading", { level: 2, name: "Busca avançada" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("search")).not.toHaveAttribute("aria-label");
    });

    it("renders header actions that are not fields", () => {
        render(
            <FilterPanel actions={<button type="button">Exportar CSV</button>}>
                <Input label="Busca" />
            </FilterPanel>,
        );

        expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeInTheDocument();
    });
});

describe("FilterPanel — clear only exists when it can do something", () => {
    it("renders no clear button without onClear", () => {
        render(
            <FilterPanel>
                <Input label="Busca" />
            </FilterPanel>,
        );

        expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    });

    it("calls onClear, and clearing never submits the form", async () => {
        const onClear = vi.fn();
        const onApply = vi.fn();
        render(
            <FilterPanel onClear={onClear} onApply={onApply}>
                <Input label="Busca" />
            </FilterPanel>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

        expect(onClear).toHaveBeenCalledTimes(1);
        expect(onApply).not.toHaveBeenCalled();
    });
});

describe("FilterPanel — apply", () => {
    it("is not a form, and has no apply button, without onApply", () => {
        const { container } = render(
            <FilterPanel>
                <Input label="Busca" />
            </FilterPanel>,
        );

        expect(container.querySelector("form")).toBeNull();
        expect(screen.queryByRole("button", { name: "Filtrar" })).toBeNull();
    });

    it("applies from the header button, which submits the fields' form", async () => {
        const onApply = vi.fn();
        render(
            <FilterPanel onApply={onApply}>
                <Input label="Busca" />
            </FilterPanel>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Filtrar" }));

        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("applies on Enter in a field", async () => {
        const onApply = vi.fn();
        render(
            <FilterPanel onApply={onApply}>
                <Input label="Busca" />
            </FilterPanel>,
        );

        await userEvent.type(screen.getByLabelText("Busca"), "AUTH{Enter}");

        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("prevents the page navigation a native submit would do", () => {
        const onApply = vi.fn();
        const { container } = render(
            <FilterPanel onApply={onApply}>
                <Input label="Busca" />
            </FilterPanel>,
        );
        const form = container.querySelector("form") as HTMLFormElement;

        const notCancelled = fireEvent.submit(form);

        expect(notCancelled).toBe(false);
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("disables the apply button with applyDisabled", () => {
        render(
            <FilterPanel onApply={() => {}} applyDisabled>
                <Input label="Busca" />
            </FilterPanel>,
        );

        expect(screen.getByRole("button", { name: "Filtrar" })).toBeDisabled();
    });
});

describe("FilterPanel — the grid follows the panel", () => {
    it("defaults to an auto-fill track floored at minFieldWidth, capped at the panel", () => {
        render(
            <FilterPanel minFieldWidth="15rem">
                <Input label="Busca" />
            </FilterPanel>,
        );
        const panel = screen.getByRole("search");
        const grid = screen.getByLabelText("Busca").closest("div[style]") as HTMLElement;

        expect(panel.style.getPropertyValue("--tempest-filter-panel-min")).toBe("15rem");
        expect(grid.style.gridTemplateColumns).toBe(
            "repeat(auto-fill, minmax(min(100%, var(--tempest-filter-panel-min)), 1fr))",
        );
    });

    it("hands fixed columns to Grid when columns is set", () => {
        render(
            <FilterPanel columns={3}>
                <Input label="Busca" />
            </FilterPanel>,
        );
        const grid = screen.getByLabelText("Busca").closest("div[style]") as HTMLElement;

        expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    });

    it("keeps the consumer's style and className", () => {
        render(
            <FilterPanel className="mine" style={{ marginTop: "8px" }}>
                <Input label="Busca" />
            </FilterPanel>,
        );
        const panel = screen.getByRole("search");

        expect(panel).toHaveClass("mine");
        expect(panel.style.marginTop).toBe("8px");
    });
});
