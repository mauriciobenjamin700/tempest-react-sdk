/**
 * Guard: the compact route must not depend on `onnxruntime-web`.
 *
 * @vitest-environment node
 *
 * A static `import ... from "onnxruntime-web"` anywhere the barrel reaches
 * makes every consumer of `tempest-react-sdk/tabular` install the peer —
 * including an app that only ever touches `CompactPredictor`, whose entire
 * reason to exist is not shipping a 25.6 MB runtime.
 *
 * That regression shipped once, in 0.33.0: `assets.ts` imported the runtime
 * at module load, so importing the barrel in a project without the peer
 * threw `ERR_MODULE_NOT_FOUND`. Nothing caught it because every test
 * imported leaf modules directly and the dev tree always has the peer
 * installed. It only surfaced when the published package was installed into
 * an empty project.
 *
 * So this reads the source: the runtime may be referenced as a **type**, or
 * behind a **dynamic** import inside the function that loads a model, and
 * nowhere else.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Read a module of this directory as text. */
function source(name: string): string {
    return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

/** Modules the barrel pulls in unconditionally. */
const ALWAYS_LOADED = [
    "index.ts",
    "assets.ts",
    "cache.ts",
    "compact.ts",
    "exceptions.ts",
    "manifest.ts",
    "types.ts",
    "use-tabular-predictor.ts",
];

/** A static `import ... from "onnxruntime-web"`, ignoring `import type`. */
const STATIC_IMPORT = /^\s*import\s+(?!type\b)[^;]*from\s+["']onnxruntime-web["']/m;

describe("tabular · independence from the ONNX peer", () => {
    it.each(ALWAYS_LOADED)("%s does not import the runtime statically", (name) => {
        expect(STATIC_IMPORT.test(source(name))).toBe(false);
    });

    it("the ONNX predictor imports the runtime only dynamically", () => {
        const predictor = source("predictor.ts");
        expect(STATIC_IMPORT.test(predictor)).toBe(false);
        expect(predictor).toContain('await import("onnxruntime-web")');
    });

    it("the ONNX predictor keeps the peer's types", () => {
        /** Erased at compile time, so it costs a consumer nothing. */
        expect(source("predictor.ts")).toContain('import type * as ort from "onnxruntime-web"');
    });

    it("a missing peer is reported with the command that fixes it", () => {
        const predictor = source("predictor.ts");
        expect(predictor).toContain("npm install onnxruntime-web");
        expect(predictor).toContain("CompactPredictor");
    });
});
