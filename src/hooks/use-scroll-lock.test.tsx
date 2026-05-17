import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useScrollLock } from "./use-scroll-lock";

describe("useScrollLock", () => {
    it("sets body.overflow to hidden when active", () => {
        const { unmount } = renderHook(() => useScrollLock(true));
        expect(document.body.style.overflow).toBe("hidden");
        unmount();
        expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("does nothing when inactive", () => {
        document.body.style.overflow = "auto";
        renderHook(() => useScrollLock(false));
        expect(document.body.style.overflow).toBe("auto");
    });
});
