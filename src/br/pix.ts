/**
 * @tempest-limits file-lines — EMV®QRCPS-MPM for Pix: the TLV writer, the
 * CRC16-CCITT, the field catalogue with its nesting, key-type detection and the
 * parser that has to accept what other banks emit. Reader and writer live together
 * because each one is the other's test — a payload this file builds is a payload it
 * must parse back.
 */
import { validateCNPJ, validateCPF } from "@/forms/br-validators";

/**
 * A Pix payload could not be built or read.
 *
 * Its own class so a caller can tell "the operator typed a bad key" apart from a
 * bug, and so an `ErrorBoundary` can render a form error instead of a crash.
 */
export class PixError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PixError";
    }
}

/** The five key formats DICT accepts. */
export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "evp";

/** A key after normalisation, ready to go into the payload. */
export interface NormalizedPixKey {
    type: PixKeyType;
    /** The exact string written into the BR Code. */
    value: string;
}

/** One TLV as it appeared in a payload, unknown tags included. */
export interface PixField {
    /** Two-character tag, e.g. `"59"`. */
    id: string;
    /** Raw value, still encoded when the tag is itself a template. */
    value: string;
}

/** A BR Code that carries the key — the one you print on a poster. */
export interface PixStaticInput {
    kind?: "static";
    /** CPF, CNPJ, e-mail, phone or EVP. Validated and normalised. */
    key: string;
    /** Payee name. Truncated by the spec at 25 characters — longer throws. */
    merchantName: string;
    /** Payee city. Truncated by the spec at 15 characters — longer throws. */
    merchantCity: string;
    /** Amount in BRL. Omit for a payer-chooses-the-value QR. */
    amount?: number;
    /** Reference the PSP echoes back, `[A-Za-z0-9]{1,25}`. Defaults to `"***"`. */
    txid?: string;
    /** Free text shown by some wallets. Goes into tag 26, sub-tag 02. */
    description?: string;
    /** CEP, digits only. Optional tag 61. */
    postalCode?: string;
    /** Single-use QR: sets tag 01 to `"12"` instead of `"11"`. */
    oneTime?: boolean;
}

/** A BR Code that carries a URL the wallet fetches to learn the amount. */
export interface PixDynamicInput {
    kind: "dynamic";
    /**
     * `payloadLocation` — the https URL the wallet GETs, **without** the scheme,
     * exactly as BACEN specifies (`pix.example.com/qr/v2/abc`).
     */
    url: string;
    merchantName: string;
    merchantCity: string;
    postalCode?: string;
    /** Single-use QR. Defaults to `true`, which is what a dynamic QR normally is. */
    oneTime?: boolean;
}

/** Everything `pixPayload` accepts. */
export type PixInput = PixStaticInput | PixDynamicInput;

/** A payload taken apart again. */
export interface PixData {
    /** `"dynamic"` when tag 26 carried a URL instead of a key. */
    kind: "static" | "dynamic";
    /** Present on a static payload. */
    key?: string;
    keyType?: PixKeyType;
    /** Present on a dynamic payload. */
    url?: string;
    merchantName: string;
    merchantCity: string;
    /** Reais. `undefined` when the payer chooses the amount. */
    amount?: number;
    /** ISO 4217 numeric. `"986"` for BRL. */
    currency: string;
    countryCode: string;
    merchantCategoryCode: string;
    /** `"***"` on a reusable static QR that identifies no single transaction. */
    txid?: string;
    description?: string;
    postalCode?: string;
    /** Tag 01 read as `"12"`. */
    oneTime: boolean;
    /** The four hex characters that closed the payload. */
    crc: string;
    /** Whether those four characters match a recomputed CRC. */
    crcValid: boolean;
    /** Every top-level TLV, in payload order, unknown tags included. */
    fields: PixField[];
}

/** Options for {@link parsePixPayload}. */
export interface ParsePixOptions {
    /**
     * Throw when the checksum does not match. Default `true`.
     *
     * Turn it off only to inspect a payload you already know is broken: a BR Code
     * whose CRC fails has been corrupted in transit, and the account it now points
     * at is not the account the payee published.
     */
    requireCrc?: boolean;
}

/**
 * Generator polynomial of CRC-16/CCITT-FALSE, `x^16 + x^12 + x^5 + 1`.
 *
 * Taken from the CRC catalogue entry `CRC-16/IBM-3740` (alias CCITT-FALSE):
 * `width=16 poly=0x1021 init=0xffff refin=false refout=false xorout=0x0000
 * check=0x29b1`. The BACEN "Manual de Padrões para Iniciação do Pix" names this
 * exact variant for tag 63.
 */
const CRC16_POLYNOMIAL = 0x1021;

/** Register preset of CRC-16/CCITT-FALSE. Not zero — that is a different variant. */
const CRC16_INITIAL = 0xffff;

/** Keeps the shift register 16 bits wide. */
const CRC16_MASK = 0xffff;

const TAG_PAYLOAD_FORMAT = "00";
const TAG_POINT_OF_INITIATION = "01";
const TAG_MERCHANT_ACCOUNT_INFO = "26";
const TAG_MERCHANT_CATEGORY_CODE = "52";
const TAG_TRANSACTION_CURRENCY = "53";
const TAG_TRANSACTION_AMOUNT = "54";
const TAG_COUNTRY_CODE = "58";
const TAG_MERCHANT_NAME = "59";
const TAG_MERCHANT_CITY = "60";
const TAG_POSTAL_CODE = "61";
const TAG_ADDITIONAL_DATA = "62";
const TAG_CRC = "63";

const MAI_TAG_GUI = "00";
const MAI_TAG_KEY = "01";
const MAI_TAG_DESCRIPTION = "02";
const MAI_TAG_URL = "25";
const ADDITIONAL_TAG_TXID = "05";

/** Globally Unique Identifier that marks tag 26 as a Pix account. */
const PIX_GUI = "br.gov.bcb.pix";

const PAYLOAD_FORMAT_VERSION = "01";
const POINT_OF_INITIATION_REUSABLE = "11";
const POINT_OF_INITIATION_SINGLE_USE = "12";
const DEFAULT_MERCHANT_CATEGORY_CODE = "0000";
const CURRENCY_BRL = "986";
const COUNTRY_BR = "BR";
const TXID_UNSPECIFIED = "***";

const MAX_MERCHANT_NAME = 25;
const MAX_MERCHANT_CITY = 15;
const MAX_TXID = 25;
const MAX_TLV_VALUE = 99;
const MAX_EMAIL_KEY = 77;

/**
 * CRC-16/CCITT-FALSE of a string, as four upper-case hex characters.
 *
 * Bitwise rather than table-driven: 200-odd characters at 8 shifts each is
 * nothing, and a 256-entry table is 2 KB of payload every consumer of the `/br`
 * entry would carry.
 *
 * The input is taken as UTF-8 bytes. A Pix payload is ASCII by construction —
 * {@link pixPayload} rejects anything else — but the function is exported and a
 * caller may hand it arbitrary text, and hashing UTF-16 code units would then
 * disagree with every other implementation.
 *
 * @param input - Bytes to run through the register.
 * @returns Four upper-case hex characters, zero-padded.
 *
 * @example
 * pixCrc16("123456789"); // "29B1" — the catalogue check value
 */
export function pixCrc16(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let crc = CRC16_INITIAL;
    for (const byte of bytes) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc =
                (crc & 0x8000) !== 0
                    ? ((crc << 1) ^ CRC16_POLYNOMIAL) & CRC16_MASK
                    : (crc << 1) & CRC16_MASK;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Digits of a possibly masked value. */
function digits(value: string): string {
    return value.replace(/\D/g, "");
}

/**
 * Drop diacritics and reject whatever is left outside printable ASCII.
 *
 * The BR Code character set has no room for accents, and a wallet that meets one
 * either fails to parse the QR or shows mojibake. Stripping them is lossy but
 * legible ("São Paulo" → "Sao Paulo"), which beats both alternatives; anything
 * that is not a diacritic — an emoji, a CJK character — is a mistake the caller
 * has to see, so it throws.
 */
function toPayloadText(value: string, field: string): string {
    const stripped = value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (/[^\x20-\x7E]/.test(stripped)) {
        throw new PixError(
            `${field} has characters the BR Code cannot carry: ${JSON.stringify(value)}. ` +
                "Use unaccented ASCII.",
        );
    }
    return stripped;
}

/** One `ID + 2-digit length + value` triple. */
function tlv(id: string, value: string): string {
    if (value.length > MAX_TLV_VALUE) {
        throw new PixError(
            `Tag ${id} is ${value.length} characters; the EMV length field holds at most ${MAX_TLV_VALUE}.`,
        );
    }
    return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/**
 * Classify a Pix key, or `null` when it matches no accepted format.
 *
 * !!! warning "CPF and a national phone number are both eleven digits"
 *     `"11987654321"` is a valid mobile number and could be a CPF. The check
 *     digits break the tie: an 11-digit string is a CPF when its DV validates and
 *     a phone otherwise. Pass phone keys as `+5511987654321` to remove the guess
 *     entirely.
 *
 * @param key - Raw key, masked or not.
 * @returns The key type, or `null`.
 */
export function pixKeyType(key: string): PixKeyType | null {
    const trimmed = key.trim();
    if (trimmed === "") return null;

    if (trimmed.includes("@")) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) && trimmed.length <= MAX_EMAIL_KEY
            ? "email"
            : null;
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
        return "evp";
    }

    const numbers = digits(trimmed);
    if (numbers.length === 14) return validateCNPJ(numbers) ? "cnpj" : null;
    if (numbers.length === 11 && validateCPF(numbers)) return "cpf";
    if (trimmed.startsWith("+")) {
        return /^\+55\d{10,11}$/.test(`+${numbers}`) ? "phone" : null;
    }
    if (numbers.length === 10 || numbers.length === 11) return "phone";
    if (numbers.length === 12 || numbers.length === 13) {
        return numbers.startsWith("55") ? "phone" : null;
    }
    return null;
}

/**
 * Validate a Pix key and return the exact string to write into the payload.
 *
 * Normalisation per type: CPF and CNPJ lose their mask, a phone becomes E.164
 * with the `+55` country code, an EVP is lower-cased, and an e-mail is
 * lower-cased because DICT stores it that way — a key that differs only in case
 * would otherwise fail to resolve.
 *
 * All validation lives in {@link pixKeyType}; past that gate the normalisation is
 * total, which is why the phone branch strips a country code purely on length
 * rather than re-checking the shape.
 *
 * @param key - Raw key, masked or not.
 * @returns The type and the normalised value.
 * @throws {PixError} When the key matches no accepted format, or when a document
 * key fails its check digits.
 *
 * @example
 * normalizePixKey("123.456.789-09"); // { type: "cpf", value: "12345678909" }
 * normalizePixKey("(11) 98765-4321"); // { type: "phone", value: "+5511987654321" }
 */
export function normalizePixKey(key: string): NormalizedPixKey {
    const trimmed = key.trim();
    const type = pixKeyType(trimmed);
    if (type === null) {
        throw new PixError(
            `Not a Pix key: ${JSON.stringify(key)}. Expected a CPF, CNPJ, e-mail, ` +
                "phone (+5511987654321) or EVP (UUID).",
        );
    }

    if (type === "email") return { type, value: trimmed.toLowerCase() };
    if (type === "evp") return { type, value: trimmed.toLowerCase() };
    if (type === "phone") {
        const numbers = digits(trimmed);
        return { type, value: `+55${numbers.length > 11 ? numbers.slice(2) : numbers}` };
    }
    return { type, value: digits(trimmed) };
}

/** Format an amount the way tag 54 wants it: dot separator, two decimals. */
function toAmountField(amount: number): string {
    if (!Number.isFinite(amount)) {
        throw new PixError(`Amount must be a finite number, got ${amount}.`);
    }
    if (amount <= 0) {
        throw new PixError(
            `Amount must be positive, got ${amount}. Omit \`amount\` for a QR whose value the payer types.`,
        );
    }
    const field = amount.toFixed(2);
    if (field.length > 13) {
        throw new PixError(`Amount ${field} does not fit tag 54, which holds 13 characters.`);
    }
    return field;
}

/** Bound the two free-text identity fields the spec caps hard. */
function toBoundedText(value: string, max: number, field: string): string {
    const text = toPayloadText(value.trim(), field);
    if (text === "") throw new PixError(`${field} is required.`);
    if (text.length > max) {
        throw new PixError(
            `${field} is ${text.length} characters; the BR Code allows ${max}. Shorten it — ` +
                "truncating here would silently change what the payer sees.",
        );
    }
    return text;
}

/** Tag 62, which exists only to carry the txid. */
function additionalDataField(txid: string | undefined): string {
    const value = txid?.trim() ?? "";
    if (value === "" || value === TXID_UNSPECIFIED) {
        return tlv(TAG_ADDITIONAL_DATA, tlv(ADDITIONAL_TAG_TXID, TXID_UNSPECIFIED));
    }
    if (!new RegExp(`^[A-Za-z0-9]{1,${MAX_TXID}}$`).test(value)) {
        throw new PixError(
            `txid must be 1 to ${MAX_TXID} letters or digits, got ${JSON.stringify(txid)}.`,
        );
    }
    return tlv(TAG_ADDITIONAL_DATA, tlv(ADDITIONAL_TAG_TXID, value));
}

/** Tag 26 for a static payload: GUI, key and the optional description. */
function staticMerchantAccount(input: PixStaticInput): string {
    const { value } = normalizePixKey(input.key);
    let inner = tlv(MAI_TAG_GUI, PIX_GUI) + tlv(MAI_TAG_KEY, value);
    const description = input.description?.trim();
    if (description !== undefined && description !== "") {
        inner += tlv(MAI_TAG_DESCRIPTION, toPayloadText(description, "description"));
    }
    if (inner.length > MAX_TLV_VALUE) {
        throw new PixError(
            `Tag 26 is ${inner.length} characters, over the ${MAX_TLV_VALUE} the length field allows. ` +
                "Shorten `description`.",
        );
    }
    return tlv(TAG_MERCHANT_ACCOUNT_INFO, inner);
}

/** Tag 26 for a dynamic payload: GUI plus the URL, and no key. */
function dynamicMerchantAccount(input: PixDynamicInput): string {
    const url = toPayloadText(input.url.trim(), "url").replace(/^https?:\/\//i, "");
    if (url === "") throw new PixError("url is required for a dynamic BR Code.");
    const inner = tlv(MAI_TAG_GUI, PIX_GUI) + tlv(MAI_TAG_URL, url);
    if (inner.length > MAX_TLV_VALUE) {
        throw new PixError(
            `Tag 26 is ${inner.length} characters, over the ${MAX_TLV_VALUE} the length field allows. ` +
                "Shorten the payload URL.",
        );
    }
    return tlv(TAG_MERCHANT_ACCOUNT_INFO, inner);
}

/**
 * Build a Pix "Copia e Cola" payload — the string behind a Pix QR code.
 *
 * The format is EMVCo MPM: a flat list of `ID + 2-digit length + value` triples,
 * closed by tag 63 holding a CRC-16/CCITT-FALSE over **everything before it,
 * including the literal `6304` header of tag 63 itself**. That last detail is the
 * one implementations get wrong; see {@link pixCrc16}.
 *
 * Two shapes come out of here:
 *
 * - **static** — tag 26 carries the key, so the QR is self-contained and can be
 *   printed. Amount optional; a txid of `"***"` means "identifies no single
 *   transaction", which is what a reusable poster QR wants.
 * - **dynamic** — tag 26 carries a URL instead, and the wallet fetches the amount
 *   and payee from the PSP. Use it when the value is per-order. Defaults to
 *   single-use (tag 01 = `12`).
 *
 * The distinction matters and is not cosmetic: a static QR settles against
 * whatever the payer typed, a dynamic one against what the PSP served, so a
 * charge that must reconcile to a cent needs the dynamic form.
 *
 * @param input - Static or dynamic payload description.
 * @returns The full payload, CRC included, ready to render as a QR or to copy.
 * @throws {PixError} On an unrecognised key, a field over its length cap, a
 * non-positive amount, or text that is not representable in the BR Code.
 *
 * @example
 * pixPayload({
 *   key: "12345678909",
 *   merchantName: "Loja Tempest",
 *   merchantCity: "São Paulo",
 *   amount: 25.5,
 *   txid: "PEDIDO123",
 * });
 */
export function pixPayload(input: PixInput): string {
    const dynamic = input.kind === "dynamic";
    const oneTime = input.oneTime ?? dynamic;

    let payload = tlv(TAG_PAYLOAD_FORMAT, PAYLOAD_FORMAT_VERSION);
    payload += tlv(
        TAG_POINT_OF_INITIATION,
        oneTime ? POINT_OF_INITIATION_SINGLE_USE : POINT_OF_INITIATION_REUSABLE,
    );
    payload += dynamic ? dynamicMerchantAccount(input) : staticMerchantAccount(input);
    payload += tlv(TAG_MERCHANT_CATEGORY_CODE, DEFAULT_MERCHANT_CATEGORY_CODE);
    payload += tlv(TAG_TRANSACTION_CURRENCY, CURRENCY_BRL);
    if (!dynamic && input.amount !== undefined) {
        payload += tlv(TAG_TRANSACTION_AMOUNT, toAmountField(input.amount));
    }
    payload += tlv(TAG_COUNTRY_CODE, COUNTRY_BR);
    payload += tlv(
        TAG_MERCHANT_NAME,
        toBoundedText(input.merchantName, MAX_MERCHANT_NAME, "merchantName"),
    );
    payload += tlv(
        TAG_MERCHANT_CITY,
        toBoundedText(input.merchantCity, MAX_MERCHANT_CITY, "merchantCity"),
    );
    const postalCode = input.postalCode === undefined ? "" : digits(input.postalCode);
    if (postalCode !== "") payload += tlv(TAG_POSTAL_CODE, postalCode);
    payload += additionalDataField(dynamic ? TXID_UNSPECIFIED : input.txid);

    const withCrcHeader = `${payload}${TAG_CRC}04`;
    return `${withCrcHeader}${pixCrc16(withCrcHeader)}`;
}

/**
 * Split a flat run of TLVs. Stops cleanly at the first malformed triple.
 *
 * @throws {PixError} When a length prefix is not two digits or runs past the end.
 */
function parseTlv(input: string, where: string): PixField[] {
    const fields: PixField[] = [];
    let cursor = 0;
    while (cursor < input.length) {
        const id = input.slice(cursor, cursor + 2);
        const rawLength = input.slice(cursor + 2, cursor + 4);
        if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(rawLength)) {
            throw new PixError(
                `Malformed TLV in ${where} at offset ${cursor}: expected a 2-digit tag and length.`,
            );
        }
        const length = Number(rawLength);
        const start = cursor + 4;
        if (start + length > input.length) {
            throw new PixError(
                `Tag ${id} in ${where} declares ${length} characters but only ${input.length - start} remain.`,
            );
        }
        fields.push({ id, value: input.slice(start, start + length) });
        cursor = start + length;
    }
    return fields;
}

/** First value for a tag, or `undefined`. */
function pick(fields: readonly PixField[], id: string): string | undefined {
    return fields.find((field) => field.id === id)?.value;
}

/**
 * Read a Pix "Copia e Cola" payload back into its parts.
 *
 * Tolerant by design: tags the SDK does not know about are kept verbatim in
 * {@link PixData.fields} instead of raising, because PSPs do add their own
 * templates and a reader that rejects them is useless in production. What is
 * *not* tolerated is a broken frame — a length prefix that runs off the end, a
 * missing tag 63 — or a checksum mismatch, which means the string was corrupted
 * and no longer names the account the payee published.
 *
 * @param payload - The copia-e-cola string. Surrounding whitespace is ignored.
 * @param options - See {@link ParsePixOptions}.
 * @returns The decoded payload.
 * @throws {PixError} On a malformed frame, a missing CRC tag, a tag 26 that is
 * not a Pix account, or — unless `requireCrc` is `false` — a CRC mismatch.
 *
 * @example
 * const data = parsePixPayload(copied);
 * console.log(data.key, data.amount, data.txid);
 */
export function parsePixPayload(payload: string, options: ParsePixOptions = {}): PixData {
    const { requireCrc = true } = options;
    const text = payload.trim();
    if (text.length < 8) throw new PixError("Payload is too short to be a BR Code.");

    const crcHeaderAt = text.length - 8;
    if (text.slice(crcHeaderAt, crcHeaderAt + 4) !== `${TAG_CRC}04`) {
        throw new PixError("Payload does not end in a `6304` CRC tag.");
    }
    const crc = text.slice(-4).toUpperCase();
    const expected = pixCrc16(text.slice(0, -4));
    const crcValid = crc === expected;
    if (!crcValid && requireCrc) {
        throw new PixError(`CRC mismatch: payload says ${crc}, recomputed ${expected}.`);
    }

    const fields = parseTlv(text.slice(0, crcHeaderAt), "payload");
    const merchantAccount = pick(fields, TAG_MERCHANT_ACCOUNT_INFO);
    if (merchantAccount === undefined) {
        throw new PixError("Payload has no tag 26 (merchant account information).");
    }
    const account = parseTlv(merchantAccount, "tag 26");
    const gui = pick(account, MAI_TAG_GUI);
    if (gui?.toLowerCase() !== PIX_GUI) {
        throw new PixError(
            `Tag 26 is not a Pix account: expected GUI ${PIX_GUI}, got ${JSON.stringify(gui)}.`,
        );
    }

    const url = pick(account, MAI_TAG_URL);
    const key = pick(account, MAI_TAG_KEY);
    const amountField = pick(fields, TAG_TRANSACTION_AMOUNT);
    const txid = pick(
        parseTlv(pick(fields, TAG_ADDITIONAL_DATA) ?? "", "tag 62"),
        ADDITIONAL_TAG_TXID,
    );

    return {
        kind: url !== undefined && key === undefined ? "dynamic" : "static",
        ...(key === undefined ? {} : { key, keyType: pixKeyType(key) ?? undefined }),
        ...(url === undefined ? {} : { url }),
        merchantName: pick(fields, TAG_MERCHANT_NAME) ?? "",
        merchantCity: pick(fields, TAG_MERCHANT_CITY) ?? "",
        ...(amountField === undefined ? {} : { amount: Number(amountField) }),
        currency: pick(fields, TAG_TRANSACTION_CURRENCY) ?? "",
        countryCode: pick(fields, TAG_COUNTRY_CODE) ?? "",
        merchantCategoryCode: pick(fields, TAG_MERCHANT_CATEGORY_CODE) ?? "",
        ...(txid === undefined ? {} : { txid }),
        ...(pick(account, MAI_TAG_DESCRIPTION) === undefined
            ? {}
            : { description: pick(account, MAI_TAG_DESCRIPTION) }),
        ...(pick(fields, TAG_POSTAL_CODE) === undefined
            ? {}
            : { postalCode: pick(fields, TAG_POSTAL_CODE) }),
        oneTime: pick(fields, TAG_POINT_OF_INITIATION) === POINT_OF_INITIATION_SINGLE_USE,
        crc,
        crcValid,
        fields,
    };
}
