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

    it("quotes against the semicolon when that is the delimiter", () => {
        const csv = toCsv([{ v: "a;b" }, { v: "a,b" }], [{ key: "v", header: "V" }], {
            delimiter: ";",
        });
        expect(lines(csv)).toEqual(["V", '"a;b"', "a,b"]);
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
});
