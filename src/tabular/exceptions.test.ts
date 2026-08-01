/**
 * Tests for the error hierarchy.
 *
 * The name assertions are not ceremony: an earlier version derived `name`
 * from `new.target.name`, and the shipped build reported `error.name === "t"`
 * because the minifier renamed the class. Only a real build showed it, so a
 * test pins the literal names.
 */

import { describe, expect, it } from "vitest";

import {
    FeatureShapeError,
    InferenceError,
    ModelFetchError,
    ModelLoadError,
    TabularError,
    UnsupportedGraphError,
} from "./exceptions";

describe("tabular · errors", () => {
    it("carries a literal name that survives minification", () => {
        expect(new TabularError("x").name).toBe("TabularError");
        expect(new ModelLoadError("x").name).toBe("ModelLoadError");
        expect(new UnsupportedGraphError("x").name).toBe("UnsupportedGraphError");
        expect(new FeatureShapeError("x").name).toBe("FeatureShapeError");
        expect(new InferenceError("x").name).toBe("InferenceError");
        expect(new ModelFetchError("x").name).toBe("ModelFetchError");
    });

    it("lets a caller catch the whole family at once", () => {
        expect(new UnsupportedGraphError("x")).toBeInstanceOf(TabularError);
        expect(new ModelFetchError("x")).toBeInstanceOf(TabularError);
        expect(new FeatureShapeError("x")).toBeInstanceOf(Error);
    });

    it("keeps the original error as the cause", () => {
        const original = new Error("root");
        expect(new ModelLoadError("wrapped", { cause: original }).cause).toBe(original);
    });
});
