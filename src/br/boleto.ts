/**
 * A boleto string could not be read, or failed a check digit.
 *
 * Its own class so a scanner screen can tell "this is not a boleto" apart from a
 * bug, and so the message can be shown to the operator as-is.
 */
export class BoletoError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BoletoError";
    }
}

/**
 * The two incompatible layouts that share the 44-digit barcode.
 *
 * `"banco"` is the cobrança boleto every bank issues; `"arrecadacao"` is the
 * concessionária/tributo slip, which starts with `8` and lays out its 44 digits
 * completely differently — same length, different meaning for every field.
 */
export type BoletoKind = "banco" | "arrecadacao";

/** Which base date the fator de vencimento counts from. See {@link boletoDueDate}. */
export type BoletoEpoch = "auto" | "legacy" | "current";

/** Options shared by every parser here. */
export interface BoletoOptions {
    /** Fator de vencimento epoch. Default `"auto"`. */
    epoch?: BoletoEpoch;
    /** Date `"auto"` measures proximity against. Default `new Date()`. */
    reference?: Date;
}

/** A cobrança boleto — the kind a bank issues against an invoice. */
export interface BoletoBanco {
    kind: "banco";
    /** 44 digits. */
    codigoBarras: string;
    /** 47 digits. */
    linhaDigitavel: string;
    /** 3-digit bank code in the clearing house, e.g. `"341"`. */
    banco: string;
    /** 1 digit. `"9"` is BRL; nothing else is in use. */
    moeda: string;
    /** `"Real"` for `"9"`, `null` for anything else. */
    moedaLabel: string | null;
    /** The general check digit, position 5 of the barcode. */
    dv: string;
    /** Raw 4-digit field. `0` means the boleto carries no due date. */
    fatorVencimento: number;
    /** Due date, or `null` when the fator is `0`. */
    vencimento: Date | null;
    /** Which epoch {@link vencimento} was resolved under. `null` when there is none. */
    vencimentoEpoch: Exclude<BoletoEpoch, "auto"> | null;
    /** Reais. `0` when the issuer left the amount for the payer to fill in. */
    valor: number;
    /** 25 digits the issuing bank defines. Not interpretable without its manual. */
    campoLivre: string;
}

/** An arrecadação/convênio slip — utilities, taxes, traffic fines. */
export interface BoletoArrecadacao {
    kind: "arrecadacao";
    /** 44 digits, always starting with `8`. */
    codigoBarras: string;
    /** 48 digits, in four blocks of twelve. */
    linhaDigitavel: string;
    /** Position 2. See {@link segmentoLabel}. */
    segmento: number;
    /** Human label, or `null` for a value the layout does not define. */
    segmentoLabel: string | null;
    /** Position 3: `6`/`8` mean real money, `7`/`9` mean a reference quantity. */
    identificacaoValor: number;
    /** Which modulo position 3 selects for the general check digit. */
    dvModulo: 10 | 11;
    /** The general check digit, position 4. */
    dv: string;
    /** Reais, or `null` when position 3 says the field is a reference, not money. */
    valor: number | null;
    /** The raw 11-digit value field, useful when {@link valor} is `null`. */
    valorRaw: string;
    /**
     * Positions 16-19 — the 4-digit code FEBRABAN assigns the company — or, on
     * segmento 6, positions 16-23, which are the first eight CNPJ digits.
     */
    empresa: string;
    /** `true` when {@link empresa} is a CNPJ prefix rather than a FEBRABAN code. */
    empresaIsCnpj: boolean;
    /** 25 digits, or 21 when the CNPJ took four of them. Issuer-defined. */
    campoLivre: string;
    /**
     * Due date read from the first eight digits of the campo livre.
     *
     * The layout says a due date, **if present**, must sit there as `AAAAMMDD` —
     * but the field is optional and nothing marks its presence, so a campo livre
     * that merely looks like a date lands here too. Treat it as a hint for a UI,
     * never as the date a payment settles against.
     */
    vencimentoCampoLivre: Date | null;
}

/** What the two parsers return. Narrow on `kind`. */
export type Boleto = BoletoBanco | BoletoArrecadacao;

/** Base date of the fator de vencimento as FEBRABAN defined it in 1997. */
const LEGACY_EPOCH_UTC = Date.UTC(1997, 9, 7);

/**
 * Base date the fator de vencimento restarted from.
 *
 * FEBRABAN communication FB-009/2023: the 4-digit field hit its ceiling of 9999
 * on 2025-02-21 (1997-10-07 + 9999 days), so from 2025-02-22 the counter restarts
 * at 1000 against a new base of 2022-05-29 (2022-05-29 + 1000 days = 2025-02-22).
 */
const CURRENT_EPOCH_UTC = Date.UTC(2022, 4, 29);

const MS_PER_DAY = 86_400_000;

/** First fator FEBRABAN ever put in circulation, in either epoch. */
const FATOR_MIN = 1000;

/** Last fator the 4-digit field can hold. */
const FATOR_MAX = 9999;

const MOD10_WEIGHTS = [2, 1] as const;
const MOD11_WEIGHT_FIRST = 2;
const MOD11_WEIGHT_LAST = 9;

const SEGMENTO_LABELS: Record<number, string> = {
    1: "Prefeituras",
    2: "Saneamento",
    3: "Energia elétrica e gás",
    4: "Telecomunicações",
    5: "Órgãos governamentais",
    6: "Carnes e assemelhados ou empresas identificadas por CNPJ",
    7: "Multas de trânsito",
    9: "Uso exclusivo do banco",
};

/** Segmento whose company identifier is a CNPJ prefix instead of a FEBRABAN code. */
const SEGMENTO_CNPJ = 6;

/** Digits of a value that may carry the usual dots, spaces and dashes. */
function digits(value: string): string {
    return value.replace(/\D/g, "");
}

/**
 * DAC módulo 10, FEBRABAN flavour.
 *
 * Multipliers cycle `2, 1, 2, 1, …` from right to left; the **digits** of each
 * product are summed individually (so `6 × 2 = 12` contributes `1 + 2`); the DAC
 * is `10 - (sum mod 10)`, and `0` when that remainder is `0`.
 *
 * Ported from "Layout Padrão de Arrecadação/Recebimento com Utilização do Código
 * de Barras", FEBRABAN version 07 (effective 2023-03-01), section 07 — whose own
 * worked example gives `01230067896 → 3`.
 *
 * @param value - Digits only.
 * @returns The check digit, 0-9.
 * @throws {BoletoError} When `value` is empty or holds a non-digit.
 */
export function mod10Dac(value: string): number {
    if (!/^\d+$/.test(value))
        throw new BoletoError(`mod10Dac needs digits, got ${JSON.stringify(value)}.`);
    let sum = 0;
    for (let index = 0; index < value.length; index += 1) {
        const fromRight = value.length - 1 - index;
        const product = Number(value[index]) * MOD10_WEIGHTS[fromRight % MOD10_WEIGHTS.length]!;
        sum += product > 9 ? product - 9 : product;
    }
    const remainder = sum % 10;
    return remainder === 0 ? 0 : 10 - remainder;
}

/** Sum of `digit × weight` with weights cycling 2…9 from the right. */
function mod11Sum(value: string): number {
    const span = MOD11_WEIGHT_LAST - MOD11_WEIGHT_FIRST + 1;
    let sum = 0;
    for (let index = 0; index < value.length; index += 1) {
        const fromRight = value.length - 1 - index;
        sum += Number(value[index]) * (MOD11_WEIGHT_FIRST + (fromRight % span));
    }
    return sum;
}

/**
 * DAC módulo 11 for a **cobrança** barcode — position 5 of a bank boleto.
 *
 * Weights cycle `2…9` from right to left, the products are summed whole, and the
 * DAC is `11 - (sum mod 11)`. A remainder of `0`, `1` or `10` would put `11`, `10`
 * or `1` in a one-digit field, and FEBRABAN resolves all three to **`1`**.
 *
 * That last rule is where cobrança and arrecadação disagree — see
 * {@link mod11DacArrecadacao}, which resolves the same remainders to `0`. Using
 * one flavour on the other layout produces a check digit that is wrong exactly
 * 3 times in 11, which is why they are separate functions here.
 *
 * @param value - The 43 digits of the barcode with position 5 removed.
 * @returns The check digit, 1-9.
 * @throws {BoletoError} When `value` is empty or holds a non-digit.
 */
export function mod11DacCobranca(value: string): number {
    if (!/^\d+$/.test(value)) {
        throw new BoletoError(`mod11DacCobranca needs digits, got ${JSON.stringify(value)}.`);
    }
    const remainder = mod11Sum(value) % 11;
    return remainder === 0 || remainder === 1 || remainder === 10 ? 1 : 11 - remainder;
}

/**
 * DAC módulo 11 for an **arrecadação** barcode — position 4 of a `8…` slip.
 *
 * Same weights and same subtraction as {@link mod11DacCobranca}, but a remainder
 * of `0` or `1` resolves to **`0`**.
 *
 * Ported from the FEBRABAN version 07 layout, section 10, and pinned by that
 * document's own worked example: the 43-digit sequence
 * `8220000215048200974123220154098290108605940` sums to 705, `705 mod 11 = 1`,
 * and the barcode the spec prints carries `0` in position 4.
 *
 * @param value - The 43 digits of the barcode with position 4 removed.
 * @returns The check digit, 0 or 2-9.
 * @throws {BoletoError} When `value` is empty or holds a non-digit.
 */
export function mod11DacArrecadacao(value: string): number {
    if (!/^\d+$/.test(value)) {
        throw new BoletoError(`mod11DacArrecadacao needs digits, got ${JSON.stringify(value)}.`);
    }
    const remainder = mod11Sum(value) % 11;
    return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
}

/**
 * Which layout a string is in, without throwing.
 *
 * @param value - A barcode or typed line, masked or not.
 * @returns The layout, or `null` when the length is not 44, 47 or 48.
 */
export function boletoKind(value: string): BoletoKind | null {
    const raw = digits(value);
    if (raw.length === 47) return "banco";
    if (raw.length === 48) return "arrecadacao";
    if (raw.length === 44) return raw.startsWith("8") ? "arrecadacao" : "banco";
    return null;
}

/** Local midnight of the calendar day `days` after a UTC epoch. */
function dayAfter(epochUtcMs: number, days: number): Date {
    const utc = new Date(epochUtcMs + days * MS_PER_DAY);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/**
 * Resolve a fator de vencimento to a calendar date.
 *
 * The field is four digits of days since a base date, and it has had **two** base
 * dates: 1997-10-07 until the counter saturated at 9999 on 2025-02-21, then
 * 2022-05-29 from 2025-02-22, when FEBRABAN restarted it at 1000.
 *
 * !!! danger "The two epochs are genuinely ambiguous"
 *     Every fator from 1000 to 9999 has a reading under each base — 1997-10-07
 *     gives a date in `2000-07-03 … 2025-02-21`, 2022-05-29 gives one in
 *     `2025-02-22 … 2049-10-14`. Nothing in the barcode says which. `"auto"`
 *     picks whichever lands nearer `reference`, which is right for the case that
 *     matters (a slip being paid now) and wrong for an archive sweep. Pass
 *     `"legacy"` or `"current"` when you know.
 *
 * @param fator - The raw 4-digit field as a number. `0` means "no due date".
 * @param options - Epoch selection. Default `"auto"` against `new Date()`.
 * @returns Local midnight of the due date, or `null` when `fator` is `0`.
 *
 * @example
 * boletoDueDate(1000, { epoch: "legacy" });  // 2000-07-03
 * boletoDueDate(1000, { epoch: "current" }); // 2025-02-22
 */
export function boletoDueDate(
    fator: number,
    options: BoletoOptions = {},
): { date: Date; epoch: Exclude<BoletoEpoch, "auto"> } | null {
    if (fator === 0) return null;
    const { epoch = "auto", reference = new Date() } = options;

    if (epoch === "legacy") return { date: dayAfter(LEGACY_EPOCH_UTC, fator), epoch: "legacy" };
    if (epoch === "current") return { date: dayAfter(CURRENT_EPOCH_UTC, fator), epoch: "current" };

    const legacy = dayAfter(LEGACY_EPOCH_UTC, fator);
    if (fator < FATOR_MIN) return { date: legacy, epoch: "legacy" };
    const current = dayAfter(CURRENT_EPOCH_UTC, fator);
    const at = reference.getTime();
    return Math.abs(current.getTime() - at) <= Math.abs(legacy.getTime() - at)
        ? { date: current, epoch: "current" }
        : { date: legacy, epoch: "legacy" };
}

/**
 * Invert {@link boletoDueDate}: the fator that encodes a due date.
 *
 * @param date - The due date. Only its local calendar day is used.
 * @param epoch - Base date to count from. Default `"current"`, the epoch in force
 * since 2025-02-22 and therefore the one a boleto issued today must use.
 * @returns The 4-digit fator.
 * @throws {BoletoError} When the date falls outside the 1000-9999 window of that
 * epoch, because no fator can represent it.
 *
 * @example
 * fatorVencimento(new Date(2025, 1, 22)); // 1000
 */
export function fatorVencimento(
    date: Date,
    epoch: Exclude<BoletoEpoch, "auto"> = "current",
): number {
    const base = epoch === "legacy" ? LEGACY_EPOCH_UTC : CURRENT_EPOCH_UTC;
    const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const fator = Math.round((target - base) / MS_PER_DAY);
    if (fator < FATOR_MIN || fator > FATOR_MAX) {
        throw new BoletoError(
            `${date.toISOString().slice(0, 10)} is fator ${fator} under the "${epoch}" epoch, ` +
                `outside the ${FATOR_MIN}-${FATOR_MAX} the field holds.`,
        );
    }
    return fator;
}

/**
 * `AAAAMMDD` at the head of an arrecadação campo livre, when it reads as a date.
 *
 * The caller only ever passes a slice of a validated barcode, so the head is
 * always eight digits; what is not guaranteed is that those digits are a date, and
 * `20260231` has to come back `null` rather than roll into March.
 */
function campoLivreDate(campoLivre: string): Date | null {
    const head = campoLivre.slice(0, 8);
    const year = Number(head.slice(0, 4));
    const month = Number(head.slice(4, 6));
    const day = Number(head.slice(6, 8));
    if (year < 1997 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Assemble the 47-digit typed line from a validated 44-digit bank barcode. */
function bancoLinha(barcode: string): string {
    const campoLivre = barcode.slice(19);
    const field1 = barcode.slice(0, 4) + campoLivre.slice(0, 5);
    const field2 = campoLivre.slice(5, 15);
    const field3 = campoLivre.slice(15, 25);
    return (
        field1 +
        mod10Dac(field1) +
        field2 +
        mod10Dac(field2) +
        field3 +
        mod10Dac(field3) +
        barcode.slice(4, 5) +
        barcode.slice(5, 19)
    );
}

/** Assemble the 48-digit typed line from a validated 44-digit arrecadação barcode. */
function arrecadacaoLinha(barcode: string): string {
    const dac = mod11Selector(barcode) === 11 ? mod11DacArrecadacao : mod10Dac;
    let line = "";
    for (let start = 0; start < 44; start += 11) {
        const block = barcode.slice(start, start + 11);
        line += block + dac(block);
    }
    return line;
}

/** Which modulo position 3 of an arrecadação barcode selects. */
function mod11Selector(barcode: string): 10 | 11 {
    return barcode[2] === "8" || barcode[2] === "9" ? 11 : 10;
}

/** Read a 44-digit bank barcode, whose general DV has already been checked. */
function readBanco(barcode: string, options: BoletoOptions): BoletoBanco {
    const fator = Number(barcode.slice(5, 9));
    const due = boletoDueDate(fator, options);
    const moeda = barcode.slice(3, 4);
    return {
        kind: "banco",
        codigoBarras: barcode,
        linhaDigitavel: bancoLinha(barcode),
        banco: barcode.slice(0, 3),
        moeda,
        moedaLabel: moeda === "9" ? "Real" : null,
        dv: barcode.slice(4, 5),
        fatorVencimento: fator,
        vencimento: due?.date ?? null,
        vencimentoEpoch: due?.epoch ?? null,
        valor: Number(barcode.slice(9, 19)) / 100,
        campoLivre: barcode.slice(19),
    };
}

/** Read a 44-digit arrecadação barcode, whose general DV has already been checked. */
function readArrecadacao(barcode: string): BoletoArrecadacao {
    const segmento = Number(barcode[1]);
    const identificacaoValor = Number(barcode[2]);
    const empresaIsCnpj = segmento === SEGMENTO_CNPJ;
    const campoLivre = empresaIsCnpj ? barcode.slice(23) : barcode.slice(19);
    const valorRaw = barcode.slice(4, 15);
    const isMoney = identificacaoValor === 6 || identificacaoValor === 8;
    return {
        kind: "arrecadacao",
        codigoBarras: barcode,
        linhaDigitavel: arrecadacaoLinha(barcode),
        segmento,
        segmentoLabel: SEGMENTO_LABELS[segmento] ?? null,
        identificacaoValor,
        dvModulo: mod11Selector(barcode),
        dv: barcode.slice(3, 4),
        valor: isMoney ? Number(valorRaw) / 100 : null,
        valorRaw,
        empresa: empresaIsCnpj ? barcode.slice(15, 23) : barcode.slice(15, 19),
        empresaIsCnpj,
        campoLivre,
        vencimentoCampoLivre: campoLivreDate(campoLivre),
    };
}

/** Recompute and compare the general check digit of a 44-digit barcode. */
function assertBarcodeDv(barcode: string): void {
    if (barcode.startsWith("8")) {
        const body = barcode.slice(0, 3) + barcode.slice(4);
        const dac = mod11Selector(barcode) === 11 ? mod11DacArrecadacao(body) : mod10Dac(body);
        if (String(dac) !== barcode[3]) {
            throw new BoletoError(
                `Arrecadação check digit is ${barcode[3]}, recomputed ${dac} (módulo ${mod11Selector(barcode)}).`,
            );
        }
        return;
    }
    const dac = mod11DacCobranca(barcode.slice(0, 4) + barcode.slice(5));
    if (String(dac) !== barcode[4]) {
        throw new BoletoError(`Barcode check digit is ${barcode[4]}, recomputed ${dac}.`);
    }
}

/** Reject an arrecadação barcode whose position 3 is not one of 6, 7, 8, 9. */
function assertIdentificacaoValor(barcode: string): void {
    if (!"6789".includes(barcode[2]!)) {
        throw new BoletoError(
            `Position 3 of an arrecadação barcode must be 6, 7, 8 or 9 (identificação do valor), got ${barcode[2]}.`,
        );
    }
}

/**
 * Read a 44-digit barcode — either layout — into its fields.
 *
 * The first digit picks the layout: `8` is an arrecadação/convênio slip, anything
 * else is a cobrança boleto. They are **not** variants of one format; every field
 * moves. Narrow the result on `kind` before touching it.
 *
 * @param value - 44 digits. Spaces and punctuation are ignored.
 * @param options - Fator de vencimento epoch. See {@link boletoDueDate}.
 * @returns The parsed boleto, with the matching typed line filled in.
 * @throws {BoletoError} On a length other than 44, on a general check digit that
 * does not recompute, or on an arrecadação slip whose position 3 is out of spec.
 *
 * @example
 * const boleto = parseCodigoBarras(scanned);
 * if (boleto.kind === "banco") console.log(boleto.valor, boleto.vencimento);
 */
export function parseCodigoBarras(value: string, options: BoletoOptions = {}): Boleto {
    const barcode = digits(value);
    if (barcode.length !== 44) {
        throw new BoletoError(
            `A barcode has 44 digits, got ${barcode.length}. ` +
                "A 47- or 48-digit string is a typed line — use parseLinhaDigitavel.",
        );
    }
    if (barcode.startsWith("8")) {
        assertIdentificacaoValor(barcode);
        assertBarcodeDv(barcode);
        return readArrecadacao(barcode);
    }
    assertBarcodeDv(barcode);
    return readBanco(barcode, options);
}

/**
 * Read a typed line — 47 digits for a bank boleto, 48 for an arrecadação slip.
 *
 * Both layouts interleave check digits with the data, so the function rebuilds the
 * 44-digit barcode as it goes and every DV is verified: the three (bank) or four
 * (arrecadação) block digits, plus the general one.
 *
 * @param value - 47 or 48 digits. The usual `.`, ` ` and `-` are ignored.
 * @param options - Fator de vencimento epoch. See {@link boletoDueDate}.
 * @returns The parsed boleto, with the barcode filled in.
 * @throws {BoletoError} On a length other than 47 or 48, or on any check digit
 * that does not recompute.
 *
 * @example
 * const boleto = parseLinhaDigitavel("34191.09008 64592.181109 00000.463074 1 84410000002000");
 */
export function parseLinhaDigitavel(value: string, options: BoletoOptions = {}): Boleto {
    const line = digits(value);
    if (line.length === 47) return parseCodigoBarras(bancoBarcode(line), options);
    if (line.length === 48) return parseCodigoBarras(arrecadacaoBarcode(line), options);
    throw new BoletoError(
        `A typed line has 47 digits (bank) or 48 (arrecadação), got ${line.length}. ` +
            "A 44-digit string is a barcode — use parseCodigoBarras.",
    );
}

/** Verify the three field DVs of a 47-digit line and rebuild the barcode. */
function bancoBarcode(line: string): string {
    const fields: [string, string][] = [
        [line.slice(0, 9), line.slice(9, 10)],
        [line.slice(10, 20), line.slice(20, 21)],
        [line.slice(21, 31), line.slice(31, 32)],
    ];
    fields.forEach(([body, dv], index) => {
        const dac = mod10Dac(body);
        if (String(dac) !== dv) {
            throw new BoletoError(
                `Field ${index + 1} check digit is ${dv}, recomputed ${dac} (módulo 10).`,
            );
        }
    });
    return (
        line.slice(0, 4) +
        line.slice(32, 33) +
        line.slice(33, 47) +
        line.slice(4, 9) +
        line.slice(10, 20) +
        line.slice(21, 31)
    );
}

/** Verify the four block DVs of a 48-digit line and rebuild the barcode. */
function arrecadacaoBarcode(line: string): string {
    const blocks = [0, 12, 24, 36].map((start) => ({
        body: line.slice(start, start + 11),
        dv: line.slice(start + 11, start + 12),
    }));
    const barcode = blocks.map((block) => block.body).join("");
    if (!barcode.startsWith("8")) {
        throw new BoletoError(
            `A 48-digit typed line is an arrecadação slip and must start with 8, got ${barcode[0]}.`,
        );
    }
    assertIdentificacaoValor(barcode);
    const dac = mod11Selector(barcode) === 11 ? mod11DacArrecadacao : mod10Dac;
    blocks.forEach((block, index) => {
        const expected = dac(block.body);
        if (String(expected) !== block.dv) {
            throw new BoletoError(
                `Block ${index + 1} check digit is ${block.dv}, recomputed ${expected} ` +
                    `(módulo ${mod11Selector(barcode)}).`,
            );
        }
    });
    return barcode;
}

/**
 * Convert a typed line to its 44-digit barcode.
 *
 * @param value - 47 or 48 digits.
 * @returns The 44-digit barcode.
 * @throws {BoletoError} On a bad length or a check digit that does not recompute.
 */
export function linhaDigitavelToCodigoBarras(value: string): string {
    return parseLinhaDigitavel(value).codigoBarras;
}

/**
 * Convert a 44-digit barcode to its typed line — 47 digits, or 48 for `8…`.
 *
 * @param value - 44 digits.
 * @returns The typed line, check digits included.
 * @throws {BoletoError} On a bad length or a general check digit that does not
 * recompute.
 */
export function codigoBarrasToLinhaDigitavel(value: string): string {
    return parseCodigoBarras(value).linhaDigitavel;
}

/**
 * Whether a boleto string is internally consistent.
 *
 * Checks every digit the layout can check — the block DVs of a typed line and the
 * general DV in both representations. It says nothing about whether the boleto
 * exists, is registered, or is still payable: only a bank can answer that. What it
 * *does* catch is the common failure, a mistyped or truncated line.
 *
 * @param value - A barcode (44) or typed line (47/48), masked or not.
 * @returns `true` when everything recomputes.
 *
 * @example
 * if (!validateBoleto(input)) setError("Confira a linha digitável.");
 */
export function validateBoleto(value: string): boolean {
    try {
        const raw = digits(value);
        if (raw.length === 44) parseCodigoBarras(raw);
        else parseLinhaDigitavel(raw);
        return true;
    } catch {
        return false;
    }
}

/**
 * Group a typed line the way it is printed, so a human can read it back.
 *
 * 47 digits become `AAABC.CCCCD EEEEE.EEEEEF GGGGG.GGGGGH I JJJJKKKKKKKKKK`;
 * 48 digits become four blocks of twelve. Anything else is returned untouched —
 * this is a display helper, not a validator.
 *
 * @param value - A typed line, masked or not.
 * @returns The grouped string.
 *
 * @example
 * formatLinhaDigitavel("34191090086459218110900000463074184410000002000");
 * // "34191.09008 64592.181109 00000.463074 1 84410000002000"
 */
export function formatLinhaDigitavel(value: string): string {
    const line = digits(value);
    if (line.length === 47) {
        return [
            `${line.slice(0, 5)}.${line.slice(5, 10)}`,
            `${line.slice(10, 15)}.${line.slice(15, 21)}`,
            `${line.slice(21, 26)}.${line.slice(26, 32)}`,
            line.slice(32, 33),
            line.slice(33),
        ].join(" ");
    }
    if (line.length === 48) {
        return [0, 12, 24, 36].map((start) => line.slice(start, start + 12)).join(" ");
    }
    return value;
}
