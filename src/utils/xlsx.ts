import { zipSync, type Zippable } from "fflate";

/** A single spreadsheet cell — a number, a string, or an empty cell. */
type Cell = { v: string; t: "s" } | { v: number; t: "n" } | { v: ""; t: "s" };

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function colLetter(index0: number): string {
    let n = index0 + 1;
    let result = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        result = String.fromCharCode(65 + rem) + result;
        n = Math.floor((n - 1) / 26);
    }
    return result;
}

function toCell(value: string | number | null): Cell {
    if (typeof value === "number") return { v: value, t: "n" };
    if (value === null || value === "") return { v: "", t: "s" };
    return { v: value, t: "s" };
}

function cellXml(cell: Cell, ref: string): string {
    if (cell.t === "n") return `<c r="${ref}" t="n"><v>${cell.v}</v></c>`;
    if (cell.v === "") return `<c r="${ref}" t="inlineStr"><is><t></t></is></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.v)}</t></is></c>`;
}

function rowXml(cells: readonly Cell[], rowIndex1: number): string {
    const inner = cells.map((c, i) => cellXml(c, `${colLetter(i)}${rowIndex1}`)).join("");
    return `<row r="${rowIndex1}">${inner}</row>`;
}

function buildSheetXml(rows: readonly (readonly Cell[])[], columnCount: number): string {
    const dimension = `A1:${colLetter(Math.max(columnCount - 1, 0))}${rows.length}`;
    const body = rows.map((row, i) => rowXml(row, i + 1)).join("");
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<dimension ref="${dimension}"/>` +
        `<sheetData>${body}</sheetData>` +
        `</worksheet>`
    );
}

const CONTENT_TYPES_XML =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;

const ROOT_RELS_XML =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

const WORKBOOK_XML =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

const WORKBOOK_RELS_XML =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;

/**
 * Write a minimal single-sheet Office Open XML (`.xlsx`) workbook and return
 * its bytes. No extra dependency beyond `fflate` — the archive is assembled and
 * deflated in-process.
 *
 * The output is UTF-8 throughout, so accents round-trip in
 * Excel/LibreOffice/Google Sheets without the BOM-detection fragility that
 * plagues CSV exports. The XML stays compact: inline strings (no shared-string
 * table), no styles, no merged cells. Numeric cells use the native `"n"` type
 * so spreadsheets recognise them as numbers; `null` renders as an empty cell.
 *
 * @param headers - Column headers written as the first row.
 * @param rows - Data rows; each value is a string, a number, or `null` (empty).
 * @returns The `.xlsx` file contents as a `Uint8Array`.
 *
 * @example
 * const bytes = writeXlsx(
 *   ["Name", "Score"],
 *   [["Ada", 99], ["Alan", null]],
 * );
 * const blob = new Blob([bytes], {
 *   type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 * });
 */
export function writeXlsx(
    headers: readonly string[],
    rows: readonly (readonly (string | number | null)[])[],
): Uint8Array {
    const headerRow: Cell[] = headers.map((h) => ({ v: h, t: "s" }));
    const dataRows: Cell[][] = rows.map((row) => row.map(toCell));
    const allRows: Cell[][] = [headerRow, ...dataRows];
    const columnCount = Math.max(headers.length, ...dataRows.map((row) => row.length), 0);
    const sheetXml = buildSheetXml(allRows, columnCount);

    const encoder = new TextEncoder();
    const archive: Zippable = {
        "[Content_Types].xml": encoder.encode(CONTENT_TYPES_XML),
        "_rels/.rels": encoder.encode(ROOT_RELS_XML),
        "xl/workbook.xml": encoder.encode(WORKBOOK_XML),
        "xl/_rels/workbook.xml.rels": encoder.encode(WORKBOOK_RELS_XML),
        "xl/worksheets/sheet1.xml": encoder.encode(sheetXml),
    };
    return zipSync(archive);
}
