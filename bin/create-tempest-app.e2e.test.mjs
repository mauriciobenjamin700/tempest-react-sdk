import { spawnSync } from "node:child_process";
import {
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "create-tempest-app.mjs");

let root;
let proj;
let outside;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cta-"));
    proj = join(root, "proj");
    outside = join(root, "outside");
    mkdirSync(proj);
    mkdirSync(outside);
    writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "mine" }));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/**
 * Run `create-tempest-app .` in `proj` (merge mode) and return its output.
 *
 * @returns {{ status: number | null, stdout: string }}
 */
function scaffoldHere() {
    const result = spawnSync(process.execPath, [CLI, "."], {
        cwd: proj,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
    });
    return { status: result.status, stdout: result.stdout + result.stderr };
}

describe("create-tempest-app merge mode never writes through a symlink (#436)", () => {
    it("a symlinked src/ pointing outside the project is skipped, not written into", () => {
        writeFileSync(join(outside, "main.tsx"), "OUTSIDE-USER-FILE");
        symlinkSync("../outside", join(proj, "src"));

        const { status, stdout } = scaffoldHere();

        expect(status).toBe(0);
        expect(readFileSync(join(outside, "main.tsx"), "utf8")).toBe("OUTSIDE-USER-FILE");
        expect(readdirSync(outside)).toEqual(["main.tsx"]);
        expect(stdout).toMatch(/· src\b/);
        expect(lstatSync(join(proj, "src")).isSymbolicLink()).toBe(true);
    });

    it("a symlinked nested directory is skipped while its siblings are still written", () => {
        mkdirSync(join(proj, "src"));
        symlinkSync("../../outside", join(proj, "src", "pages"));

        const { status, stdout } = scaffoldHere();

        expect(status).toBe(0);
        expect(readdirSync(outside)).toEqual([]);
        expect(stdout).toMatch(/· src[/\\]pages\b/);
        expect(existsSync(join(proj, "src", "main.tsx"))).toBe(true);
    });

    it("a symlinked package.json is not merged through", () => {
        rmSync(join(proj, "package.json"));
        writeFileSync(join(outside, "package.json"), '{"name":"outside"}');
        symlinkSync("../outside/package.json", join(proj, "package.json"));

        const { status, stdout } = scaffoldHere();

        expect(status).toBe(0);
        expect(readFileSync(join(outside, "package.json"), "utf8")).toBe('{"name":"outside"}');
        expect(stdout).toMatch(/· package\.json\b/);
    });

    it("leaves the user's own _gitignore alone instead of renaming it over .gitignore", () => {
        mkdirSync(join(proj, "notes"));
        writeFileSync(join(proj, "notes", "_gitignore"), "user-underscore");
        writeFileSync(join(proj, "notes", ".gitignore"), "user-dot");

        const { status } = scaffoldHere();

        expect(status).toBe(0);
        expect(readFileSync(join(proj, "notes", "_gitignore"), "utf8")).toBe("user-underscore");
        expect(readFileSync(join(proj, "notes", ".gitignore"), "utf8")).toBe("user-dot");
        expect(existsSync(join(proj, ".gitignore"))).toBe(true);
        expect(existsSync(join(proj, "_gitignore"))).toBe(false);
    });

    it("still scaffolds the full template into a plain directory", () => {
        const { status } = scaffoldHere();

        expect(status).toBe(0);
        expect(existsSync(join(proj, "src", "main.tsx"))).toBe(true);
        expect(existsSync(join(proj, ".env.example"))).toBe(true);
        expect(JSON.parse(readFileSync(join(proj, "package.json"), "utf8")).name).toBe("mine");
    });
});
