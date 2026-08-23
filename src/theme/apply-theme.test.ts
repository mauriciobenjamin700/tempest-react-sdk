import { afterEach, describe, expect, it, vi } from "vitest";

import { applyTheme, readThemeToken, THEME_STYLE_ID } from "./apply-theme";
import { createTheme } from "./create-theme";

afterEach(() => {
    document.getElementById(THEME_STYLE_ID)?.remove();
    document.querySelectorAll("style[id^='brand-']").forEach((node) => node.remove());
    document.documentElement.removeAttribute("style");
});

describe("applyTheme", () => {
    it("injects a style element carrying the generated css", () => {
        applyTheme(createTheme({ primary: "#0066ff" }));

        const style = document.getElementById(THEME_STYLE_ID);
        expect(style).toBeInstanceOf(HTMLStyleElement);
        expect(style?.textContent).toContain("--tempest-primary-500:");
    });

    it("accepts raw css text", () => {
        applyTheme(":root { --tempest-primary: hotpink; }");
        expect(document.getElementById(THEME_STYLE_ID)?.textContent).toContain("hotpink");
    });

    it("reuses the same element on re-apply instead of stacking styles", () => {
        applyTheme(createTheme({ primary: "#0066ff" }));
        applyTheme(createTheme({ primary: "#16a34a" }));

        expect(document.querySelectorAll(`#${THEME_STYLE_ID}`)).toHaveLength(1);
    });

    it("replaces the previous theme content", () => {
        applyTheme(":root { --a: 1; }");
        applyTheme(":root { --b: 2; }");

        const text = document.getElementById(THEME_STYLE_ID)?.textContent ?? "";
        expect(text).toContain("--b: 2");
        expect(text).not.toContain("--a: 1");
    });

    it("keeps two themes side by side under distinct ids", () => {
        applyTheme(".a { --x: 1; }", { id: "brand-a" });
        applyTheme(".b { --x: 2; }", { id: "brand-b" });

        expect(document.getElementById("brand-a")?.textContent).toContain("--x: 1");
        expect(document.getElementById("brand-b")?.textContent).toContain("--x: 2");
    });

    it("removes the element through the returned disposer", () => {
        const dispose = applyTheme(":root { --x: 1; }");
        expect(document.getElementById(THEME_STYLE_ID)).not.toBeNull();

        dispose();
        expect(document.getElementById(THEME_STYLE_ID)).toBeNull();
    });

    it("mounts into an explicit element target", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);

        applyTheme(":root { --x: 1; }", { target: host, id: "brand-scoped" });
        expect(host.querySelector("#brand-scoped")).not.toBeNull();

        host.remove();
    });

    it("mounts into the head of an explicit document target", () => {
        applyTheme(":root { --x: 1; }", { target: document });
        expect(document.head.querySelector(`#${THEME_STYLE_ID}`)).not.toBeNull();
    });
});

describe("readThemeToken", () => {
    it("reads a token set on the root element", () => {
        document.documentElement.style.setProperty("--tempest-primary", "#123456");
        expect(readThemeToken("--tempest-primary")).toBe("#123456");
    });

    it("accepts a name without the leading dashes", () => {
        document.documentElement.style.setProperty("--tempest-primary", "#abcdef");
        expect(readThemeToken("tempest-primary")).toBe("#abcdef");
    });

    it("reads from an explicit element", () => {
        const host = document.createElement("div");
        host.style.setProperty("--tempest-primary", "#0f0f0f");
        document.body.appendChild(host);

        expect(readThemeToken("--tempest-primary", host)).toBe("#0f0f0f");

        host.remove();
    });

    it("returns an empty string for an unset token", () => {
        expect(readThemeToken("--tempest-does-not-exist")).toBe("");
    });

    it("returns an empty string when the element is null", () => {
        expect(readThemeToken("--tempest-primary", null)).toBe("");
    });
});

describe("apply-theme — outside a browser", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("installs nothing and hands back a disposer that does nothing", () => {
        vi.stubGlobal("document", undefined);

        const dispose = applyTheme(":root { --tempest-primary: #123456; }");

        expect(dispose).toBeInstanceOf(Function);
        expect(() => dispose()).not.toThrow();
    });

    it("reads no token without a window", () => {
        vi.stubGlobal("window", undefined);

        expect(readThemeToken("--tempest-primary")).toBe("");
    });

    it("reads no token when the document has no root element", () => {
        vi.stubGlobal("document", { documentElement: null });

        expect(readThemeToken("--tempest-primary")).toBe("");
    });
});
