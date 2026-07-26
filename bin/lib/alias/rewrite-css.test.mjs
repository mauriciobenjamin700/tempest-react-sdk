import { describe, expect, it } from "vitest";

import { rewriteCss } from "./rewrite-css.mjs";

const BASE = "/proj/src";
const FILE = "/proj/src/components/Card/Card.module.css";

const rewrite = (text, filePath = FILE) =>
    rewriteCss({ text, filePath, prefix: "@", baseDir: BASE });

describe("rewriteCss — @import", () => {
    it("converts a quoted @import", () => {
        const { text, changes } = rewrite(`@import "../../styles/tokens.css";\n`);
        expect(text).toBe(`@import "@/styles/tokens.css";\n`);
        expect(changes).toEqual([
            { from: "../../styles/tokens.css", to: "@/styles/tokens.css", line: 1 },
        ]);
    });
    it("converts @import url(...) exactly once", () => {
        const { text, changes } = rewrite(`@import url("../../styles/tokens.css");\n`);
        expect(text).toBe(`@import url("@/styles/tokens.css");\n`);
        expect(changes).toHaveLength(1);
    });
    it("preserves single quotes", () => {
        const { text } = rewrite(`@import '../../styles/tokens.css';\n`);
        expect(text).toBe(`@import '@/styles/tokens.css';\n`);
    });
});

describe("rewriteCss — url()", () => {
    it("converts an unquoted url()", () => {
        const { text } = rewrite(`.a { background: url(../../assets/bg.png); }\n`);
        expect(text).toBe(`.a { background: url(@/assets/bg.png); }\n`);
    });
    it("converts a quoted url()", () => {
        const { text } = rewrite(`.a { background: url("../../assets/bg.png"); }\n`);
        expect(text).toBe(`.a { background: url("@/assets/bg.png"); }\n`);
    });
    it("converts several url() on one line without sliding offsets", () => {
        const { text } = rewrite(
            `.a { background: url(../../a.png); border-image: url(../../b.png); }\n`,
        );
        expect(text).toBe(`.a { background: url(@/a.png); border-image: url(@/b.png); }\n`);
    });
});

describe("rewriteCss — what stays", () => {
    it("leaves data:, http: and fragment URLs alone", () => {
        const src = `.a { background: url(data:image/png;base64,AAA); }\n.b { background: url("https://x/y.png"); }\n.c { fill: url(#grad); }\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("leaves a sibling path alone", () => {
        const src = `@import "./tokens.css";\n.a { background: url(./bg.png); }\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("leaves a root-absolute path alone", () => {
        const src = `.a { background: url(/icon.svg); }\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("leaves a target outside the alias base alone", () => {
        const src = `.a { background: url(../../../public/bg.png); }\n`;
        expect(rewrite(src).text).toBe(src);
    });
    it("leaves a file outside the alias base untouched", () => {
        const src = `@import "../src/styles/tokens.css";\n`;
        const { text, changes } = rewrite(src, "/proj/e2e/fixture.css");
        expect(text).toBe(src);
        expect(changes).toEqual([]);
    });
});

describe("rewriteCss — mechanics", () => {
    it("reports the line of each change", () => {
        const { changes } = rewrite(
            `@import "../../styles/a.css";\n\n.x { background: url(../../assets/b.png); }\n`,
        );
        expect(changes.map((ch) => ch.line)).toEqual([1, 3]);
    });
    it("is idempotent", () => {
        const first = rewrite(`@import "../../styles/tokens.css";\n`);
        const second = rewrite(first.text);
        expect(second.text).toBe(first.text);
        expect(second.changes).toEqual([]);
    });
});
