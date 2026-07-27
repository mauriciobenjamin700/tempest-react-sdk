import { describe, expect, it } from "vitest";

import { parseCss } from "./parse.mjs";
import { matchUtility, repetitionFindings } from "./repetition.mjs";

const ROW = `.row {
    display: flex;
    align-items: center;
    gap: 8px;
}
`;

const sheet = (file, text, isModule = true) => ({ file, isModule, parsed: parseCss(text) });
const rule = (text) => parseCss(text).blocks[0];

const UTILITIES = new Set([
    "tempest-row",
    "tempest-stack",
    "tempest-center",
    "tempest-cluster",
    "tempest-truncate",
    "tempest-card",
    "tempest-grid-auto",
    "tempest-spread",
]);

describe("matchUtility", () => {
    it("matches a row regardless of how the gap is written", () => {
        expect(matchUtility(rule(".a { display: flex; align-items: center; gap: 1rem; }"))).toBe(
            "tempest-row",
        );
        expect(
            matchUtility(
                rule(".a { display: flex; align-items: center; gap: var(--tempest-space-3); }"),
            ),
        ).toBe("tempest-row");
    });

    it("calls a column flex container a stack, not a row", () => {
        expect(
            matchUtility(
                rule(
                    ".a { display: flex; flex-direction: column; align-items: center; gap: 4px; }",
                ),
            ),
        ).toBe("tempest-stack");
    });

    it("prefers center and spread over row", () => {
        expect(
            matchUtility(
                rule(".a { display: flex; align-items: center; justify-content: center; }"),
            ),
        ).toBe("tempest-center");
        expect(
            matchUtility(
                rule(
                    ".a { display: flex; align-items: center; justify-content: space-between; gap: 8px; }",
                ),
            ),
        ).toBe("tempest-spread");
    });

    it("matches a wrapping cluster", () => {
        expect(
            matchUtility(
                rule(".a { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }"),
            ),
        ).toBe("tempest-cluster");
    });

    it("matches truncate and card", () => {
        expect(
            matchUtility(
                rule(".a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }"),
            ),
        ).toBe("tempest-truncate");
        expect(
            matchUtility(
                rule(
                    ".a { background: #fff; border: 1px solid #eee; border-radius: 8px; box-shadow: 0 1px 2px #0001; padding: 16px; }",
                ),
            ),
        ).toBe("tempest-card");
    });

    it("returns null for a rule that is not an idiom", () => {
        expect(matchUtility(rule(".a { color: red; padding: 0; margin: 0; }"))).toBeNull();
    });
});

describe("repetitionFindings", () => {
    it("reports a block repeated across files as a global candidate", () => {
        const { findings } = repetitionFindings({
            sheets: [
                sheet("a.module.css", ROW),
                sheet("b.module.css", ROW),
                sheet("c.module.css", ROW),
            ],
        });
        const global = findings.find((f) => f.code === "global-candidate");
        expect(global).toMatchObject({ severity: "info", file: "a.module.css", line: 1 });
        expect(global.message).toContain("3 rules in 3 file(s)");
    });

    it("names the utility when the SDK ships one", () => {
        const { findings } = repetitionFindings({
            sheets: [
                sheet("a.module.css", ROW),
                sheet("b.module.css", ROW),
                sheet("c.module.css", ROW),
            ],
            utilities: UTILITIES,
        });
        const utility = findings.find((f) => f.code === "utility-candidate");
        expect(utility.message).toContain(".tempest-row");
        expect(utility.extra ?? utility.utility).toBeDefined();
    });

    it("says nothing about a utility the installed SDK does not ship", () => {
        const { findings } = repetitionFindings({
            sheets: [
                sheet("a.module.css", ROW),
                sheet("b.module.css", ROW),
                sheet("c.module.css", ROW),
            ],
        });
        expect(findings.some((f) => f.code === "utility-candidate")).toBe(false);
    });

    it("stays quiet below the occurrence threshold", () => {
        const { findings } = repetitionFindings({
            sheets: [sheet("a.module.css", ROW), sheet("b.module.css", ROW)],
            utilities: UTILITIES,
        });
        expect(findings).toEqual([]);
    });

    it("stays quiet for a block with fewer than three declarations", () => {
        const small = ".a { color: red; padding: 0; }\n";
        const { findings } = repetitionFindings({
            sheets: [sheet("a.css", small), sheet("b.css", small), sheet("c.css", small)],
        });
        expect(findings).toEqual([]);
    });

    it("needs a fourth copy before reporting repetition inside a single file", () => {
        const three = `${ROW}.b {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.c {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n`;
        expect(repetitionFindings({ sheets: [sheet("a.css", three)] }).findings).toEqual([]);
        const four = `${three}.d {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n`;
        expect(
            repetitionFindings({ sheets: [sheet("a.css", four)] }).findings.map((f) => f.code),
        ).toEqual(["global-candidate"]);
    });

    it("groups by declarations, not by selector name", () => {
        const { groups } = repetitionFindings({
            sheets: [
                sheet("a.module.css", ROW),
                sheet("b.module.css", ROW.replace(".row", ".line")),
                sheet("c.module.css", ROW.replace(".row", ".bar")),
            ],
        });
        expect(groups.find((g) => g.kind === "block").occurrences).toHaveLength(3);
    });
});
