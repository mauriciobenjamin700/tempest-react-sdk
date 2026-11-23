// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { themeInitScript } from "../theme/theme-init-script";
import { tempestCsp } from "./tempest-csp";
import { tempestThemeInit } from "./tempest-theme-init";

const PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>t</title>
  </head>
  <body><div id="root"></div><script type="module" src="/src/main.js"></script></body>
</html>`;

/**
 * Run a real `vite build` over {@link PAGE} with the given plugins.
 *
 * @param plugins - Plugins for the build.
 * @param html - The `index.html` to build.
 * @returns The built `dist/index.html`.
 */
async function buildPage(plugins: unknown[], html: string = PAGE): Promise<string> {
    const { build } = await import("vite");
    const root = mkdtempSync(join(tmpdir(), "tempest-theme-init-"));
    try {
        mkdirSync(join(root, "src"));
        writeFileSync(join(root, "index.html"), html);
        writeFileSync(join(root, "src", "main.js"), "document.title = 'ok';\n");
        await build({
            root,
            configFile: false,
            logLevel: "silent",
            plugins: plugins as never,
        });
        return readFileSync(join(root, "dist", "index.html"), "utf8");
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

/**
 * The text of every inline `<script>` element of a page.
 *
 * @param html - The page.
 * @returns The inline script bodies, in document order.
 */
function inlineScripts(html: string): string[] {
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
        (match) => match[1]!,
    );
}

describe("tempestThemeInit — a real vite build, no mocks", () => {
    it("puts the anti-flash script first in <head>, before any stylesheet or module", async () => {
        const html = await buildPage([tempestThemeInit()]);
        const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
        expect(inlineScripts(html)).toEqual([themeInitScript()]);
        expect(head.indexOf(themeInitScript())).toBeLessThan(head.indexOf("<meta"));
        expect(html.indexOf(themeInitScript())).toBeLessThan(html.indexOf('type="module"'));
    }, 30_000);

    it("is allowed by tempestCsp through its SHA-256 hash, never 'unsafe-inline'", async () => {
        const html = await buildPage([tempestThemeInit(), tempestCsp({ env: false })]);
        const [script] = inlineScripts(html);
        const hash = `'sha256-${createHash("sha256").update(script!, "utf8").digest("base64")}'`;
        const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
        const scriptSrc = policy?.split(";").find((part) => part.trim().startsWith("script-src"));
        expect(scriptSrc).toContain(hash);
        expect(scriptSrc).not.toContain("'unsafe-inline'");
    }, 30_000);

    it("embeds the storage key and default theme it was given", async () => {
        const html = await buildPage([
            tempestThemeInit({ storageKey: "app-theme", defaultTheme: "dark" }),
        ]);
        expect(inlineScripts(html)).toEqual([
            themeInitScript({ storageKey: "app-theme", defaultTheme: "dark" }),
        ]);
    }, 30_000);

    it("does not run the script twice when index.html already carries the same snippet", async () => {
        const manual = PAGE.replace("<head>", `<head>\n    <script>${themeInitScript()}</script>`);
        const html = await buildPage([tempestThemeInit()], manual);
        expect(inlineScripts(html)).toEqual([themeInitScript()]);
    }, 30_000);
});
