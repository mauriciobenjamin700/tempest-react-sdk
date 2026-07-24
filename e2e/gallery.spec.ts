import { createRequire } from "node:module";
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");

interface AxeViolation {
    id: string;
    help: string;
    nodes: { target: string[] }[];
}

/**
 * Collect `console.error` / `console.warn` output and page exceptions.
 *
 * React logs prop-type violations, key warnings and hook misuse through the
 * console, so a clean console is a real signal that the components mounted the
 * way they were meant to. Returns the accumulating array — read it after the
 * navigation settles.
 *
 * @param page - The page to instrument. Call before `goto`.
 * @returns Messages seen so far, as `"level: text"` strings.
 */
function watchConsole(page: Page): string[] {
    const messages: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
        if (message.type() !== "error" && message.type() !== "warning") return;
        if (isEnvironmentNoise(message.text())) return;
        messages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
    return messages;
}

/**
 * Whether a console line is about the sandbox rather than about the code.
 *
 * Some gallery demos talk to public endpoints (the WebSocket echo server, tile
 * providers). A machine with no outbound network — CI included — logs transport
 * failures for them, which says nothing about whether the components work.
 * Everything else, React warnings above all, still fails the test.
 *
 * @param text - The console message text.
 * @returns `true` when the line should be ignored.
 */
function isEnvironmentNoise(text: string): boolean {
    return (
        text.includes("net::ERR_") ||
        text.includes("Failed to load resource") ||
        text.includes("WebSocket connection to")
    );
}

/**
 * Run axe-core inside the real browser and return the violations.
 *
 * Unlike the jsdom sweep in `src/components/a11y.test.tsx`, this pass has real
 * layout and paint, so colour-contrast and visibility rules actually run here.
 *
 * @param page - Page with the gallery already loaded.
 * @returns Violations, empty when the page is clean.
 */
async function runAxe(page: Page): Promise<AxeViolation[]> {
    await page.addScriptTag({ path: AXE_PATH });
    return page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<unknown> } })
            .axe;
        const results = (await axe.run(document)) as { violations: AxeViolation[] };
        return results.violations;
    });
}

function formatViolations(violations: AxeViolation[]): string {
    return violations
        .map((v) => `[${v.id}] ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n");
}

test.describe("gallery smoke", () => {
    test("boots every section with a clean console", async ({ page }) => {
        const messages = watchConsole(page);
        await page.goto("/");

        await expect(
            page.getByRole("heading", { level: 1, name: "tempest-react-sdk" }),
        ).toBeVisible();
        const sectionLinks = page.locator(".gallery-nav a");
        expect(await sectionLinks.count()).toBeGreaterThan(20);

        await page.waitForLoadState("networkidle");
        expect(messages, `console output:\n${messages.join("\n")}`).toEqual([]);
    });

    test("filters sections through the search box", async ({ page }) => {
        await page.goto("/");
        const search = page.getByLabel("Buscar seções");
        const before = await page.locator(".gallery-nav a").count();

        await search.fill("button");
        const after = await page.locator(".gallery-nav a").count();
        expect(after).toBeGreaterThan(0);
        expect(after).toBeLessThan(before);

        await search.fill("zzzznotacomponent");
        await expect(page.locator(".gallery-empty")).toBeVisible();
    });

    test("switches theme and locale", async ({ page }) => {
        await page.goto("/");
        const root = page.locator("html");

        const themeGroup = page.locator(".gallery-controls .theme-toggle-group");
        await themeGroup.getByRole("button", { name: "dark", exact: true }).click();
        await expect(root).toHaveAttribute("data-tempest-theme", "dark");

        await themeGroup.getByRole("button", { name: "light", exact: true }).click();
        await expect(root).toHaveAttribute("data-tempest-theme", "light");

        const langToggle = page.locator(".lang-toggle");
        const initial = (await langToggle.textContent())?.trim();
        await langToggle.click();
        await expect(langToggle).not.toHaveText(initial ?? "");
    });

    test("does not overflow horizontally on a phone viewport", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "page scrolls sideways on a 390px viewport").toBeLessThanOrEqual(0);
    });

    test("has no critical or serious axe violations", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const violations = await runAxe(page);
        const blocking = violations.filter((v) =>
            ["color-contrast", "aria-required-attr", "button-name", "image-alt", "label"].includes(
                v.id,
            ),
        );
        expect(formatViolations(blocking)).toBe("");
    });
});
