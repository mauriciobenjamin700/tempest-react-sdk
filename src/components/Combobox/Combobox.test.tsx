import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";

const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
];

describe("Combobox", () => {
    it("opens list on focus", async () => {
        render(<Combobox options={options} value="" onChange={vi.fn()} />);
        await userEvent.click(screen.getByRole("combobox"));
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        expect(screen.getAllByRole("option")).toHaveLength(3);
    });

    it("filters options by query", async () => {
        render(<Combobox options={options} value="" onChange={vi.fn()} />);
        const input = screen.getByRole("combobox");
        await userEvent.click(input);
        await userEvent.type(input, "alp");
        const opts = screen.getAllByRole("option");
        expect(opts).toHaveLength(1);
        expect(opts[0]).toHaveTextContent("Alpha");
    });

    it("calls onChange when option selected", async () => {
        const onChange = vi.fn();
        render(<Combobox options={options} value="" onChange={onChange} />);
        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.click(screen.getByText("Beta"));
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("Enter on active option selects it", async () => {
        const onChange = vi.fn();
        render(<Combobox options={options} value="" onChange={onChange} />);
        const input = screen.getByRole("combobox");
        await userEvent.click(input);
        await userEvent.keyboard("{ArrowDown}{Enter}");
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("shows empty message when no matches", async () => {
        render(<Combobox options={options} value="" onChange={vi.fn()} />);
        const input = screen.getByRole("combobox");
        await userEvent.click(input);
        await userEvent.type(input, "xyz");
        expect(screen.getByText(/Nenhuma opção/)).toBeInTheDocument();
    });

    it("displays selected label when not editing", () => {
        render(<Combobox options={options} value="c" onChange={vi.fn()} />);
        const input = screen.getByRole("combobox") as HTMLInputElement;
        expect(input.value).toBe("Gamma");
    });
});
