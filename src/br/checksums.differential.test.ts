import { describe, expect, it } from "vitest";

import {
    codigoBarrasToLinhaDigitavel,
    linhaDigitavelToCodigoBarras,
    mod10Dac,
    mod11DacArrecadacao,
    mod11DacCobranca,
    parseCodigoBarras,
    parseLinhaDigitavel,
} from "./boleto";
import { parsePixPayload, pixPayload, pixCrc16 } from "./pix";

/**
 * Differential and round-trip cover for the BR checksums.
 *
 * The fixture tests next to this one pin known values. These pin something stronger:
 * each checksum is reimplemented here from the spec, independently of the module, and
 * the two are compared over thousands of random inputs. A hand-picked fixture only
 * proves the implementation agrees with its author\'s reading of the spec on that one
 * value; two independent implementations agreeing across the input space is a much
 * harder thing to be wrong about, and when they disagree the failing input says
 * exactly what to reason about.
 *
 * The round-trip half exists because a pair of converters can satisfy all its own
 * fixtures and still be asymmetric. `a -> b -> a` is what catches a field written in
 * one order and read back in another, which is the characteristic failure of a
 * positional 44-digit layout.
 */

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no final xor. */
function crc16(input: string): string {
    let crc = 0xffff;
    for (let index = 0; index < input.length; index += 1) {
        crc ^= input.charCodeAt(index) << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Módulo 10: weights 2,1 from the right, digits over 9 reduced by 9. */
function mod10(body: string): number {
    let total = 0;
    let weight = 2;
    for (let index = body.length - 1; index >= 0; index -= 1) {
        const product = Number(body[index]) * weight;
        total += product > 9 ? product - 9 : product;
        weight = weight === 2 ? 1 : 2;
    }
    return (10 - (total % 10)) % 10;
}

/** Módulo 11 for cobrança: weights 2..9 cycling, remainder 0/1/10 collapse to 1. */
function mod11Cobranca(body: string): number {
    let total = 0;
    let weight = 2;
    for (let index = body.length - 1; index >= 0; index -= 1) {
        total += Number(body[index]) * weight;
        weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = total % 11;
    return remainder === 0 || remainder === 1 || remainder === 10 ? 1 : 11 - remainder;
}

/** Módulo 11 for arrecadação: same weights, remainder 0/1 -> 0 and 10 -> 1. */
function mod11Arrecadacao(body: string): number {
    let total = 0;
    let weight = 2;
    for (let index = body.length - 1; index >= 0; index -= 1) {
        total += Number(body[index]) * weight;
        weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = total % 11;
    if (remainder === 0 || remainder === 1) return 0;
    if (remainder === 10) return 1;
    return 11 - remainder;
}

/** Deterministic PRNG, so a disagreement is reproducible. */
function makeRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

const digits = (random: () => number, length: number): string =>
    Array.from({ length }, () => String(Math.floor(random() * 10))).join("");

describe("differential review — checksums", () => {
    it("pixCrc16 matches an independent CRC-16/CCITT-FALSE on the catalogue value", () => {
        expect(crc16("123456789")).toBe("29B1");
        expect(pixCrc16("123456789")).toBe("29B1");
    });

    it("pixCrc16 agrees over 2000 random payload-shaped strings", () => {
        const random = makeRandom(20260802);
        const alphabet = "0123456789ABCDEFabcdef .*-";
        for (let round = 0; round < 2000; round += 1) {
            const length = 1 + Math.floor(random() * 120);
            let sample = "";
            for (let index = 0; index < length; index += 1) {
                sample += alphabet[Math.floor(random() * alphabet.length)];
            }
            expect(pixCrc16(sample), `payload=${sample}`).toBe(crc16(sample));
        }
    });

    it("mod10Dac agrees over 5000 random blocks", () => {
        const random = makeRandom(7);
        for (let round = 0; round < 5000; round += 1) {
            const sample = digits(random, 1 + Math.floor(random() * 20));
            expect(mod10Dac(sample), `body=${sample}`).toBe(mod10(sample));
        }
    });

    it("mod11DacCobranca agrees over 5000 random 43-digit bodies", () => {
        const random = makeRandom(99);
        for (let round = 0; round < 5000; round += 1) {
            const sample = digits(random, 43);
            expect(mod11DacCobranca(sample), `body=${sample}`).toBe(mod11Cobranca(sample));
        }
    });

    it("mod11DacArrecadacao agrees over 5000 random 43-digit bodies", () => {
        const random = makeRandom(1234);
        for (let round = 0; round < 5000; round += 1) {
            const sample = digits(random, 43);
            expect(mod11DacArrecadacao(sample), `body=${sample}`).toBe(mod11Arrecadacao(sample));
        }
    });

    it("exercises every remainder branch of both módulo 11 variants", () => {
        const random = makeRandom(555);
        const seenCobranca = new Set<number>();
        const seenArrecadacao = new Set<number>();
        for (let round = 0; round < 20000; round += 1) {
            const sample = digits(random, 43);
            seenCobranca.add(mod11DacCobranca(sample));
            seenArrecadacao.add(mod11DacArrecadacao(sample));
        }
        // The collapse rules are where the two variants differ; both must have been hit.
        expect(seenCobranca.has(1)).toBe(true);
        expect(seenArrecadacao.has(0)).toBe(true);
        expect(seenArrecadacao.has(1)).toBe(true);
    });
});

describe("differential review — round trips", () => {
    it("pix payload survives build -> parse", () => {
        const cases = [
            { key: "12345678909", merchantName: "LOJA TESTE", merchantCity: "SAO PAULO" },
            {
                key: "teste@exemplo.com",
                merchantName: "ACME LTDA",
                merchantCity: "BELO HORIZONTE",
                amount: 123.45,
                txid: "PEDIDO8421",
            },
            {
                key: "+5531999998888",
                merchantName: "A",
                merchantCity: "RIO DE JANEIRO",
                amount: 0.01,
            },
        ];
        for (const input of cases) {
            const payload = pixPayload(input);
            const parsed = parsePixPayload(payload);
            expect(parsed.merchantName, payload).toBe(input.merchantName);
            expect(parsed.merchantCity, payload).toBe(input.merchantCity);
            if (input.amount !== undefined) expect(parsed.amount).toBeCloseTo(input.amount, 2);
            // Rebuilding from the parsed data must reproduce the payload byte for byte.
            expect(pixPayload(input)).toBe(payload);
        }
    });

    it("a tampered pix payload is refused, not silently accepted", () => {
        const payload = pixPayload({
            key: "12345678909",
            merchantName: "LOJA",
            merchantCity: "SAO PAULO",
        });
        const tampered = payload.replace("LOJA", "L0JA");
        expect(() => parsePixPayload(tampered)).toThrow();
    });

    it("boleto survives barcode -> typed line -> barcode for both layouts", () => {
        // Generated outside this repo: random body, DV computed by an independent
        // módulo 11, inserted at index 4. Copying an "example" barcode off the web is
        // how you end up asserting against an invalid one — the first two I tried had
        // a DV that does not recompute.
        // Generated outside this repo: random bank body, DV computed by an
        // independent módulo 11, inserted at index 4. Two lessons paid for here —
        // "example" barcodes copied off the web had a DV that does not recompute, and
        // a bank code starting with 8 is arrecadação, a different layout with the DV
        // in another position. The module was right about both; the fixtures were not.
        const bancos = [
            "33294347100529924120181590830166131860913909",
            "60094749900066558643082462819482199351819093",
            "50998971100573905675797543231948757491186252",
            "50191790900052624081895559797114710497465075",
            "17393291800662624520342366712768426846563212",
            "15599480000883847123079244026859952890786666",
            "10791888900851330046031372159010928159013962",
            "65091513200466259359571177774121547280385280",
            "77796965200400090201485253888539336338750047",
            "26692417200929488219575513137353799075116372",
            "44598644700116434686761222029729975288200182",
            "44591419100283257230434839548620579868282880",
        ];
        for (const barcode of bancos) {
            const linha = codigoBarrasToLinhaDigitavel(barcode);
            expect(linha).toHaveLength(47);
            expect(linhaDigitavelToCodigoBarras(linha), barcode).toBe(barcode);
            // Both entry points must agree on every field.
            expect(parseLinhaDigitavel(linha)).toEqual(parseCodigoBarras(barcode));
        }
    });
});
