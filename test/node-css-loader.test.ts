import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The loader the package ships so plain Node can import it.
 *
 * Every component module imports its own stylesheet — that is what lets a bundler
 * drop the CSS of a component the app never mounts — and Node has no loader for
 * `.css`. This suite pins both halves: that Node really does fail without the
 * loader (the reason it exists), and that it stops failing with it.
 *
 * It runs against a fixture rather than `dist/`, because the test suite runs
 * before the build in CI and a test that needs `dist/` would only ever be skipped.
 */
const LOADER = resolve(import.meta.dirname, "..", "loader", "css-loader.mjs");

/**
 * Write a module that imports a stylesheet, and run it.
 *
 * @param withLoader - Whether to preload the SDK's CSS loader.
 * @returns The process output, or the error text when it exits non-zero.
 */
function runFixture(withLoader: boolean, entry: "esm" | "cjs" = "esm"): string {
    const dir = mkdtempSync(join(tmpdir(), "tempest-css-loader-"));
    writeFileSync(join(dir, "sheet.css"), ".a{color:red}");
    const file = join(dir, entry === "esm" ? "entry.mjs" : "entry.cjs");
    writeFileSync(
        file,
        entry === "esm"
            ? 'import "./sheet.css";\nconsole.log("LOADED");\n'
            : 'require("./sheet.css");\nconsole.log("LOADED");\n',
    );
    const args = withLoader ? ["--import", LOADER, file] : [file];
    try {
        return execFileSync(process.execPath, args, { encoding: "utf8", stdio: "pipe" });
    } catch (error) {
        const shaped = error as { stderr?: string; message?: string };
        return shaped.stderr ?? shaped.message ?? "";
    }
}

describe("the shipped Node CSS loader", () => {
    it("is the reason importing a stylesheet fails in plain Node", () => {
        expect(runFixture(false)).toContain("ERR_UNKNOWN_FILE_EXTENSION");
    });

    it("makes an ESM stylesheet import a no-op", () => {
        expect(runFixture(true)).toContain("LOADED");
    });

    it("covers `require` too, which `register()` alone does not", () => {
        expect(runFixture(false, "cjs")).toContain("SyntaxError");
        expect(runFixture(true, "cjs")).toContain("LOADED");
    });
});

describe("the package publishes the loader", () => {
    it("exports it as a subpath, so a consumer never writes one", async () => {
        const pkg = (await import("../package.json")) as unknown as {
            default: { exports: Record<string, unknown>; files: string[] };
        };
        expect(pkg.default.exports["./node-css-loader"]).toBe("./loader/css-loader.mjs");
        expect(pkg.default.files).toContain("loader");
    });
});
