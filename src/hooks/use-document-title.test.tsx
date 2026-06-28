import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDocumentTitle } from "./use-document-title";

describe("useDocumentTitle", () => {
    it("sets the document title while mounted", () => {
        renderHook(() => useDocumentTitle("Hello"));
        expect(document.title).toBe("Hello");
    });

    it("restores the previous title on unmount", () => {
        document.title = "Original";
        const { unmount } = renderHook(() => useDocumentTitle("Temp"));
        expect(document.title).toBe("Temp");
        unmount();
        expect(document.title).toBe("Original");
    });

    it("updates when the title changes", () => {
        const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
            initialProps: { title: "First" },
        });
        expect(document.title).toBe("First");
        rerender({ title: "Second" });
        expect(document.title).toBe("Second");
    });
});
