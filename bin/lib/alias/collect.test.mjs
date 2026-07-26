import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectFiles } from "./collect.mjs";

let root;
let baseDir;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-collect-"));
    baseDir = join(root, "src");
    for (const rel of [
        "src/main.tsx",
        "src/lib/api.ts",
        "src/lib/api.test.ts",
        "src/styles/tokens.css",
        "src/legacy/old.js",
        "src/legacy/old.mjs",
        "src/assets/logo.svg",
        "src/README.md",
        "src/node_modules/dep/index.ts",
        "src/.cache/x.ts",
        "vite.config.ts",
        "e2e/spec.ts",
        "dist/bundle.js",
    ]) {
        const path = join(root, rel);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, "");
    }
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Collect and return repo-relative paths with a POSIX separator. */
function collect(targets) {
    return collectFiles({ root, targets, baseDir }).map((f) => ({
        path: relative(root, f.path).split("\\").join("/"),
        kind: f.kind,
    }));
}

describe("collectFiles — extensions", () => {
    it("keeps source and style files, drops everything else", () => {
        expect(collect(["."])).toEqual([
            { path: "src/legacy/old.js", kind: "source" },
            { path: "src/legacy/old.mjs", kind: "source" },
            { path: "src/lib/api.test.ts", kind: "source" },
            { path: "src/lib/api.ts", kind: "source" },
            { path: "src/main.tsx", kind: "source" },
            { path: "src/styles/tokens.css", kind: "style" },
        ]);
    });
    it("drops an asset that carries no specifier of its own", () => {
        expect(collect(["src/assets/logo.svg"])).toEqual([]);
        expect(collect(["src/README.md"])).toEqual([]);
    });
});

describe("collectFiles — scope", () => {
    it("narrows a project-root target to the alias base", () => {
        expect(collect(["."]).every((f) => f.path.startsWith("src/"))).toBe(true);
    });
    it("restricts to a positional subdirectory", () => {
        expect(collect(["src/lib"]).map((f) => f.path)).toEqual([
            "src/lib/api.test.ts",
            "src/lib/api.ts",
        ]);
    });
    it("accepts a single file target", () => {
        expect(collect(["src/main.tsx"]).map((f) => f.path)).toEqual(["src/main.tsx"]);
    });
    it("yields nothing for a target outside the alias base", () => {
        expect(collect(["e2e"])).toEqual([]);
        expect(collect(["vite.config.ts"])).toEqual([]);
    });
    it("skips node_modules, dist and dot directories inside the base", () => {
        const paths = collect(["."]).map((f) => f.path);
        expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
        expect(paths.some((p) => p.includes(".cache"))).toBe(false);
    });
    it("ignores a target that does not exist", () => {
        expect(collect(["src/nope"])).toEqual([]);
    });
    it("deduplicates overlapping targets", () => {
        expect(collect(["src/lib", "src/lib/api.ts"]).map((f) => f.path)).toEqual([
            "src/lib/api.test.ts",
            "src/lib/api.ts",
        ]);
    });
});
