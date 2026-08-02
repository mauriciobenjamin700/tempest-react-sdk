import type { UF } from "./locations";

/**
 * A 44-digit fiscal access key could not be read.
 *
 * Its own class so a scanner screen can tell a bad key apart from a bug and show
 * the message to the operator unchanged.
 */
export class ChaveNFeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ChaveNFeError";
    }
}

/** A fiscal access key taken apart. */
export interface ChaveNFe {
    /** Federative unit of the issuer, resolved from {@link cUF}. */
    uf: UF;
    /** The raw 2-digit IBGE code, positions 1-2. */
    cUF: string;
    /** Positions 3-6, `AAMM` — the two-digit year and the month of issue. */
    anoMes: string;
    /** Four-digit year derived from {@link anoMes}. */
    ano: number;
    /** Month of issue, 1-12. */
    mes: number;
    /** Positions 7-20, the issuer's CNPJ. */
    cnpj: string;
    /** Positions 21-22, `mod`. `"55"` is an NF-e, `"65"` an NFC-e. */
    modelo: string;
    /** Human label for {@link modelo}, or `null` for a model outside the table. */
    modeloLabel: string | null;
    /** Positions 23-25. */
    serie: string;
    /** Positions 26-34, `nNF`. */
    numero: string;
    /** Position 35, `tpEmis`. */
    tipoEmissao: string;
    /** Human label for {@link tipoEmissao}, or `null` for a value outside the table. */
    tipoEmissaoLabel: string | null;
    /** Positions 36-43, `cNF` — the issuer's random code. */
    codigoNumerico: string;
    /** Position 44, `cDV`. */
    dv: string;
}

/**
 * IBGE code of each federative unit, as `cUF` carries it.
 *
 * Only the numeric codes live here — the acronyms are the `UF` union from
 * `./locations`, so a state added or renamed there flows through. Ported from the
 * IBGE table of "códigos dos municípios" (the two leading digits of every
 * municipality code), which is the same table the NF-e manual points at.
 */
const UF_BY_CODE: Record<string, UF> = {
    "11": "RO",
    "12": "AC",
    "13": "AM",
    "14": "RR",
    "15": "PA",
    "16": "AP",
    "17": "TO",
    "21": "MA",
    "22": "PI",
    "23": "CE",
    "24": "RN",
    "25": "PB",
    "26": "PE",
    "27": "AL",
    "28": "SE",
    "29": "BA",
    "31": "MG",
    "32": "ES",
    "33": "RJ",
    "35": "SP",
    "41": "PR",
    "42": "SC",
    "43": "RS",
    "50": "MS",
    "51": "MT",
    "52": "GO",
    "53": "DF",
};

/** The document models that share the 44-digit key layout. */
const MODELO_LABELS: Record<string, string> = {
    "55": "NF-e",
    "57": "CT-e",
    "58": "MDF-e",
    "59": "SAT-CF-e",
    "63": "BP-e",
    "65": "NFC-e",
    "66": "NF3e",
    "67": "CT-e OS",
};

/** `tpEmis` values from the NF-e manual. */
const TIPO_EMISSAO_LABELS: Record<string, string> = {
    "1": "Normal",
    "2": "Contingência FS-IA",
    "3": "Contingência SCAN",
    "4": "Contingência DPEC/EPEC",
    "5": "Contingência FS-DA",
    "6": "Contingência SVC-AN",
    "7": "Contingência SVC-RS",
    "9": "Contingência off-line (NFC-e)",
};

/** Weight cycle of the módulo 11 check digit, applied right to left. */
const DV_WEIGHT_FIRST = 2;
const DV_WEIGHT_LAST = 9;

/** Length of the key, and of the body the check digit protects. */
const CHAVE_LENGTH = 44;
const CHAVE_BODY_LENGTH = 43;

/** Century the two-digit `AAMM` year resolves into. NF-e went live in 2006. */
const CHAVE_YEAR_BASE = 2000;

/** Digits of a key that may carry spaces or dots from a copy-paste. */
function digits(value: string): string {
    return value.replace(/\D/g, "");
}

/**
 * The check digit a 43-digit key body requires.
 *
 * Módulo 11: each digit is multiplied by weights cycling `2…9` from right to
 * left, the products are summed, and the digit is `11 - (sum mod 11)` — except
 * that a remainder of `0` or `1` yields `0`, since `11` and `10` do not fit one
 * position.
 *
 * Note this is the **fiscal** flavour of módulo 11. The cobrança boleto resolves
 * those same remainders to `1`; see `mod11DacCobranca` in `./boleto`.
 *
 * @param body - The first 43 digits of the key.
 * @returns The check digit, 0-9.
 * @throws {ChaveNFeError} When `body` is not exactly 43 digits.
 */
export function chaveNFeCheckDigit(body: string): number {
    if (!new RegExp(`^\\d{${CHAVE_BODY_LENGTH}}$`).test(body)) {
        throw new ChaveNFeError(
            `The check digit is computed over ${CHAVE_BODY_LENGTH} digits, got ${body.length}.`,
        );
    }
    const span = DV_WEIGHT_LAST - DV_WEIGHT_FIRST + 1;
    let sum = 0;
    for (let index = 0; index < body.length; index += 1) {
        const fromRight = body.length - 1 - index;
        sum += Number(body[index]) * (DV_WEIGHT_FIRST + (fromRight % span));
    }
    const remainder = sum % 11;
    return remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
}

/**
 * Whether a fiscal access key is well formed.
 *
 * Three things have to hold: 44 digits, a `cUF` that is a real federative unit,
 * and a check digit that recomputes. It says nothing about whether the document
 * exists or was authorised — only SEFAZ can answer that — but it catches the
 * failure that actually happens, a key transcribed by hand or truncated by a
 * spreadsheet.
 *
 * @param chave - The key, with or without the spaces a DANFE prints.
 * @returns `true` when all three hold.
 *
 * @example
 * if (!validateChaveNFe(input)) setError("Chave inválida.");
 */
export function validateChaveNFe(chave: string): boolean {
    const raw = digits(chave);
    if (raw.length !== CHAVE_LENGTH) return false;
    if (UF_BY_CODE[raw.slice(0, 2)] === undefined) return false;
    return String(chaveNFeCheckDigit(raw.slice(0, CHAVE_BODY_LENGTH))) === raw.slice(43);
}

/**
 * Read a 44-digit fiscal access key into its fields.
 *
 * The layout is fixed and shared by every document type that carries a key —
 * NF-e, NFC-e, CT-e, MDF-e — so `modelo` is what tells you which one you are
 * holding, not the length.
 *
 * ```text
 * 35 2601 12345678000195 55 001 000000123 1 12345678 4
 * cUF AAMM CNPJ           mod série nNF    tp cNF     cDV
 * ```
 *
 * @param chave - The key, with or without the spaces a DANFE prints.
 * @returns The parsed key.
 * @throws {ChaveNFeError} On a length other than 44, an unknown `cUF`, a month
 * outside 1-12, or a check digit that does not recompute.
 *
 * @example
 * const { uf, cnpj, numero, modeloLabel } = parseChaveNFe(scanned);
 */
export function parseChaveNFe(chave: string): ChaveNFe {
    const raw = digits(chave);
    if (raw.length !== CHAVE_LENGTH) {
        throw new ChaveNFeError(`An access key has ${CHAVE_LENGTH} digits, got ${raw.length}.`);
    }

    const cUF = raw.slice(0, 2);
    const uf = UF_BY_CODE[cUF];
    if (uf === undefined) {
        throw new ChaveNFeError(`${cUF} is not an IBGE code for a federative unit.`);
    }

    const anoMes = raw.slice(2, 6);
    const mes = Number(anoMes.slice(2, 4));
    if (mes < 1 || mes > 12) {
        throw new ChaveNFeError(`Month ${anoMes.slice(2, 4)} in AAMM is not a month.`);
    }

    const dv = raw.slice(43);
    const expected = chaveNFeCheckDigit(raw.slice(0, CHAVE_BODY_LENGTH));
    if (String(expected) !== dv) {
        throw new ChaveNFeError(`Check digit is ${dv}, recomputed ${expected}.`);
    }

    const modelo = raw.slice(20, 22);
    const tipoEmissao = raw.slice(34, 35);
    return {
        uf,
        cUF,
        anoMes,
        ano: CHAVE_YEAR_BASE + Number(anoMes.slice(0, 2)),
        mes,
        cnpj: raw.slice(6, 20),
        modelo,
        modeloLabel: MODELO_LABELS[modelo] ?? null,
        serie: raw.slice(22, 25),
        numero: raw.slice(25, 34),
        tipoEmissao,
        tipoEmissaoLabel: TIPO_EMISSAO_LABELS[tipoEmissao] ?? null,
        codigoNumerico: raw.slice(35, 43),
        dv,
    };
}

/**
 * Group a key in blocks of four, the way a DANFE prints it.
 *
 * @param chave - The key, masked or not.
 * @returns Eleven groups of four digits separated by spaces, or the input
 * unchanged when it is not 44 digits — this is a display helper, not a validator.
 *
 * @example
 * formatChaveNFe("35260112345678000195550010000001231123456784");
 * // "3526 0112 3456 7800 0195 5500 1000 0001 2311 2345 6784"
 */
export function formatChaveNFe(chave: string): string {
    const raw = digits(chave);
    if (raw.length !== CHAVE_LENGTH) return chave;
    return raw.replace(/(\d{4})(?=\d)/g, "$1 ");
}
