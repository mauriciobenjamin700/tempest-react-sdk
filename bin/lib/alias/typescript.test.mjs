import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readTsconfig, stripJsonc } from "./tsconfig.mjs";
import { describeTypeScript, loadTypeScript, typeScriptUnavailableReason } from "./typescript.mjs";

let root;

/** Write a file under the fixture, creating parent directories. */
function write(rel, text) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
}

/**
 * Fake an installed `typescript` whose main module exports `exports`.
 *
 * TypeScript 7 is exactly this shape: the package resolves, the version is there,
 * and the classic API is not — it moved to `typescript/unstable/*`.
 */
function fakeTypeScript(version, exports) {
    write(
        "node_modules/typescript/package.json",
        JSON.stringify({ name: "typescript", version, main: "index.js" }),
    );
    write("node_modules/typescript/index.js", `module.exports = ${exports};`);
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "tempest-ts-"));
    write("package.json", JSON.stringify({ name: "fixture" }));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("loadTypeScript", () => {
    it("returns null when typescript is not installed", () => {
        expect(loadTypeScript(root)).toBeNull();
        expect(describeTypeScript(root)).toEqual({ status: "missing", version: null });
        expect(typeScriptUnavailableReason(root)).toContain("não instalado");
    });

    it("returns null for an install without the classic compiler API", () => {
        fakeTypeScript("7.0.2", '{ version: "7.0.2", versionMajorMinor: "7.0" }');
        expect(loadTypeScript(root)).toBeNull();
        expect(describeTypeScript(root)).toEqual({ status: "api-unavailable", version: "7.0.2" });
        const reason = typeScriptUnavailableReason(root);
        expect(reason).toContain("7.0.2");
        expect(reason).toContain("unstable");
    });

    it("returns the module when the classic API is there", () => {
        fakeTypeScript(
            "6.0.3",
            "{ readConfigFile: () => ({}), createSourceFile: () => ({}), forEachChild: () => {} }",
        );
        expect(loadTypeScript(root)).not.toBeNull();
        expect(describeTypeScript(root)).toEqual({ status: "ok", version: "6.0.3" });
        expect(typeScriptUnavailableReason(root)).toBeNull();
    });

    it("treats a partial API as unavailable rather than half-usable", () => {
        fakeTypeScript("7.1.0", "{ createSourceFile: () => ({}) }");
        expect(loadTypeScript(root)).toBeNull();
    });
});

describe("stripJsonc", () => {
    it("removes line and block comments", () => {
        expect(stripJsonc('{ // hi\n "a": 1 /* there */ }')).toBe('{ \n "a": 1  }');
    });

    it("removes a trailing comma before a close", () => {
        expect(JSON.parse(stripJsonc('{ "a": [1, 2,], }'))).toEqual({ a: [1, 2] });
    });

    it("leaves comment markers inside strings alone", () => {
        expect(JSON.parse(stripJsonc('{ "url": "https://x.dev/a", "p": "a/*b" }'))).toEqual({
            url: "https://x.dev/a",
            p: "a/*b",
        });
    });

    it("survives an unterminated comment instead of throwing", () => {
        expect(() => stripJsonc('{ "a": 1 } /* forever')).not.toThrow();
    });
});

describe("readTsconfig without the compiler API", () => {
    it("still reads a tsconfig that has comments and a trailing comma", () => {
        write(
            "tsconfig.json",
            '{\n  // the app\n  "compilerOptions": {\n    "strict": true,\n    "paths": { "@/*": ["./src/*"] },\n  },\n}\n',
        );
        const config = readTsconfig({ root, ts: null });
        expect(config.compilerOptions.strict).toBe(true);
        expect(config.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
    });

    it("follows extends with the fallback parser", () => {
        write("base.json", '{ "compilerOptions": { "jsx": "react-jsx" } } // base\n');
        write(
            "tsconfig.json",
            '{ "extends": "./base.json", "compilerOptions": { "strict": true } }',
        );
        const config = readTsconfig({ root, ts: null });
        expect(config.compilerOptions).toMatchObject({ jsx: "react-jsx", strict: true });
    });

    it("ignores a `ts` that cannot read a config file", () => {
        write("tsconfig.json", '{ "compilerOptions": { "strict": true } }');
        const config = readTsconfig({ root, ts: { version: "7.0.2" } });
        expect(config.compilerOptions.strict).toBe(true);
    });
});
