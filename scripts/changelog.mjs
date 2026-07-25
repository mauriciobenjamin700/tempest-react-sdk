#!/usr/bin/env node
/**
 * CHANGELOG helper shared by the release pipeline.
 *
 * Two commands:
 *
 *   node scripts/changelog.mjs notes <version> [--allow-unreleased]
 *       Prints the body of the `## [<version>]` section (heading excluded) to
 *       stdout, for use as GitHub Release notes. With `--allow-unreleased` it
 *       falls back to the `## [Unreleased]` body when that version has no
 *       section yet (a release cut before the section was dated); without the
 *       flag it never does, so backfilling an old tag cannot staple the next
 *       cycle's notes onto it. When no section is found it prints a one-line
 *       pointer — a release is never blocked by missing notes.
 *
 *   node scripts/changelog.mjs close <version> [<date>]
 *       Rewrites `## [Unreleased]` into `## [<version>] — <date>` in place and
 *       seeds a fresh empty `## [Unreleased]` above it, so the tag that goes out
 *       carries a dated section and the next cycle starts clean. No-ops when the
 *       version section already exists. `<date>` defaults to today (UTC).
 *
 * Exits non-zero only on genuine failure (bad usage, unreadable CHANGELOG),
 * never for "there was nothing to do".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const UNRELEASED_HEADING = "## [Unreleased]";

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Slice the body of one `## [...]` section out of the CHANGELOG.
 *
 * Matches the heading loosely (`## [1.2.3]`, with or without a trailing date)
 * and stops at the next `## ` heading, so a section keeps all of its `###`
 * subsections.
 */
function sectionBody(text, version) {
    const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\].*$`, "m");
    const start = text.search(heading);
    if (start === -1) return null;
    const after = text.slice(start);
    const nextHeading = after.slice(1).search(/^## /m);
    const body = nextHeading === -1 ? after : after.slice(0, nextHeading + 1);
    return body.replace(heading, "").trim();
}

/**
 * Body to use as Release notes for `version`.
 *
 * Only falls back to the `## [Unreleased]` body when `allowUnreleased` is set —
 * that fallback is for a release cut before the section was dated, and would be
 * plain wrong when backfilling an old tag (it would staple the next cycle's
 * notes onto a historical release).
 */
function notes(version, allowUnreleased) {
    const text = readFileSync(CHANGELOG, "utf8");
    const exact = sectionBody(text, version);
    if (exact) return exact;
    const unreleased = allowUnreleased ? sectionBody(text, "Unreleased") : null;
    if (unreleased) return unreleased;
    return `Sem entrada de CHANGELOG para ${version}. Veja o histórico completo em CHANGELOG.md.`;
}

function close(version, date) {
    const text = readFileSync(CHANGELOG, "utf8");
    if (sectionBody(text, version) !== null) {
        return { changed: false, reason: `seção [${version}] já existe` };
    }
    if (!text.includes(UNRELEASED_HEADING)) {
        return { changed: false, reason: `${UNRELEASED_HEADING} não encontrado` };
    }
    const dated = `## [${version}] — ${date}`;
    const next = text.replace(UNRELEASED_HEADING, `${UNRELEASED_HEADING}\n\n${dated}`);
    writeFileSync(CHANGELOG, next);
    return { changed: true, reason: `${UNRELEASED_HEADING} → ${dated}` };
}

const argv = process.argv.slice(2);
const allowUnreleased = argv.includes("--allow-unreleased");
const [command, version, date] = argv.filter((arg) => !arg.startsWith("--"));

if (!command || !version) {
    console.error("usage: changelog.mjs <notes|close> <version> [date] [--allow-unreleased]");
    process.exit(1);
}

if (command === "notes") {
    process.stdout.write(`${notes(version, allowUnreleased)}\n`);
} else if (command === "close") {
    const stamp = date ?? new Date().toISOString().slice(0, 10);
    const result = close(version, stamp);
    console.log(
        result.changed ? `✓ CHANGELOG: ${result.reason}` : `· CHANGELOG intacto (${result.reason})`,
    );
} else {
    console.error(`unknown command: ${command}`);
    process.exit(1);
}
