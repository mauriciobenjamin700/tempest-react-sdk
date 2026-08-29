#!/usr/bin/env node
// @ts-check

/**
 * Capture one screenshot per gallery section into `docs/assets/gallery/`.
 *
 * The documentation of a UI SDK that shows nothing is asking the reader to
 * imagine the component before choosing it. This script is what keeps the
 * pictures honest: they are taken from `examples/gallery` running its
 * production build against the built `dist/`, so a component that regressed
 * visually cannot keep an old screenshot.
 *
 * Output is **WebP written into the repository**, not a build artifact, because
 * the requirement is that the same image renders on the MkDocs site *and* in
 * the `.md` as GitHub renders it. A relative `../assets/gallery/<id>.webp`
 * resolves in both: GitHub walks the repository tree, MkDocs rewrites relative
 * links on build.
 *
 * WebP costs no new dependency: Chromium encodes it. The PNG buffer Playwright
 * returns is drawn onto a canvas inside the page and read back through
 * `toDataURL("image/webp")`, which halves the bytes against PNG at a quality
 * indistinguishable for flat UI.
 *
 * Files are only written when their bytes change, so re-running on an unchanged
 * gallery produces an empty `git status` and adds no blob to the history.
 *
 * Usage:
 *   npm run docs:shots              # light for every section, dark for the curated set
 *   npm run docs:shots -- --dark=all    # dark for every section too
 *   npm run docs:shots -- --only=buttons,data-table
 *   npm run docs:shots -- --check   # write nothing; exit 1 if any file would change
 *
 * Requires the SDK and the gallery to be built first (`npm run e2e:build`).
 */

import { spawn } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const GALLERY_DIR = join(REPO_ROOT, "examples", "gallery");
const OUT_DIR = join(REPO_ROOT, "docs", "assets", "gallery");
const ORIGIN = "http://127.0.0.1:4173";

/** Viewport used for every capture. Fixed so a re-run produces the same pixels. */
const VIEWPORT = { width: 1280, height: 900 };

/**
 * Tallest slice captured from a section, in CSS pixels.
 *
 * Some sections run past 4000px. A picture that long is unreadable inline and
 * costs more bytes than the rest of the page combined, so the capture is the
 * top of the section — the part that shows what the component looks like.
 */
const MAX_HEIGHT = 1400;

/** WebP quality. 0.8 is where flat UI stops losing anything a reader can see. */
const WEBP_QUALITY = 0.8;

/**
 * Sections captured in dark as well as light.
 *
 * Every section looks different in dark, so capturing all of them would double
 * the bytes to re-prove the same tokens. These are the ones where dark *is* the
 * point: the theme surfaces themselves, and the dense components where readers
 * ask whether the contrast holds.
 */
const DARK_SECTIONS = new Set([
    "foundation",
    "theme-i18n",
    "theme-factory",
    "buttons",
    "data-table",
    "data-display",
    "feedback",
    "overlays",
    "codeblock",
    "dashboard-layout",
]);

/**
 * Parse the `--flag=value` arguments this script accepts.
 *
 * @returns {{ dark: "curated" | "all" | "none", only: string[] | null, check: boolean }}
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const get = (name) => {
        const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
        if (!hit) return null;
        const eq = hit.indexOf("=");
        return eq === -1 ? "" : hit.slice(eq + 1);
    };
    const dark = get("dark");
    const only = get("only");
    return {
        dark: dark === "all" ? "all" : dark === "none" ? "none" : "curated",
        only: only
            ? only
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
            : null,
        check: args.includes("--check"),
    };
}

/**
 * Start `vite preview` for the gallery and resolve once it answers.
 *
 * @returns {Promise<() => void>} A function that stops the server.
 */
async function startPreview() {
    if (!existsSync(join(GALLERY_DIR, "dist", "index.html"))) {
        throw new Error("gallery build missing — run `npm run e2e:build` first");
    }
    const child = spawn(
        "npm",
        ["--prefix", GALLERY_DIR, "run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"],
        { stdio: "ignore", detached: false },
    );
    const deadline = Date.now() + 60_000;
    for (;;) {
        try {
            const response = await fetch(ORIGIN, { signal: AbortSignal.timeout(2000) });
            if (response.ok) break;
        } catch {
            /* server not up yet */
        }
        if (Date.now() > deadline) {
            child.kill();
            throw new Error(`preview server did not answer on ${ORIGIN} within 60s`);
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return () => child.kill();
}

/**
 * Freeze the sources of per-run variation before any application code runs.
 *
 * `Math.random` is seeded so demo data that is generated rather than fixed lands
 * on the same values every run, and the clock is pinned so a section rendering
 * `formatDateTime(new Date())` stops producing a new image every minute. Without
 * both, a re-run rewrites files and the diff stops meaning "the component
 * changed".
 *
 * Only the argument-less `Date` is frozen: parsing a literal has to keep working,
 * because demo data is full of them. React schedules on `performance.now`, which
 * is untouched.
 *
 * @param {import("@playwright/test").Page} page - The page to instrument.
 */
async function freezeEntropy(page) {
    await page.addInitScript(() => {
        let seed = 0x2f6e2b1;
        Math.random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };

        const FROZEN = Date.parse("2026-03-14T15:09:00Z");
        const RealDate = Date;
        const FakeDate = function (...args) {
            return args.length === 0 ? new RealDate(FROZEN) : new RealDate(...args);
        };
        FakeDate.prototype = RealDate.prototype;
        FakeDate.now = () => FROZEN;
        FakeDate.parse = RealDate.parse;
        FakeDate.UTC = RealDate.UTC;
        globalThis.Date = FakeDate;
    });
}

/**
 * Stop animation, transition and caret blink so a capture is not a race.
 *
 * @param {import("@playwright/test").Page} page - The loaded page.
 */
async function freezeMotion(page) {
    await page.addStyleTag({
        content: `*, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
            caret-color: transparent !important;
            scroll-behavior: auto !important;
        }`,
    });
}

/**
 * Encode a PNG buffer as WebP using the browser's own encoder.
 *
 * @param {import("@playwright/test").Page} page - Any loaded page.
 * @param {Buffer} png - The PNG bytes from a Playwright screenshot.
 * @returns {Promise<Buffer>} The WebP bytes.
 */
async function toWebp(page, png) {
    const dataUrl = await page.evaluate(
        async ([base64, quality]) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("2d context unavailable");
            context.drawImage(image, 0, 0);
            return canvas.toDataURL("image/webp", quality);
        },
        [png.toString("base64"), WEBP_QUALITY],
    );
    if (!dataUrl.startsWith("data:image/webp")) {
        throw new Error("Chromium refused to encode WebP");
    }
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

/**
 * Write a file only when its bytes differ from what is already on disk.
 *
 * @param {string} path - Destination path.
 * @param {Buffer} bytes - The content to store.
 * @param {boolean} check - When true, report the difference without writing.
 * @returns {"created" | "updated" | "unchanged"} What happened.
 */
function writeIfChanged(path, bytes, check) {
    if (existsSync(path)) {
        if (readFileSync(path).equals(bytes)) return "unchanged";
        if (!check) writeFileSync(path, bytes);
        return "updated";
    }
    if (!check) writeFileSync(path, bytes);
    return "created";
}

/**
 * Capture every section of the gallery in one theme.
 *
 * The sections all live on a single page, so the page is loaded once and each
 * `section.gallery-section[id]` is clipped out of it in turn.
 *
 * @param {import("@playwright/test").Browser} browser - The running browser.
 * @param {"light" | "dark"} scheme - Colour scheme to emulate.
 * @param {(id: string) => boolean} wanted - Whether a section id should be captured.
 * @param {boolean} check - Pass through to `writeIfChanged`.
 * @returns {Promise<{ id: string, status: string, bytes: number }[]>} One row per capture.
 */
async function captureTheme(browser, scheme, wanted, check) {
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        colorScheme: scheme,
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await freezeEntropy(page);
    await page.goto(ORIGIN, { waitUntil: "load" });
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await freezeMotion(page);
    await page.waitForTimeout(500);

    const ids = await page.evaluate(() =>
        [...document.querySelectorAll("section.gallery-section[id]")].map((el) => el.id),
    );

    /** @type {{ id: string, status: string, bytes: number }[]} */
    const rows = [];
    for (const id of ids) {
        if (!wanted(id)) continue;
        const target = page.locator(`#${id}`);
        const box = await target.boundingBox();
        if (!box) continue;
        await page.evaluate((sectionId) => {
            document.getElementById(sectionId)?.scrollIntoView({ block: "start" });
        }, id);
        await page.waitForTimeout(120);
        const settled = await target.boundingBox();
        if (!settled) continue;
        const png = await page.screenshot({
            clip: {
                x: Math.max(0, settled.x),
                y: Math.max(0, settled.y),
                width: Math.min(settled.width, VIEWPORT.width),
                height: Math.min(settled.height, MAX_HEIGHT),
            },
        });
        const webp = await toWebp(page, png);
        const name = scheme === "dark" ? `${id}.dark.webp` : `${id}.webp`;
        const status = writeIfChanged(join(OUT_DIR, name), webp, check);
        rows.push({ id: name, status, bytes: webp.length });
    }

    await context.close();
    return rows;
}

/**
 * Entry point.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const { dark, only, check } = parseArgs();
    mkdirSync(OUT_DIR, { recursive: true });

    const stop = await startPreview();
    const browser = await chromium.launch();
    /** @type {{ id: string, status: string, bytes: number }[]} */
    let rows = [];
    try {
        const inScope = (id) => (only ? only.includes(id) : true);
        rows = rows.concat(await captureTheme(browser, "light", inScope, check));
        if (dark !== "none") {
            const wantsDark = (id) => inScope(id) && (dark === "all" || DARK_SECTIONS.has(id));
            rows = rows.concat(await captureTheme(browser, "dark", wantsDark, check));
        }
    } finally {
        await browser.close();
        stop();
    }

    const written = rows.filter((r) => r.status !== "unchanged");
    const total = rows.reduce((sum, r) => sum + r.bytes, 0);
    for (const row of written) {
        console.log(
            `docs-shots: ${row.status.padEnd(9)} ${row.id} (${Math.round(row.bytes / 1024)} KB)`,
        );
    }
    console.log(
        `docs-shots: ${rows.length} captures, ${written.length} changed, ${Math.round(total / 1024)} KB total`,
    );

    const known = new Set(rows.map((r) => r.id));
    if (!only) {
        const orphans = readdirSync(OUT_DIR).filter((f) => f.endsWith(".webp") && !known.has(f));
        for (const orphan of orphans) {
            if (!check) unlinkSync(join(OUT_DIR, orphan));
            console.log(`docs-shots: ${check ? "orphan" : "removed"}   ${orphan}`);
        }
        if (check && orphans.length > 0)
            written.push(...orphans.map((f) => ({ id: f, status: "orphan", bytes: 0 })));
    }

    if (check && written.length > 0) {
        console.error("docs-shots: screenshots are out of date — run `npm run docs:shots`");
        process.exitCode = 1;
    }
}

await main();
