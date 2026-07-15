import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObjectUrl } from "./use-object-url";

describe("useObjectUrl", () => {
    let created: string[];
    let revoked: string[];

    beforeEach(() => {
        created = [];
        revoked = [];
        let counter = 0;
        vi.stubGlobal("URL", {
            ...URL,
            createObjectURL: vi.fn(() => {
                const url = `blob:mock/${counter++}`;
                created.push(url);
                return url;
            }),
            revokeObjectURL: vi.fn((url: string) => {
                revoked.push(url);
            }),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns null for nullish input", () => {
        const { result } = renderHook(() => useObjectUrl(null));
        expect(result.current).toBeNull();
        expect(created).toHaveLength(0);
    });

    it("creates a URL for a blob", () => {
        const blob = new Blob(["hello"], { type: "text/plain" });
        const { result } = renderHook(() => useObjectUrl(blob));
        expect(result.current).toBe("blob:mock/0");
        expect(created).toEqual(["blob:mock/0"]);
    });

    it("revokes the URL on unmount", () => {
        const blob = new Blob(["hello"]);
        const { unmount } = renderHook(() => useObjectUrl(blob));
        expect(revoked).toHaveLength(0);
        unmount();
        expect(revoked).toEqual(["blob:mock/0"]);
    });

    it("revokes the old URL and creates a new one when the blob changes", () => {
        const first = new Blob(["a"]);
        const second = new Blob(["b"]);
        const { result, rerender } = renderHook(({ blob }) => useObjectUrl(blob), {
            initialProps: { blob: first },
        });
        expect(result.current).toBe("blob:mock/0");

        rerender({ blob: second });
        expect(result.current).toBe("blob:mock/1");
        expect(revoked).toEqual(["blob:mock/0"]);
    });
});
