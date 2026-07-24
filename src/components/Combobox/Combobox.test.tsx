import { fireEvent, render, screen } from "@testing-library/react";
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

describe("Combobox — keyboard, outside click and chrome", () => {
    it("navigates with the arrow keys and clamps at both ends", async () => {
        const onChange = vi.fn();
        render(<Combobox options={options} value="" onChange={onChange} />);
        const input = screen.getByRole("combobox");

        await userEvent.click(input);
        await userEvent.keyboard("{ArrowUp}{Enter}");
        expect(onChange).toHaveBeenLastCalledWith("a");

        await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
        expect(onChange).toHaveBeenLastCalledWith("c");
    });

    it("Escape closes the list and restores the selected label", async () => {
        render(<Combobox options={options} value="b" onChange={vi.fn()} />);
        const input = screen.getByRole("combobox");

        await userEvent.click(input);
        await userEvent.type(input, "alp");
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(input).toHaveValue("Beta");
    });

    it("Enter with no match does nothing", async () => {
        const onChange = vi.fn();
        render(<Combobox options={options} value="" onChange={onChange} />);
        const input = screen.getByRole("combobox");
        await userEvent.type(input, "zzz");
        await userEvent.keyboard("{Enter}");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores unrelated keys", async () => {
        const onChange = vi.fn();
        render(<Combobox options={options} value="" onChange={onChange} />);
        await userEvent.type(screen.getByRole("combobox"), "{Tab}");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("closes on an outside mousedown and stays open inside", async () => {
        render(<Combobox options={options} value="" onChange={vi.fn()} />);
        const input = screen.getByRole("combobox");

        await userEvent.click(input);
        expect(screen.getByRole("listbox")).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByRole("listbox"));
        expect(screen.getByRole("listbox")).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("renders label, helper text and error", () => {
        const { unmount } = render(
            <Combobox
                options={options}
                value=""
                onChange={vi.fn()}
                label="Letra"
                helperText="escolha uma"
            />,
        );
        expect(screen.getByLabelText("Letra")).toBeInTheDocument();
        expect(screen.getByText("escolha uma")).toBeInTheDocument();
        unmount();

        render(
            <Combobox
                options={options}
                value=""
                onChange={vi.fn()}
                helperText="ignorado"
                error="obrigatório"
            />,
        );
        expect(screen.getByText("obrigatório")).toBeInTheDocument();
        expect(screen.queryByText("ignorado")).not.toBeInTheDocument();
    });

    it("does not open when disabled", async () => {
        render(<Combobox options={options} value="" onChange={vi.fn()} disabled />);
        const input = screen.getByRole("combobox");
        expect(input).toBeDisabled();
        await userEvent.click(input);
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
});
