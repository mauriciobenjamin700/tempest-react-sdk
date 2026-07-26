import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverAlias } from "./discover.mjs";
import { readTsconfig } from "./tsconfig.mjs";
import { loadTypeScript } from "./typescript.mjs";

const ts = loadTypeScript(process.cwd());

let root;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-alias-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Write a file under the fixture root, creating parent directories. */
function write(rel, contents) {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
}

/** Create a directory under the fixture root. */
function dir(rel) {
    mkdirSync(join(root, rel), { recursive: true });
}

describe("readTsconfig", () => {
    it("returns null when there is no tsconfig", () => {
        expect(readTsconfig({ root, ts })).toBeNull();
    });
    it("reads plain JSON", () => {
        write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }));
        expect(readTsconfig({ root, ts }).compilerOptions.strict).toBe(true);
    });
    it("reads JSONC — comments and trailing commas", () => {
        write(
            "tsconfig.json",
            `{
    // the alias the SDK expects
    "compilerOptions": {
        "moduleResolution": "bundler", /* keeps subpath types resolvable */
        "paths": { "@/*": ["./src/*"] },
    },
}`,
        );
        const cfg = readTsconfig({ root, ts });
        expect(cfg.compilerOptions.moduleResolution).toBe("bundler");
        expect(cfg.compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
    });
    it("keeps option values raw instead of normalizing them to enums", () => {
        write(
            "tsconfig.json",
            JSON.stringify({ compilerOptions: { moduleResolution: "bundler", jsx: "react-jsx" } }),
        );
        const { compilerOptions } = readTsconfig({ root, ts });
        expect(compilerOptions.moduleResolution).toBe("bundler");
        expect(compilerOptions.jsx).toBe("react-jsx");
    });
    it("merges the extends chain with the extending file winning", () => {
        write(
            "tsconfig.base.json",
            JSON.stringify({ compilerOptions: { strict: false, skipLibCheck: true } }),
        );
        write(
            "tsconfig.json",
            JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { strict: true } }),
        );
        const { compilerOptions } = readTsconfig({ root, ts });
        expect(compilerOptions.strict).toBe(true);
        expect(compilerOptions.skipLibCheck).toBe(true);
    });
    it("resolves extends without the .json extension", () => {
        write("base.json", JSON.stringify({ compilerOptions: { skipLibCheck: true } }));
        write("tsconfig.json", JSON.stringify({ extends: "./base" }));
        expect(readTsconfig({ root, ts }).compilerOptions.skipLibCheck).toBe(true);
    });
    it("falls back to JSON.parse when typescript is unavailable", () => {
        write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }));
        expect(readTsconfig({ root, ts: null }).compilerOptions.strict).toBe(true);
    });
    it("returns null for unparseable JSON without typescript", () => {
        write("tsconfig.json", "{ not json");
        expect(readTsconfig({ root, ts: null })).toBeNull();
    });
});

describe("discoverAlias — from tsconfig paths", () => {
    it("finds the @/* → src/* mapping", () => {
        dir("src");
        write(
            "tsconfig.json",
            JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
        );
        expect(discoverAlias({ root, ts })).toEqual({
            prefix: "@",
            baseDir: join(root, "src"),
            source: "tsconfig",
        });
    });
    it("honours a non-@ prefix", () => {
        dir("src");
        write(
            "tsconfig.json",
            JSON.stringify({ compilerOptions: { paths: { "~/*": ["./src/*"] } } }),
        );
        expect(discoverAlias({ root, ts }).prefix).toBe("~");
    });
    it("honours an app/ base", () => {
        dir("app");
        write(
            "tsconfig.json",
            JSON.stringify({ compilerOptions: { paths: { "@/*": ["./app/*"] } } }),
        );
        expect(discoverAlias({ root, ts }).baseDir).toBe(join(root, "app"));
    });
    it("resolves paths against baseUrl when one is set", () => {
        dir("client/src");
        write(
            "tsconfig.json",
            JSON.stringify({
                compilerOptions: { baseUrl: "./client", paths: { "@/*": ["./src/*"] } },
            }),
        );
        expect(discoverAlias({ root, ts }).baseDir).toBe(join(root, "client", "src"));
    });
    it("finds paths inherited through extends, resolved against the declaring file", () => {
        dir("src");
        write(
            "tsconfig.base.json",
            JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
        );
        write("tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json" }));
        expect(discoverAlias({ root, ts })).toEqual({
            prefix: "@",
            baseDir: join(root, "src"),
            source: "tsconfig",
        });
    });
    it("skips an ambiguous entry with several targets", () => {
        dir("src");
        write(
            "tsconfig.json",
            JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*", "./generated/*"] } } }),
        );
        expect(discoverAlias({ root, ts })).toBeNull();
    });
    it("skips a non-wildcard entry", () => {
        dir("src");
        write(
            "tsconfig.json",
            JSON.stringify({ compilerOptions: { paths: { "@shared": ["./src/shared.ts"] } } }),
        );
        expect(discoverAlias({ root, ts })).toBeNull();
    });
    it("skips an entry whose target directory does not exist", () => {
        dir("src");
        write(
            "tsconfig.json",
            JSON.stringify({
                compilerOptions: { paths: { "#/*": ["./nope/*"], "@/*": ["./src/*"] } },
            }),
        );
        expect(discoverAlias({ root, ts })).toMatchObject({ prefix: "@", source: "tsconfig" });
    });
});

describe("discoverAlias — refuses to guess", () => {
    it("returns null when a src/ exists but nothing declares an alias", () => {
        dir("src");
        expect(discoverAlias({ root, ts })).toBeNull();
    });
    it("returns null when there is no tsconfig at all", () => {
        dir("src");
        dir("app");
        expect(discoverAlias({ root, ts })).toBeNull();
    });
    it("returns null when the tsconfig declares no paths", () => {
        dir("src");
        write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }));
        expect(discoverAlias({ root, ts })).toBeNull();
    });
});
