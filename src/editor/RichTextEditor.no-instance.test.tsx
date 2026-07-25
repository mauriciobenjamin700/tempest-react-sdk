import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * `useEditor` returns `null` on the very first render when tiptap defers editor
 * creation (`immediatelyRender: false`, and during SSR-style hydration). The real
 * hook creates it synchronously in jsdom, so the null-guard paths — the two
 * prop-sync effects and the early return — are only reachable with the hook
 * mocked.
 */
vi.mock("@tiptap/react", () => ({
    EditorContent: () => null,
    useEditor: () => null,
    useEditorState: () => null,
}));

const { RichTextEditor } = await import("./RichTextEditor");

describe("RichTextEditor without an editor instance", () => {
    it("renders nothing and runs no prop-sync effects", () => {
        const onChange = vi.fn();
        const { container } = render(
            <RichTextEditor value="<p>x</p>" onChange={onChange} editable={false} />,
        );
        expect(container).toBeEmptyDOMElement();
        expect(onChange).not.toHaveBeenCalled();
    });

    it("stays empty when the value changes", () => {
        const { container, rerender } = render(
            <RichTextEditor value="<p>a</p>" onChange={vi.fn()} />,
        );
        rerender(<RichTextEditor value="<p>b</p>" onChange={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });
});
