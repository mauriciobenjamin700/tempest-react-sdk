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
 * @param value - The raw cell value.
 * @returns The text to write.
 */
function cellText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

/**
 * Serialize rows to CSV text, RFC 4180 style.
 *
 * Rows are separated by `\r\n` — the RFC's terminator and the one Excel is least
 * surprised by. A row is emitted for the header even when `rows` is empty, so the
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
 * @param options - Delimiter and BOM.
 * @returns The complete file contents.
 */
export function toCsv<T>(
    rows: readonly T[],
    columns: readonly CsvColumn<T>[],
    options: CsvOptions = {},
): string {
    const { delimiter = ",", bom = true } = options;

    const lines = [columns.map((column) => escapeField(column.header, delimiter)).join(delimiter)];

    for (const row of rows) {
        const cells = columns.map((column) => {
            const raw = column.csv
                ? column.csv(row)
                : (row as Record<string, unknown>)[column.key as string];
            return escapeField(cellText(raw), delimiter);
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
 * @param options - Delimiter and BOM, forwarded to {@link toCsv}.
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
