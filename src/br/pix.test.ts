import { describe, expect, it } from "vitest";

import {
    normalizePixKey,
    parsePixPayload,
    PixError,
    pixCrc16,
    pixKeyType,
    pixPayload,
} from "./pix";

/**
 * Table-driven CRC-16/CCITT-FALSE, built from the polynomial at module load.
 *
 * A second, structurally different implementation of the same checksum: the SDK
 * shifts one bit at a time, this one consumes a whole byte per step through a
 * 256-entry table. Comparing the two catches a mistake in either, which comparing
 * the SDK against itself never could.
 */
function tableCrc16(input: string): string {
    const table: number[] = [];
    for (let index = 0; index < 256; index += 1) {
        let value = index << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            value =
                (value & 0x8000) !== 0 ? ((value << 1) ^ 0x1021) & 0xffff : (value << 1) & 0xffff;
        }
        table.push(value);
    }
    let crc = 0xffff;
    for (const byte of new TextEncoder().encode(input)) {
        crc = (((crc << 8) & 0xffff) ^ table[((crc >> 8) ^ byte) & 0xff]!) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Payloads derived outside this codebase.
 *
 * Each one was produced by a separate Python implementation written from the BACEN
 * manual and the EMV MPM layout, then its CRC recomputed there with the
 * table-driven algorithm. They are literals here so a refactor that changes the
 * output has to change the expectation too.
 */
const FIXTURES = {
    cpfWithAmount:
        "00020101021126330014br.gov.bcb.pix011112345678909520400005303986540525.505802BR5912Loja Tempest6009Sao Paulo62130509PEDIDO1236304D68C",
    emailReusable:
        "00020101021126380014br.gov.bcb.pix0116loja@tempest.dev5204000053039865802BR5907Tempest6014Belo Horizonte62070503***6304EE6B",
    dynamic:
        "00020101021226500014br.gov.bcb.pix2528pix.example.com/qr/v2/abc1235204000053039865802BR5907Tempest6006Recife62070503***63046FD4",
    phoneWithDescription:
        "00020101021126510014br.gov.bcb.pix0114+55119876543210211Mensalidade5204000053039865802BR5910Joao Silva6009Sao Paulo62070503***63040EF5",
} as const;

describe("pixCrc16", () => {
    it("matches the published CRC-16/CCITT-FALSE check value", () => {
        expect(pixCrc16("123456789")).toBe("29B1");
    });

    it("returns the register preset for an empty input", () => {
        expect(pixCrc16("")).toBe("FFFF");
    });

    it("agrees with an independent table-driven implementation", () => {
        const samples = [
            "",
            "A",
            "123456789",
            "0002010102",
            FIXTURES.cpfWithAmount.slice(0, -4),
            FIXTURES.dynamic.slice(0, -4),
            "acentuação e emoji ✅",
            "0".repeat(512),
        ];
        for (const sample of samples) {
            expect(pixCrc16(sample)).toBe(tableCrc16(sample));
        }
    });

    it("hashes UTF-8 bytes, not UTF-16 code units", () => {
        expect(pixCrc16("é")).toBe(tableCrc16("é"));
        expect(pixCrc16("é")).not.toBe(pixCrc16("e"));
    });
});

describe("pixPayload", () => {
    it("builds the documented static payload with an amount and a txid", () => {
        expect(
            pixPayload({
                key: "12345678909",
                merchantName: "Loja Tempest",
                merchantCity: "Sao Paulo",
                amount: 25.5,
                txid: "PEDIDO123",
            }),
        ).toBe(FIXTURES.cpfWithAmount);
    });

    it("builds a reusable e-mail payload with no amount", () => {
        expect(
            pixPayload({
                key: "loja@tempest.dev",
                merchantName: "Tempest",
                merchantCity: "Belo Horizonte",
            }),
        ).toBe(FIXTURES.emailReusable);
    });

    it("builds a dynamic payload that carries a URL instead of a key", () => {
        expect(
            pixPayload({
                kind: "dynamic",
                url: "pix.example.com/qr/v2/abc123",
                merchantName: "Tempest",
                merchantCity: "Recife",
            }),
        ).toBe(FIXTURES.dynamic);
    });

    it("builds a phone payload carrying a description in tag 26", () => {
        expect(
            pixPayload({
                key: "(11) 98765-4321",
                merchantName: "Joao Silva",
                merchantCity: "Sao Paulo",
                description: "Mensalidade",
            }),
        ).toBe(FIXTURES.phoneWithDescription);
    });

    it("covers the literal 6304 header with the checksum", () => {
        const payload = FIXTURES.cpfWithAmount;
        expect(pixCrc16(payload.slice(0, -4))).toBe(payload.slice(-4));
        expect(pixCrc16(payload.slice(0, -8))).not.toBe(payload.slice(-4));
    });

    it("marks a single-use static QR with point of initiation 12", () => {
        const payload = pixPayload({
            key: "12345678909",
            merchantName: "Tempest",
            merchantCity: "Recife",
            oneTime: true,
        });
        expect(payload).toContain("010212");
        expect(parsePixPayload(payload).oneTime).toBe(true);
    });

    it("lets a dynamic QR opt back into being reusable", () => {
        const payload = pixPayload({
            kind: "dynamic",
            url: "pix.example.com/q/1",
            merchantName: "Tempest",
            merchantCity: "Recife",
            oneTime: false,
        });
        expect(payload).toContain("010211");
    });

    it("strips the scheme a caller left on the payload URL", () => {
        const payload = pixPayload({
            kind: "dynamic",
            url: "https://pix.example.com/qr/v2/abc123",
            merchantName: "Tempest",
            merchantCity: "Recife",
        });
        expect(payload).toBe(FIXTURES.dynamic);
    });

    it("drops diacritics the BR Code character set cannot carry", () => {
        const payload = pixPayload({
            key: "12345678909",
            merchantName: "Padaria Açúcar",
            merchantCity: "São Paulo",
        });
        expect(payload).toContain("5914Padaria Acucar");
        expect(payload).toContain("6009Sao Paulo");
    });

    it("adds tag 61 only when a postal code is given", () => {
        expect(
            pixPayload({
                key: "12345678909",
                merchantName: "Tempest",
                merchantCity: "Recife",
                postalCode: "50000-000",
            }),
        ).toContain("610850000000");
        expect(
            pixPayload({ key: "12345678909", merchantName: "Tempest", merchantCity: "Recife" }),
        ).not.toContain("6108");
    });

    it("treats an explicit *** txid as unspecified", () => {
        const payload = pixPayload({
            key: "12345678909",
            merchantName: "Tempest",
            merchantCity: "Recife",
            txid: "***",
        });
        expect(payload).toContain("62070503***");
    });

    it("formats an amount with two decimals", () => {
        expect(
            pixPayload({
                key: "12345678909",
                merchantName: "Tempest",
                merchantCity: "Recife",
                amount: 7,
            }),
        ).toContain("54047.00");
    });

    it.each([
        ["an unrecognised key", { key: "not-a-key" }],
        ["a twelve-digit number that is neither a document nor a phone", { key: "123456789012" }],
        ["a CNPJ that fails its check digits", { key: "11222333000100" }],
        ["a merchant name over 25 characters", { merchantName: "A".repeat(26) }],
        ["a merchant city over 15 characters", { merchantCity: "B".repeat(16) }],
        ["an empty merchant name", { merchantName: "   " }],
        ["a zero amount", { amount: 0 }],
        ["a negative amount", { amount: -1 }],
        ["a non-finite amount", { amount: Number.POSITIVE_INFINITY }],
        ["an amount too wide for tag 54", { amount: 12_345_678_901.23 }],
        ["a txid with punctuation", { txid: "PEDIDO-123" }],
        ["a txid over 25 characters", { txid: "P".repeat(26) }],
        ["text outside the payload character set", { merchantName: "Loja ✅" }],
        ["a description that overflows tag 26", { description: "D".repeat(90) }],
    ])("rejects %s", (_label, override) => {
        expect(() =>
            pixPayload({
                key: "12345678909",
                merchantName: "Tempest",
                merchantCity: "Recife",
                ...override,
            }),
        ).toThrow(PixError);
    });

    it("rejects a dynamic payload with no URL", () => {
        expect(() =>
            pixPayload({
                kind: "dynamic",
                url: "   ",
                merchantName: "Tempest",
                merchantCity: "Recife",
            }),
        ).toThrow(PixError);
    });

    it("rejects a single value too long for a two-digit EMV length field", () => {
        expect(() =>
            pixPayload({
                kind: "dynamic",
                url: `pix.example.com/${"a".repeat(110)}`,
                merchantName: "Tempest",
                merchantCity: "Recife",
            }),
        ).toThrow(/length field holds at most 99/);
        expect(() =>
            pixPayload({
                key: "12345678909",
                merchantName: "Tempest",
                merchantCity: "Recife",
                description: "D".repeat(100),
            }),
        ).toThrow(/length field holds at most 99/);
    });

    it("rejects a payload URL that overflows tag 26", () => {
        expect(() =>
            pixPayload({
                kind: "dynamic",
                url: `pix.example.com/${"a".repeat(64)}`,
                merchantName: "Tempest",
                merchantCity: "Recife",
            }),
        ).toThrow(PixError);
    });
});

describe("pixKeyType", () => {
    it.each([
        ["12345678909", "cpf"],
        ["123.456.789-09", "cpf"],
        ["11222333000181", "cnpj"],
        ["11.222.333/0001-81", "cnpj"],
        ["loja@tempest.dev", "email"],
        ["+5511987654321", "phone"],
        ["11987654321", "phone"],
        ["1133334444", "phone"],
        ["5511987654321", "phone"],
        ["123e4567-e89b-12d3-a456-426614174000", "evp"],
    ])("classifies %s as %s", (key, expected) => {
        expect(pixKeyType(key)).toBe(expected);
    });

    it.each([
        [""],
        ["   "],
        ["no-at-sign.dev"],
        ["missing@tld"],
        [`${"a".repeat(70)}@tempest.dev`],
        ["+441234567890"],
        ["12345"],
        ["123456789012345"],
        ["441234567890"],
        ["11222333000100"],
    ])("returns null for %s", (key) => {
        expect(pixKeyType(key)).toBeNull();
    });

    it("prefers CPF over phone when the check digits validate", () => {
        expect(pixKeyType("12345678909")).toBe("cpf");
        expect(pixKeyType("11987654321")).toBe("phone");
    });
});

describe("normalizePixKey", () => {
    it.each([
        ["123.456.789-09", "cpf", "12345678909"],
        ["11.222.333/0001-81", "cnpj", "11222333000181"],
        ["Loja@Tempest.DEV", "email", "loja@tempest.dev"],
        ["(11) 98765-4321", "phone", "+5511987654321"],
        ["+55 11 98765-4321", "phone", "+5511987654321"],
        ["5511987654321", "phone", "+5511987654321"],
        ["(11) 3333-4444", "phone", "+551133334444"],
        ["123E4567-E89B-12D3-A456-426614174000", "evp", "123e4567-e89b-12d3-a456-426614174000"],
    ])("normalises %s", (key, type, value) => {
        expect(normalizePixKey(key)).toEqual({ type, value });
    });

    it("throws on a key it cannot classify", () => {
        expect(() => normalizePixKey("nope")).toThrow(PixError);
    });
});

describe("parsePixPayload", () => {
    it("reads back everything a static payload carried", () => {
        const data = parsePixPayload(FIXTURES.cpfWithAmount);
        expect(data).toMatchObject({
            kind: "static",
            key: "12345678909",
            keyType: "cpf",
            merchantName: "Loja Tempest",
            merchantCity: "Sao Paulo",
            amount: 25.5,
            currency: "986",
            countryCode: "BR",
            merchantCategoryCode: "0000",
            txid: "PEDIDO123",
            oneTime: false,
            crc: "D68C",
            crcValid: true,
        });
        expect(data.url).toBeUndefined();
    });

    it("reads a dynamic payload as a URL with no key", () => {
        const data = parsePixPayload(FIXTURES.dynamic);
        expect(data.kind).toBe("dynamic");
        expect(data.url).toBe("pix.example.com/qr/v2/abc123");
        expect(data.key).toBeUndefined();
        expect(data.oneTime).toBe(true);
    });

    it("reads the description out of tag 26", () => {
        expect(parsePixPayload(FIXTURES.phoneWithDescription)).toMatchObject({
            key: "+5511987654321",
            keyType: "phone",
            description: "Mensalidade",
        });
    });

    it("round-trips every field it exposes", () => {
        const payload = pixPayload({
            key: "11222333000181",
            merchantName: "Tempest Ltda",
            merchantCity: "Curitiba",
            amount: 1234.56,
            txid: "NF2026001",
            description: "Servicos",
            postalCode: "80000-000",
        });
        expect(parsePixPayload(payload)).toMatchObject({
            key: "11222333000181",
            keyType: "cnpj",
            merchantName: "Tempest Ltda",
            merchantCity: "Curitiba",
            amount: 1234.56,
            txid: "NF2026001",
            description: "Servicos",
            postalCode: "80000000",
            crcValid: true,
        });
    });

    it("tolerates a tag it does not know", () => {
        const head = `${FIXTURES.emailReusable.slice(0, -8)}8004AAAA6304`;
        const payload = `${head}${pixCrc16(head)}`;
        const data = parsePixPayload(payload);
        expect(data.merchantName).toBe("Tempest");
        expect(data.fields).toContainEqual({ id: "80", value: "AAAA" });
    });

    it("accepts the upper-case spelling of the Pix GUI", () => {
        const head = FIXTURES.emailReusable
            .slice(0, -4)
            .replace("br.gov.bcb.pix", "BR.GOV.BCB.PIX");
        expect(parsePixPayload(`${head}${pixCrc16(head)}`).merchantName).toBe("Tempest");
    });

    it("ignores surrounding whitespace", () => {
        expect(parsePixPayload(`  ${FIXTURES.dynamic}\n`).crcValid).toBe(true);
    });

    it("throws when the checksum does not match", () => {
        const broken = `${FIXTURES.cpfWithAmount.slice(0, -4)}0000`;
        expect(() => parsePixPayload(broken)).toThrow(/CRC mismatch/);
    });

    it("reports a bad checksum instead of throwing when asked", () => {
        const broken = `${FIXTURES.cpfWithAmount.slice(0, -4)}0000`;
        const data = parsePixPayload(broken, { requireCrc: false });
        expect(data.crcValid).toBe(false);
        expect(data.crc).toBe("0000");
        expect(data.key).toBe("12345678909");
    });

    it.each([
        ["a string too short to be a payload", "6304"],
        ["a payload that does not end in 6304", "000201010211"],
        ["a tag that is not two digits", "0X020163040000"],
        ["a length prefix that is not two digits", "000X0163040000"],
        ["a length that runs past the end", `26990014br.gov.bcb.pix6304${"0".repeat(4)}`],
    ])("throws on %s", (_label, payload) => {
        expect(() => parsePixPayload(payload, { requireCrc: false })).toThrow(PixError);
    });

    it("names the offset of a malformed triple", () => {
        expect(() => parsePixPayload("0002010X0163040000", { requireCrc: false })).toThrow(
            /at offset 6/,
        );
    });

    it("throws when tag 26 is missing", () => {
        const head = "0002010102115204000053039865907Tempest6304";
        expect(() => parsePixPayload(`${head}${pixCrc16(head)}`)).toThrow(/no tag 26/);
    });

    it("throws when tag 26 is not a Pix account", () => {
        const head = "00020101021126130009other.gui520400006304";
        expect(() => parsePixPayload(`${head}${pixCrc16(head)}`)).toThrow(/not a Pix account/);
    });

    it("defaults missing optional tags to empty strings rather than undefined", () => {
        const head = "00020126260014br.gov.bcb.pix01046dfa6304";
        const data = parsePixPayload(`${head}${pixCrc16(head)}`);
        expect(data.merchantName).toBe("");
        expect(data.merchantCity).toBe("");
        expect(data.currency).toBe("");
        expect(data.countryCode).toBe("");
        expect(data.merchantCategoryCode).toBe("");
        expect(data.amount).toBeUndefined();
        expect(data.txid).toBeUndefined();
        expect(data.keyType).toBeUndefined();
    });
});
