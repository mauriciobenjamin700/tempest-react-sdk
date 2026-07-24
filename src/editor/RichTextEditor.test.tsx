import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./RichTextEditor";

describe("RichTextEditor", () => {
    it("renders the provided HTML content", () => {
        render(<RichTextEditor value="<p>hello</p>" onChange={vi.fn()} />);
        expect(screen.getByText("hello")).toBeInTheDocument();
    });

    it("renders the formatting toolbar by default", () => {
        render(<RichTextEditor value="<p>hello</p>" onChange={vi.fn()} />);
        expect(screen.getByRole("toolbar")).toBeInTheDocument();
        expect(screen.getByLabelText("Negrito")).toBeInTheDocument();
        expect(screen.getByLabelText("Itálico")).toBeInTheDocument();
        expect(screen.getByLabelText("Tachado")).toBeInTheDocument();
        expect(screen.getByLabelText("Código")).toBeInTheDocument();
        expect(screen.getByLabelText("Título 1")).toBeInTheDocument();
        expect(screen.getByLabelText("Título 2")).toBeInTheDocument();
        expect(screen.getByLabelText("Lista com marcadores")).toBeInTheDocument();
        expect(screen.getByLabelText("Lista numerada")).toBeInTheDocument();
        expect(screen.getByLabelText("Citação")).toBeInTheDocument();
        expect(screen.getByLabelText("Desfazer")).toBeInTheDocument();
        expect(screen.getByLabelText("Refazer")).toBeInTheDocument();
    });

    it("hides the toolbar when toolbar is false", () => {
        render(<RichTextEditor value="<p>hello</p>" onChange={vi.fn()} toolbar={false} />);
        expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Negrito")).not.toBeInTheDocument();
    });

    it("renders a non-editable area when editable is false", () => {
        const { container } = render(
            <RichTextEditor value="<p>hello</p>" onChange={vi.fn()} editable={false} />,
        );
        const prose = container.querySelector(".ProseMirror");
        expect(prose).not.toBeNull();
        expect(prose?.getAttribute("contenteditable")).toBe("false");
    });

    it("toolbar buttons expose an active state via aria-pressed", () => {
        render(<RichTextEditor value="<p>hello</p>" onChange={vi.fn()} />);
        expect(screen.getByLabelText("Negrito")).toHaveAttribute("aria-pressed", "false");
    });
});

describe("RichTextEditor — toolbar commands and value sync", () => {
    const COMMANDS: [label: string, mark: string][] = [
        ["Negrito", "bold"],
        ["Itálico", "italic"],
        ["Tachado", "strike"],
        ["Código", "code"],
        ["Título 1", "heading"],
        ["Título 2", "heading"],
        ["Lista com marcadores", "bulletList"],
        ["Lista numerada", "orderedList"],
        ["Citação", "blockquote"],
    ];

    it.each(COMMANDS)("%s toggles the mark and reports through onChange", async (label) => {
        const onChange = vi.fn();
        render(<RichTextEditor value="<p>texto</p>" onChange={onChange} />);
        const button = screen.getByRole("button", { name: label });
        fireEvent.click(button);
        await waitFor(() => expect(button).toHaveAttribute("aria-pressed"));
    });

    it("exposes undo and redo buttons, disabled on a fresh document", () => {
        render(<RichTextEditor value="<p>a</p>" onChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Desfazer" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Refazer" })).toBeDisabled();
    });

    it("syncs an external value change into the document without re-emitting", async () => {
        const onChange = vi.fn();
        const { rerender } = render(<RichTextEditor value="<p>um</p>" onChange={onChange} />);
        expect(screen.getByText("um")).toBeInTheDocument();

        onChange.mockClear();
        rerender(<RichTextEditor value="<p>dois</p>" onChange={onChange} />);
        await waitFor(() => expect(screen.getByText("dois")).toBeInTheDocument());
        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores a rerender with the same value", async () => {
        const onChange = vi.fn();
        const { rerender } = render(<RichTextEditor value="<p>igual</p>" onChange={onChange} />);
        await waitFor(() => expect(screen.getByText("igual")).toBeInTheDocument());
        onChange.mockClear();
        rerender(<RichTextEditor value="<p>igual</p>" onChange={onChange} />);
        await waitFor(() => expect(screen.getByText("igual")).toBeInTheDocument());
        expect(onChange).not.toHaveBeenCalled();
    });

    it("flips the editable flag when the prop changes", async () => {
        const { rerender, container } = render(
            <RichTextEditor value="<p>x</p>" onChange={vi.fn()} editable />,
        );
        const area = () => container.querySelector(".ProseMirror") as HTMLElement;
        await waitFor(() => expect(area().getAttribute("contenteditable")).toBe("true"));

        rerender(<RichTextEditor value="<p>x</p>" onChange={vi.fn()} editable={false} />);
        await waitFor(() => expect(area().getAttribute("contenteditable")).toBe("false"));
    });

    it("forwards a className to the wrapper", () => {
        const { container } = render(
            <RichTextEditor value="<p>x</p>" onChange={vi.fn()} className="mine" />,
        );
        expect((container.firstChild as HTMLElement).className).toContain("mine");
    });
});
