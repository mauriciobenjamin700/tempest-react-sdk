import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MultiSelect, type MultiSelectOption } from "./MultiSelect";

const OPTIONS: MultiSelectOption[] = [
    { value: "sp", label: "São Paulo" },
    { value: "rj", label: "Rio de Janeiro" },
    { value: "mg", label: "Minas Gerais" },
];

describe("MultiSelect", () => {
    it("renders selected values as chips", () => {
        render(<MultiSelect options={OPTIONS} value={["sp", "rj"]} onChange={() => {}} />);
        expect(screen.getByText("São Paulo")).toBeInTheDocument();
        expect(screen.getByText("Rio de Janeiro")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remover São Paulo" })).toBeInTheDocument();
    });

    it("adds a value when an option is clicked", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} />);
        fireEvent.focus(screen.getByRole("combobox"));
        fireEvent.mouseDown(screen.getByRole("option", { name: /Minas Gerais/ }));
        expect(onChange).toHaveBeenCalledWith(["mg"]);
    });

    it("toggles a selected value off when clicked again", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={["sp"]} onChange={onChange} />);
        fireEvent.focus(screen.getByRole("combobox"));
        fireEvent.mouseDown(screen.getByRole("option", { name: /São Paulo/ }));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("removes the last chip on Backspace with empty query", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={["sp", "rj"]} onChange={onChange} />);
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });
        expect(onChange).toHaveBeenCalledWith(["sp"]);
    });

    it("filters options by query", () => {
        render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} />);
        const input = screen.getByRole("combobox");
        fireEvent.change(input, { target: { value: "rio" } });
        expect(screen.getByRole("option", { name: /Rio de Janeiro/ })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /Minas Gerais/ })).not.toBeInTheDocument();
    });

    it("respects maxItems", () => {
        const onChange = vi.fn();
        render(
            <MultiSelect options={OPTIONS} value={["sp", "rj"]} onChange={onChange} maxItems={2} />,
        );
        fireEvent.focus(screen.getByRole("combobox"));
        fireEvent.mouseDown(screen.getByRole("option", { name: /Minas Gerais/ }));
        expect(onChange).not.toHaveBeenCalled();
    });
});
