import { describe, expect, it } from "vitest";

import { isInsideBase, toAlias } from "./specifier.mjs";

const BASE = "/proj/src";
const FILE = "/proj/src/components/Card/Card.tsx";

const alias = (spec, filePath = FILE) => toAlias({ spec, filePath, prefix: "@", baseDir: BASE });

describe("isInsideBase", () => {
    it("accepts a file under the base", () => {
        expect(isInsideBase(FILE, BASE)).toBe(true);
    });
    it("rejects a file outside the base", () => {
        expect(isInsideBase("/proj/vite.config.ts", BASE)).toBe(false);
        expect(isInsideBase("/proj/e2e/spec.ts", BASE)).toBe(false);
    });
    it("rejects the base itself", () => {
        expect(isInsideBase(BASE, BASE)).toBe(false);
    });
});

describe("toAlias — what converts", () => {
    it("converts a specifier climbing two levels", () => {
        expect(alias("../../services/api")).toBe("@/services/api");
    });
    it("converts a specifier climbing one level", () => {
        expect(alias("../Button")).toBe("@/components/Button");
    });
    it("converts up to the base root", () => {
        expect(alias("../../routes")).toBe("@/routes");
    });
});

describe("toAlias — what stays", () => {
    it("leaves a sibling alone", () => {
        expect(alias("./Card.module.css")).toBeNull();
        expect(alias("./nested/deep")).toBeNull();
    });
    it("leaves a bare package alone", () => {
        expect(alias("react")).toBeNull();
        expect(alias("tempest-react-sdk/charts")).toBeNull();
    });
    it("leaves an already-aliased specifier alone", () => {
        expect(alias("@/services/api")).toBeNull();
    });
    it("leaves a target outside the base alone", () => {
        expect(alias("../../../vite.config")).toBeNull();
        expect(alias("../../../../elsewhere/x")).toBeNull();
    });
    it("leaves a climb that lands exactly on the base alone", () => {
        expect(alias("../..")).toBeNull();
        expect(alias("../../")).toBeNull();
    });
});

describe("toAlias — extensions", () => {
    it("preserves whatever extension the specifier carried", () => {
        expect(alias("../../styles/tokens.css")).toBe("@/styles/tokens.css");
        expect(alias("../Card.module.css")).toBe("@/components/Card.module.css");
        expect(alias("../../assets/logo.svg")).toBe("@/assets/logo.svg");
        expect(alias("../../data/seed.json")).toBe("@/data/seed.json");
    });
    it("does not add an extension to an extensionless specifier", () => {
        expect(alias("../../lib/api")).toBe("@/lib/api");
    });
});

describe("toAlias — prefix and base come from the caller", () => {
    it("honours a non-@ prefix", () => {
        expect(toAlias({ spec: "../../lib/api", filePath: FILE, prefix: "~", baseDir: BASE })).toBe(
            "~/lib/api",
        );
    });
    it("honours an app/ base", () => {
        expect(
            toAlias({
                spec: "../../lib/api",
                filePath: "/proj/app/components/Card/Card.tsx",
                prefix: "@",
                baseDir: "/proj/app",
            }),
        ).toBe("@/lib/api");
    });
});
