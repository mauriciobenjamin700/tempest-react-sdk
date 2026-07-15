import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { writeXlsx } from "./xlsx";

describe("writeXlsx", () => {
    it("produces a zip archive whose bytes start with the PK signature", () => {
        const bytes = writeXlsx(["A"], [["x"]]);
        expect(bytes[0]).toBe(0x50);
        expect(bytes[1]).toBe(0x4b);
    });

    it("round-trips headers and rows into the sheet XML", () => {
        const bytes = writeXlsx(
            ["Name", "Score"],
            [
                ["Ada", 99],
                ["Alan", null],
            ],
        );
        const files = unzipSync(bytes);
        const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);

        expect(sheet).toContain(">Name<");
        expect(sheet).toContain(">Score<");
        expect(sheet).toContain(">Ada<");
        expect(sheet).toContain(`t="n"><v>99</v>`);
        expect(sheet).toContain(`r="A1"`);
        expect(sheet).toContain(`r="B3"`);
    });

    it("escapes XML-sensitive characters in strings", () => {
        const bytes = writeXlsx(["Col"], [["a & b < c > \"d\" 'e'"]]);
        const files = unzipSync(bytes);
        const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
        expect(sheet).toContain("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
        expect(sheet).not.toContain("a & b");
    });

    it("assembles the full OOXML package part set", () => {
        const files = unzipSync(writeXlsx(["A"], [["1"]]));
        expect(Object.keys(files).sort()).toEqual(
            [
                "[Content_Types].xml",
                "_rels/.rels",
                "xl/_rels/workbook.xml.rels",
                "xl/workbook.xml",
                "xl/worksheets/sheet1.xml",
            ].sort(),
        );
    });
});
