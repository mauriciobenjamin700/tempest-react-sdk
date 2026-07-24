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

describe("MultiSelect — keyboard", () => {
    it("opens and moves the active option with ArrowDown/ArrowUp", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} />);
        const input = screen.getByRole("combobox");

        fireEvent.keyDown(input, { key: "ArrowDown" });
        expect(input).toHaveAttribute("aria-expanded", "true");
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).toHaveBeenCalledWith(["rj"]);

        onChange.mockClear();
        fireEvent.keyDown(input, { key: "ArrowUp" });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).toHaveBeenCalledWith(["sp"]);
    });

    it("clamps ArrowUp at the first option and ArrowDown at the last", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} />);
        const input = screen.getByRole("combobox");

        fireEvent.keyDown(input, { key: "ArrowUp" });
        fireEvent.keyDown(input, { key: "ArrowUp" });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).toHaveBeenCalledWith(["sp"]);

        onChange.mockClear();
        for (let i = 0; i < 10; i += 1) fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).toHaveBeenCalledWith(["mg"]);
    });

    it("Enter with no matching option does nothing", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} />);
        const input = screen.getByRole("combobox");
        fireEvent.change(input, { target: { value: "zzz" } });
        fireEvent.keyDown(input, { key: "Enter" });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("Escape closes the menu and clears the query", () => {
        render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} />);
        const input = screen.getByRole("combobox");
        fireEvent.change(input, { target: { value: "são" } });
        expect(screen.getByRole("listbox")).toBeInTheDocument();

        fireEvent.keyDown(input, { key: "Escape" });
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(input).toHaveValue("");
    });

    it("Backspace with a non-empty query keeps the chips", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={["sp"]} onChange={onChange} />);
        const input = screen.getByRole("combobox");
        fireEvent.change(input, { target: { value: "ri" } });
        fireEvent.keyDown(input, { key: "Backspace" });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("Backspace with no selection is a no-op", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} />);
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores unrelated keys", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} />);
        fireEvent.keyDown(screen.getByRole("combobox"), { key: "a" });
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("MultiSelect — states", () => {
    it("does not select a disabled option", () => {
        const onChange = vi.fn();
        const options = [...OPTIONS, { value: "ba", label: "Bahia", disabled: true }];
        render(<MultiSelect options={options} value={[]} onChange={onChange} />);
        fireEvent.focus(screen.getByRole("combobox"));
        fireEvent.mouseDown(screen.getByRole("option", { name: /Bahia/ }));
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole("option", { name: /Bahia/ })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
    });

    it("marks unselected options as disabled once maxItems is reached", () => {
        render(<MultiSelect options={OPTIONS} value={["sp"]} onChange={() => {}} maxItems={1} />);
        fireEvent.focus(screen.getByRole("combobox"));
        expect(screen.getByRole("option", { name: /Rio de Janeiro/ })).toHaveAttribute(
            "aria-disabled",
            "true",
        );
        expect(screen.getByRole("option", { name: /São Paulo/ })).toHaveAttribute(
            "aria-disabled",
            "false",
        );
    });

    it("still deselects at the cap", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={["sp"]} onChange={onChange} maxItems={1} />);
        fireEvent.focus(screen.getByRole("combobox"));
        fireEvent.mouseDown(screen.getByRole("option", { name: /São Paulo/ }));
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("removes a chip through its × button", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={["sp", "rj"]} onChange={onChange} />);
        fireEvent.mouseDown(screen.getByRole("button", { name: "Remover São Paulo" }));
        expect(onChange).toHaveBeenCalledWith(["rj"]);
    });

    it("ignores values with no matching option", () => {
        render(<MultiSelect options={OPTIONS} value={["ghost"]} onChange={() => {}} />);
        expect(screen.queryByText("ghost")).not.toBeInTheDocument();
    });

    it("shows the empty message when nothing matches", () => {
        render(
            <MultiSelect
                options={OPTIONS}
                value={[]}
                onChange={() => {}}
                emptyMessage="Sem estados"
            />,
        );
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
        expect(screen.getByText("Sem estados")).toBeInTheDocument();
    });

    it("accepts a custom filter", () => {
        const filter = vi.fn((option: MultiSelectOption, query: string) =>
            option.value.startsWith(query),
        );
        render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} filter={filter} />);
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "r" } });
        expect(screen.getAllByRole("option")).toHaveLength(1);
        expect(filter).toHaveBeenCalled();
    });

    it("renders label, helper text and error", () => {
        const { unmount } = render(
            <MultiSelect
                options={OPTIONS}
                value={[]}
                onChange={() => {}}
                label="Estados"
                helperText="Escolha ao menos um"
            />,
        );
        expect(screen.getByLabelText("Estados")).toBeInTheDocument();
        expect(screen.getByText("Escolha ao menos um")).toBeInTheDocument();
        unmount();

        render(
            <MultiSelect
                options={OPTIONS}
                value={[]}
                onChange={() => {}}
                helperText="ignorado"
                error="Obrigatório"
            />,
        );
        expect(screen.getByText("Obrigatório")).toBeInTheDocument();
        expect(screen.queryByText("ignorado")).not.toBeInTheDocument();
    });

    it("does nothing when disabled", () => {
        const onChange = vi.fn();
        render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} disabled />);
        const input = screen.getByRole("combobox");
        expect(input).toBeDisabled();
        fireEvent.mouseDown(input.parentElement as HTMLElement);
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("opens when the empty field area is clicked and closes on an outside click", () => {
        render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} />);
        const field = screen.getByRole("combobox").parentElement as HTMLElement;
        fireEvent.mouseDown(field);
        expect(screen.getByRole("listbox")).toBeInTheDocument();

        fireEvent.mouseDown(document.body);
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("keeps the menu open when the click lands inside the root", () => {
        render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} />);
        const input = screen.getByRole("combobox");
        fireEvent.focus(input);
        fireEvent.mouseDown(input);
        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("highlights the option under the mouse", () => {
        render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} />);
        fireEvent.focus(screen.getByRole("combobox"));
        const option = screen.getByRole("option", { name: /Minas Gerais/ });
        fireEvent.mouseEnter(option);
        expect(option.className).toContain("active");
    });

    it("drops the placeholder once something is selected", () => {
        const { unmount } = render(
            <MultiSelect options={OPTIONS} value={[]} onChange={() => {}} placeholder="Escolha" />,
        );
        expect(screen.getByPlaceholderText("Escolha")).toBeInTheDocument();
        unmount();

        render(
            <MultiSelect
                options={OPTIONS}
                value={["sp"]}
                onChange={() => {}}
                placeholder="Escolha"
            />,
        );
        expect(screen.queryByPlaceholderText("Escolha")).not.toBeInTheDocument();
    });
});
