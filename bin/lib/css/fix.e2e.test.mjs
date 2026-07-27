import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tempest.mjs");

let root;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-fix-css-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Write a file under the fixture, creating parent directories. */
function write(rel, contents) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    return path;
}

/**
 * Run `tempest fix` in the fixture.
 *
 * `--no-alias` keeps the run to the CSS pass: the alias pass needs TypeScript and
 * a `paths` entry, neither of which this fixture has, and its "skipping" notice
 * would be the loudest line in the output.
 */
function fix(args = []) {
    const result = spawnSync(process.execPath, [CLI, "fix", "--no-alias", ...args], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("tempest fix — the CSS pass", () => {
    it("removes dead declarations and reports each one", () => {
        const file = write("src/app.css", ".a {\n    color: red;\n    color: red;\n}\n");
        const { out } = fix();
        expect(out).toContain("→ css");
        expect(out).toContain("removed duplicate `color`");
        expect(readFileSync(file, "utf8")).toBe(".a {\n    color: red;\n}\n");
    });

    it("writes nothing under --dry-run", () => {
        const before = ".a {\n    color: red;\n    color: red;\n}\n";
        const file = write("src/app.css", before);
        const { out } = fix(["--dry-run"]);
        expect(out).toContain("would remove 1");
        expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("lists the findings a human has to resolve", () => {
        write("src/app.css", ".a {\n    color: red;\n    color: blue;\n}\n");
        const { out } = fix(["--dry-run"]);
        expect(out).toContain("overrides");
        expect(out).toContain("nothing to remove");
    });

    it("refuses to write to a sheet with a syntax error, and exits non-zero", () => {
        const before = ".a {\n    color: red;\n    color: red;\n";
        const file = write("src/app.css", before);
        const { out, code } = fix();
        expect(out).toContain("CSS syntax error(s)");
        expect(readFileSync(file, "utf8")).toBe(before);
        expect(code).toBe(1);
    });

    it("honors a path argument", () => {
        const touched = write("src/a.css", ".a {\n    color: red;\n    color: red;\n}\n");
        const other = write("src/b.css", ".b {\n    color: red;\n    color: red;\n}\n");
        fix([join("src", "a.css")]);
        expect(readFileSync(touched, "utf8")).toBe(".a {\n    color: red;\n}\n");
        expect(readFileSync(other, "utf8")).toContain("color: red;\n    color: red;");
    });

    it("skips the pass entirely with --no-css", () => {
        const before = ".a {\n    color: red;\n    color: red;\n}\n";
        const file = write("src/app.css", before);
        const { out } = fix(["--no-css", "--dry-run"]);
        expect(out).not.toContain("→ css");
        expect(readFileSync(file, "utf8")).toBe(before);
    });

    it("rejects an unknown flag instead of forwarding it", () => {
        const { out, code } = fix(["--no-such-flag"]);
        expect(out).toContain("Unknown flag for fix");
        expect(code).toBe(1);
    });
});
