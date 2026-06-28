import { render, screen } from "@testing-library/react";
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
