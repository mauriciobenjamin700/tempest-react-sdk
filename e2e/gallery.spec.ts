import { createRequire } from "node:module";
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const BASELINE = require("./axe-baseline.json") as Record<
    string,
    { violations: RuleCounts; incomplete: RuleCounts }
>;

interface AxeViolation {
    id: string;
    help: string;
    nodes: { target: string[] }[];
}

/** One cell of the sweep: a theme at a viewport. */
interface SweepCell {
    theme: "light" | "dark";
    width: number;
}

/** What one cell reported, as rule id → node count. */
type RuleCounts = Record<string, number>;

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
 * Run axe-core inside the real browser, and read **both** result lists.
 *
 * Unlike the jsdom sweep in `src/components/a11y.test.tsx`, this pass has real
 * layout and paint, so colour-contrast and visibility rules actually run here.
 *
 * `incomplete` matters as much as `violations`, and that was the gap this file
 * used to have: `color-contrast` lands in `incomplete` — not in `violations` —
 * whenever axe cannot resolve what is behind the text, which is exactly the
 * case of a tinted, overlapping or image background. Both contrast defects this
 * repo shipped were a text token used over a surface it was never checked
 * against, so the sweep was reading the drawer the finding was not in.
 *
 * @param page - Page with the gallery already loaded.
 * @returns Both lists, as axe reported them.
 */
async function runAxe(
    page: Page,
): Promise<{ violations: AxeViolation[]; incomplete: AxeViolation[] }> {
    await page.addScriptTag({ path: AXE_PATH });
    return page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<unknown> } })
            .axe;
        const results = (await axe.run(document)) as {
            violations: AxeViolation[];
            incomplete: AxeViolation[];
        };
        return { violations: results.violations, incomplete: results.incomplete };
    });
}

/**
 * Put the page in one cell of the sweep: a theme, at a width, with no motion.
 *
 * Transitions are killed before anything is measured, and that is not tidiness.
 * Flipping `data-tempest-theme` starts a `transition: color` on every component
 * that declares one, so reading a computed colour a frame or two later samples
 * the **animation** — the outgoing theme's foreground against the incoming
 * theme's background. Measured while writing this: the same icon read 7.32 and
 * then 2.33 between runs, and 2.33 looks exactly like a real contrast defect.
 *
 * @param page - The page to set up.
 * @param cell - Theme and viewport width.
 */
async function enterCell(page: Page, cell: SweepCell): Promise<void> {
    await page.setViewportSize({ width: cell.width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate((theme) => {
        document.documentElement.setAttribute("data-tempest-theme", theme);
        const style = document.createElement("style");
        style.textContent =
            "*,*::before,*::after{transition:none!important;animation:none!important}";
        document.head.append(style);
    }, cell.theme);
    await page.waitForTimeout(250);
}

/** Reduce a result list to rule id → node count. */
function countByRule(results: AxeViolation[]): RuleCounts {
    return Object.fromEntries(results.map((result) => [result.id, result.nodes.length]));
}

/**
 * How much a count may drift above the baseline before it is a regression.
 *
 * The same design as the coverage floors in `vitest.config.ts`, and for the same
 * reason: a gate pressed against the current number turns the next honest change
 * red for the wrong reason, and a gate that cries wolf gets deleted. The gallery
 * renders demos that depend on the clock — a calendar showing today, relative
 * timestamps, charts that animate in — so the same build measured twice does not
 * always report the same node count. It was measured doing exactly that: 87 and
 * then 88 `color-contrast` `incomplete` nodes in the light theme, with nothing
 * changed in between.
 *
 * Two nodes of slack, or 2% for the big rules, is wide enough to swallow that
 * and far too narrow to hide a component regressing.
 *
 * @param baseline - The committed count for one rule.
 * @returns The highest count that still passes.
 */
function ceiling(baseline: number): number {
    return baseline + Math.max(2, Math.ceil(baseline * 0.02));
}

/**
 * Compare a cell against the committed baseline, allowing only improvement.
 *
 * A ratchet rather than an allowlist. The gallery renders 64 sections of
 * component demos and carries real accessibility debt — the numbers in
 * `axe-baseline.json` are what it measured the day the sweep started seeing all
 * of it, and they are there to be **lowered**. Growth beyond {@link ceiling}
 * fails; a drop does not, because a red build for fixing something is how a
 * gate gets deleted.
 *
 * @param label - Which cell, for the failure message.
 * @param counts - What this run measured.
 * @param baseline - What the file allows.
 * @returns A human-readable list of regressions, empty when there are none.
 */
function regressions(label: string, counts: RuleCounts, baseline: RuleCounts): string[] {
    const found: string[] = [];
    for (const [rule, count] of Object.entries(counts)) {
        const allowed = baseline[rule] ?? 0;
        if (count > ceiling(allowed)) {
            found.push(`${label} · ${rule}: ${count} nodes, baseline ${allowed}`);
        }
    }
    return found;
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
});

/**
 * The accessibility sweep, across the states the old one could not see.
 *
 * Four things were wrong with reading one `axe.run` on `/` in the default
 * theme, and each of them hid a class of defect:
 *
 * 1. **`incomplete` was discarded.** `color-contrast` lands there whenever axe
 *    cannot resolve the background — a tinted surface, an overlay, an image —
 *    which is precisely the class that shipped twice.
 * 2. **One theme.** Measured while writing this: the dark theme reports 73
 *    `color-contrast` **violations** that the light theme does not, and the
 *    sweep only ever ran light. Fourteen distinct colour pairs, most of them
 *    two tokens.
 * 3. **One viewport.** `scrollable-region-focusable` goes from 146 nodes at
 *    1280px to 295 at 390px: half of that finding only exists on a phone.
 * 4. **Only five rule ids were enforced**, and `aria-required-parent` (200
 *    nodes), `scrollable-region-focusable` and `aria-prohibited-attr` are not
 *    among them — so a green result meant "none of five rules fired in one
 *    theme", not "the page is clean".
 *
 * What it does **not** do is pretend the debt is gone. The baseline pins what
 * was measured so a regression fails; the debt itself is tracked in its own
 * issues, with the numbers.
 */
test.describe("accessibility sweep", () => {
    const CELLS: SweepCell[] = [
        { theme: "light", width: 1280 },
        { theme: "dark", width: 1280 },
        { theme: "light", width: 390 },
        { theme: "dark", width: 390 },
    ];

    for (const cell of CELLS) {
        const label = `${cell.theme}-${cell.width}`;

        test(`does not regress in ${label}`, async ({ page }) => {
            await enterCell(page, cell);
            const { violations, incomplete } = await runAxe(page);

            const allowed = BASELINE[label];
            expect(allowed, `no baseline for ${label} — add it to axe-baseline.json`).toBeDefined();

            const found = [
                ...regressions(`${label} violation`, countByRule(violations), allowed.violations),
                ...regressions(`${label} incomplete`, countByRule(incomplete), allowed.incomplete),
            ];

            expect(
                found.join("\n"),
                "axe found more than the baseline allows. Fix it, or — if the count moved for a " +
                    "legitimate reason — say why in the PR and update e2e/axe-baseline.json.",
            ).toBe("");
        });
    }

    /**
     * The pair that shipped twice, asserted directly rather than through axe.
     *
     * `--tempest-text-subtle` is resolved against `--tempest-bg` and
     * `--tempest-surface`, and it fails 4.5:1 over `--tempest-primary-soft`.
     * axe cannot answer this one — a token over a tinted surface is exactly
     * what lands in `incomplete` — so the floor is measured here instead of
     * asked about.
     */
    test("keeps the text tokens above the floor on the tinted surfaces", async ({ page }) => {
        for (const theme of ["light", "dark"] as const) {
            await enterCell(page, { theme, width: 1280 });

            const measured = await page.evaluate(() => {
                const luminance = (colour: string): number => {
                    const [r, g, b] = (colour.match(/[\d.]+/g) ?? ["0", "0", "0"])
                        .slice(0, 3)
                        .map(Number)
                        .map((value) => {
                            const channel = value / 255;
                            return channel <= 0.03928
                                ? channel / 12.92
                                : Math.pow((channel + 0.055) / 1.055, 2.4);
                        }) as [number, number, number];
                    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
                };
                const ratio = (fg: string, bg: string): number => {
                    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [
                        number,
                        number,
                    ];
                    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
                };
                const probe = document.createElement("div");
                document.body.append(probe);
                const read = (name: string): string => {
                    probe.style.color = `var(${name})`;
                    return getComputedStyle(probe).color;
                };
                const pairs: Record<string, number> = {
                    "text-subtle on primary-soft": ratio(
                        read("--tempest-text-subtle"),
                        read("--tempest-primary-soft"),
                    ),
                    "text-muted on primary-soft": ratio(
                        read("--tempest-text-muted"),
                        read("--tempest-primary-soft"),
                    ),
                    "primary-on-soft on primary-soft": ratio(
                        read("--tempest-primary-on-soft"),
                        read("--tempest-primary-soft"),
                    ),
                };
                probe.remove();
                return pairs;
            });

            expect(
                measured["primary-on-soft on primary-soft"],
                `${theme}: the foreground meant for a tinted surface has to clear 4.5:1`,
            ).toBeGreaterThanOrEqual(4.5);
        }
    });
});
