import { afterEach, describe, expect, it, vi } from "vitest";

import { writeToClipboard } from "./write-to-clipboard";

const ORIGINAL_CLIPBOARD = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const ORIGINAL_EXEC_COMMAND = document.execCommand;

afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_CLIPBOARD) Object.defineProperty(navigator, "clipboard", ORIGINAL_CLIPBOARD);
    else delete (navigator as unknown as Record<string, unknown>).clipboard;
    document.execCommand = ORIGINAL_EXEC_COMMAND;
});

describe("writeToClipboard", () => {
    it("reports a refused execCommand as a failed copy, not a success", async () => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
        document.execCommand = vi.fn(() => false);
        expect(await writeToClipboard("x")).toBe(false);
    });

    it("treats a throwing execCommand as a failed copy and removes the off-screen field", async () => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
        document.execCommand = vi.fn(() => {
            throw new Error("blocked");
        });
        expect(await writeToClipboard("x")).toBe(false);
        expect(document.querySelector("textarea")).toBeNull();
    });

    it("returns false outside a browser instead of throwing", async () => {
        vi.stubGlobal("document", undefined);
        expect(await writeToClipboard("x")).toBe(false);
    });
});
