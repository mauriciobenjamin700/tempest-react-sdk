import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChipInput } from "./ChipInput";

function Controlled() {
    const [v, setV] = useState<string[]>([]);
    return <ChipInput value={v} onChange={setV} label="Tags" placeholder="add" />;
}

describe("ChipInput", () => {
    it("adds a chip on Enter", async () => {
        render(<Controlled />);
        const input = screen.getByPlaceholderText("add");
        await userEvent.type(input, "react{Enter}");
        expect(screen.getByText("react")).toBeInTheDocument();
    });

    it("removes a chip when × is clicked", async () => {
        render(<Controlled />);
        const input = screen.getByPlaceholderText("add");
        await userEvent.type(input, "react{Enter}");
        await userEvent.click(screen.getByLabelText("Remover react"));
        expect(screen.queryByText("react")).not.toBeInTheDocument();
    });

    it("associates the label with the inner input", () => {
        render(<ChipInput value={[]} onChange={() => undefined} label="Tags" />);
        expect(screen.getByLabelText("Tags")).toBeInTheDocument();
    });

    it("falls back to aria-label when there is no visible label", () => {
        render(<ChipInput value={[]} onChange={() => undefined} aria-label="Etiquetas" />);
        expect(screen.getByLabelText("Etiquetas")).toBeInTheDocument();
    });
});

describe("ChipInput — normalisation, ids and chrome", () => {
    it("lowercases and trims by default, and dedupes", async () => {
        const onChange = vi.fn();
        render(<ChipInput value={["react"]} onChange={onChange} aria-label="Tags" />);
        const input = screen.getByLabelText("Tags");

        await userEvent.type(input, "  React  {Enter}");
        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveValue("");

        await userEvent.type(input, "  Vue {Enter}");
        expect(onChange).toHaveBeenCalledWith(["react", "vue"]);
    });

    it("keeps the raw casing when normalize is off", async () => {
        const onChange = vi.fn();
        render(<ChipInput value={[]} onChange={onChange} normalize={false} aria-label="Tags" />);
        await userEvent.type(screen.getByLabelText("Tags"), " React {Enter}");
        expect(onChange).toHaveBeenCalledWith(["React"]);
    });

    it("ignores a blank draft", async () => {
        const onChange = vi.fn();
        render(<ChipInput value={[]} onChange={onChange} aria-label="Tags" />);
        await userEvent.type(screen.getByLabelText("Tags"), "   {Enter}");
        expect(onChange).not.toHaveBeenCalled();
    });

    it("commits on blur", async () => {
        const onChange = vi.fn();
        render(<ChipInput value={[]} onChange={onChange} aria-label="Tags" />);
        const input = screen.getByLabelText("Tags");
        await userEvent.type(input, "novo");
        await userEvent.tab();
        expect(onChange).toHaveBeenCalledWith(["novo"]);
    });

    it("honours custom commitKeys", async () => {
        const onChange = vi.fn();
        render(<ChipInput value={[]} onChange={onChange} commitKeys={[";"]} aria-label="Tags" />);
        const input = screen.getByLabelText("Tags");
        await userEvent.type(input, "a{Enter}");
        expect(onChange).not.toHaveBeenCalled();
        await userEvent.type(input, ";");
        expect(onChange).toHaveBeenCalledWith(["a"]);
    });

    it("uses a caller-provided id for the label association", () => {
        render(<ChipInput value={[]} onChange={() => undefined} id="tags-field" label="Tags" />);
        const input = screen.getByLabelText("Tags");
        expect(input).toHaveAttribute("id", "tags-field");
    });

    it("shows the placeholder only while empty", () => {
        const { unmount } = render(
            <ChipInput value={[]} onChange={() => undefined} placeholder="Adicione" />,
        );
        expect(screen.getByPlaceholderText("Adicione")).toBeInTheDocument();
        unmount();

        render(<ChipInput value={["a"]} onChange={() => undefined} placeholder="Adicione" />);
        expect(screen.queryByPlaceholderText("Adicione")).not.toBeInTheDocument();
    });

    it("renders helper text, and the error replaces it", () => {
        const { unmount } = render(
            <ChipInput value={[]} onChange={() => undefined} helperText="Enter para adicionar" />,
        );
        expect(screen.getByText("Enter para adicionar")).toBeInTheDocument();
        unmount();

        render(
            <ChipInput
                value={[]}
                onChange={() => undefined}
                helperText="ignorado"
                error="Obrigatório"
            />,
        );
        expect(screen.getByText("Obrigatório")).toBeInTheDocument();
        expect(screen.queryByText("ignorado")).not.toBeInTheDocument();
    });

    it("focuses the input when the field area is clicked", async () => {
        render(<ChipInput value={[]} onChange={() => undefined} aria-label="Tags" />);
        const input = screen.getByLabelText("Tags");
        await userEvent.click(input.parentElement as HTMLElement);
        expect(document.activeElement).toBe(input);
    });
});
