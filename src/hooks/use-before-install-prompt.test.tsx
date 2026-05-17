import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBeforeInstallPrompt } from "./use-before-install-prompt";

describe("useBeforeInstallPrompt", () => {
    it("starts as not-installable", async () => {
        const { result } = renderHook(() => useBeforeInstallPrompt());
        expect(result.current.installable).toBe(false);
        expect(result.current.installed).toBe(false);
        await expect(result.current.prompt()).resolves.toBe("unsupported");
    });
});
