import { afterEach, describe, expect, it, vi } from "vitest";
import { formatShortcut, isApplePlatform } from "./format-shortcut";

afterEach(() => {
    vi.unstubAllGlobals();
});

/**
 * Replace `navigator` with one reporting the given platform strings.
 *
 * @param fields - `platform`, `userAgent` and `userAgentData` to report.
 */
function stubNavigator(fields: {
    platform?: string;
    userAgent?: string;
    userAgentData?: { platform?: string };
}): void {
    vi.stubGlobal("navigator", { platform: "", userAgent: "", ...fields });
}

describe("isApplePlatform", () => {
    it("is true for macOS, iPhone and iPad as navigator.platform spells them", () => {
        for (const platform of ["MacIntel", "iPhone", "iPad"]) {
            stubNavigator({ platform });
            expect(isApplePlatform()).toBe(true);
        }
    });

    it("prefers userAgentData.platform when the browser has it", () => {
        stubNavigator({ platform: "Win32", userAgentData: { platform: "macOS" } });
        expect(isApplePlatform()).toBe(true);
        stubNavigator({ platform: "MacIntel", userAgentData: { platform: "Windows" } });
        expect(isApplePlatform()).toBe(false);
    });

    it("falls back to the user agent when the platform fields are empty", () => {
        stubNavigator({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
        expect(isApplePlatform()).toBe(true);
    });

    it("is false on Windows, Linux and Android", () => {
        for (const platform of ["Win32", "Linux x86_64", "Linux armv8l"]) {
            stubNavigator({ platform });
            expect(isApplePlatform()).toBe(false);
        }
    });

    it("is false outside a browser, where there is no navigator", () => {
        vi.stubGlobal("navigator", undefined);
        expect(isApplePlatform()).toBe(false);
    });
});

describe("formatShortcut", () => {
    it("writes mod as ⌘ on Apple and Ctrl elsewhere", () => {
        expect(formatShortcut({ key: "k", mod: true }, { platform: "apple" })).toBe("⌘K");
        expect(formatShortcut({ key: "k", mod: true }, { platform: "other" })).toBe("Ctrl+K");
    });

    it("orders Apple modifiers as the system menus do: ⌃ ⌥ ⇧ ⌘", () => {
        expect(
            formatShortcut(
                { key: "p", ctrl: true, alt: true, shift: true, meta: true },
                { platform: "apple" },
            ),
        ).toBe("⌃⌥⇧⌘P");
    });

    it("orders the other modifiers Ctrl, Alt, Shift, Meta, joined by +", () => {
        expect(
            formatShortcut(
                { key: "p", ctrl: true, alt: true, shift: true, meta: true },
                { platform: "other" },
            ),
        ).toBe("Ctrl+Alt+Shift+Meta+P");
    });

    it("names special keys per platform", () => {
        expect(formatShortcut({ key: "Enter", mod: true }, { platform: "apple" })).toBe("⌘↩");
        expect(formatShortcut({ key: "Enter", mod: true }, { platform: "other" })).toBe(
            "Ctrl+Enter",
        );
        expect(formatShortcut({ key: "Escape" }, { platform: "other" })).toBe("Esc");
        expect(formatShortcut({ key: "ArrowUp", alt: true }, { platform: "apple" })).toBe("⌥↑");
        expect(formatShortcut({ key: " ", shift: true }, { platform: "other" })).toBe(
            "Shift+Space",
        );
    });

    it("shows an unknown named key as written, capitalized", () => {
        expect(formatShortcut({ key: "pageDown" }, { platform: "other" })).toBe("PageDown");
    });

    it("detects the platform when none is given", () => {
        stubNavigator({ platform: "MacIntel" });
        expect(formatShortcut({ key: "k", mod: true })).toBe("⌘K");
        stubNavigator({ platform: "Win32" });
        expect(formatShortcut({ key: "k", mod: true })).toBe("Ctrl+K");
    });
});
