/**
 * Runtime installer for a {@link GeneratedTheme}.
 *
 * A generated theme is just CSS text, so it needs a `<style>` element to take
 * effect. This owns that element by id, which keeps re-applying idempotent — a
 * theme picker can call `applyTheme` on every click without stacking dead
 * stylesheets in `<head>`.
 */
import type { GeneratedTheme } from "./create-theme";

/** Options for {@link applyTheme}. */
export interface ApplyThemeOptions {
    /**
     * `id` of the managed `<style>` element. Reusing the same id replaces the
     * previous theme; a distinct id lets two themes coexist (e.g. a scoped
     * preview under its own selector). Default `"tempest-theme"`.
     */
    id?: string;
    /**
     * Node the `<style>` is appended to. Default `document.head`. Pass a shadow
     * root to theme a single web component.
     */
    target?: Document | ShadowRoot | HTMLElement;
}

/** The default `<style>` element id owned by {@link applyTheme}. */
export const THEME_STYLE_ID = "tempest-theme";

function resolveContainer(target: ApplyThemeOptions["target"]): ParentNode | null {
    if (!target) {
        return typeof document === "undefined" ? null : document.head;
    }
    if (typeof Document !== "undefined" && target instanceof Document) {
        return target.head;
    }
    return target;
}

/**
 * Install a generated theme (or raw CSS) into the document.
 *
 * Safe to call outside a browser: with no `document` it is a no-op returning a
 * no-op disposer, so app bootstrap code does not need a `typeof window` guard.
 *
 * @param theme - A {@link GeneratedTheme} from `createTheme`, or CSS text.
 * @param options - Style element id and mount target.
 * @returns A function that removes the injected `<style>` element.
 *
 * @example
 * ```ts
 * import { applyTheme, createTheme, themePresets } from "tempest-react-sdk";
 *
 * const dispose = applyTheme(createTheme(themePresets.violet));
 * // later: dispose();
 * ```
 */
export function applyTheme(
    theme: GeneratedTheme | string,
    options: ApplyThemeOptions = {},
): () => void {
    const { id = THEME_STYLE_ID, target } = options;
    const container = resolveContainer(target);
    if (!container || typeof document === "undefined") {
        return () => {};
    }

    const css = typeof theme === "string" ? theme : theme.css;

    let style = Array.from(container.childNodes).find(
        (node): node is HTMLStyleElement => node instanceof HTMLStyleElement && node.id === id,
    );

    if (!style) {
        style = document.createElement("style");
        style.id = id;
        container.appendChild(style);
    }

    style.textContent = css;

    return () => {
        style?.remove();
    };
}

/**
 * Read a token's computed value from an element (default: `<html>`).
 *
 * Useful to bridge CSS tokens into JS that cannot take a `var()` — canvas
 * drawing, chart libraries that set SVG attributes, `<meta name="theme-color">`.
 *
 * @param name - Token name, with or without the leading `--`.
 * @param element - Element to resolve against. Omit for `document.documentElement`;
 *   an explicit `null` (a ref that has not attached yet) reads nothing rather than
 *   silently falling back to the root, whose value may be a different theme.
 * @returns The trimmed value, or `""` when unset or outside a browser.
 */
export function readThemeToken(name: string, element?: Element | null): string {
    if (typeof window === "undefined" || typeof document === "undefined") return "";
    if (element === null) return "";
    const target = element ?? document.documentElement;
    if (!target) return "";
    const property = name.startsWith("--") ? name : `--${name}`;
    return window.getComputedStyle(target).getPropertyValue(property).trim();
}
