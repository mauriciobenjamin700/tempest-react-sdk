import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import { encodeQR, matrixToPath, QRCapacityError, reedSolomon, selectMode } from "./qr-encode";
import type { QRErrorCorrection, QRMatrix } from "./qr-encode";
import { alignmentPatternPositions, dataCodewords } from "./qr-tables";

/**
 * Render a matrix as the RGBA bitmap `jsQR` expects, one pixel per module plus
 * a quiet zone.
 *
 * Scaling to a few pixels per module is what a real scan sees, and it also
 * gives the decoder's grid detection room to lock on.
 */
function toBitmap(matrix: QRMatrix, scale = 4, margin = 4) {
    const side = (matrix.size + margin * 2) * scale;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < matrix.size; y++) {
        for (let x = 0; x < matrix.size; x++) {
            if (!matrix.modules[y][x]) continue;
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    const px = (x + margin) * scale + dx;
                    const py = (y + margin) * scale + dy;
                    const at = (py * side + px) * 4;
                    data[at] = 0;
                    data[at + 1] = 0;
                    data[at + 2] = 0;
                }
            }
        }
    }
    return { data, width: side, height: side };
}

/**
 * Encode, then decode with an independent implementation.
 *
 * This is the only assertion that means anything about a QR encoder: the tables
 * of ISO 18004 are transcribed by hand, and a single wrong entry produces a
 * symbol that looks perfectly plausible and scans as nothing. Comparing the
 * encoder against itself would confirm the typo.
 */
function roundTrip(text: string, level: QRErrorCorrection = "M"): string | null {
    const matrix = encodeQR(text, { level });
    const bitmap = toBitmap(matrix);
    return jsQR(bitmap.data, bitmap.width, bitmap.height)?.data ?? null;
}

describe("encodeQR — decoded by an independent implementation", () => {
    it("round-trips a URL", () => {
        expect(roundTrip("https://tempest.dev/docs")).toBe("https://tempest.dev/docs");
    });

    it("round-trips at every correction level", () => {
        for (const level of ["L", "M", "Q", "H"] as const) {
            expect(roundTrip("tempest-react-sdk", level), `level ${level}`).toBe(
                "tempest-react-sdk",
            );
        }
    });

    it("round-trips numeric mode, where 3 digits share 10 bits", () => {
        expect(roundTrip("5511987654321")).toBe("5511987654321");
    });

    it("round-trips alphanumeric mode", () => {
        expect(roundTrip("PIX BR 2026 *ABC-123/XY")).toBe("PIX BR 2026 *ABC-123/XY");
    });

    it("round-trips UTF-8 — accents survive byte mode", () => {
        const text = "Ação: conferência às 8h — São Paulo";
        expect(roundTrip(text)).toBe(text);
    });

    it("round-trips emoji, which are multi-byte in UTF-8", () => {
        expect(roundTrip("pagamento ✅ 🚀")).toBe("pagamento ✅ 🚀");
    });

    it("round-trips a payload long enough to need several ECC blocks", () => {
        const text = "https://tempest.dev/checkout?order=".padEnd(400, "x");
        expect(roundTrip(text, "M")).toBe(text);
    });

    it("round-trips a payload past version 7, where version info is written", () => {
        const text = "A".repeat(300);
        const matrix = encodeQR(text, { level: "Q" });
        expect(matrix.version).toBeGreaterThanOrEqual(7);
        expect(roundTrip(text, "Q")).toBe(text);
    });

    it("round-trips a single character and a single digit", () => {
        expect(roundTrip("A")).toBe("A");
        expect(roundTrip("7")).toBe("7");
    });

    it("round-trips a payload forced onto a larger version than it needs", () => {
        const matrix = encodeQR("oi", { minVersion: 12 });
        expect(matrix.version).toBe(12);
        const bitmap = toBitmap(matrix);
        expect(jsQR(bitmap.data, bitmap.width, bitmap.height)?.data).toBe("oi");
    });

    it("survives a smear across the data area at level H", () => {
        /*
         * Level H recovers roughly 30% of the codewords, and this is the live
         * check that the ECC blocks are genuinely interleaved: a contiguous
         * smear has to land a few codewords into every block rather than wipe
         * one block out. The damage stays clear of the finder, timing and
         * alignment patterns — destroying those stops a scanner from locating
         * the symbol at all, which is a different failure from correction.
         */
        const text = "https://tempest.dev/recibo/9931";
        const matrix = encodeQR(text, { level: "H" });
        const from = 9;
        const to = Math.floor(matrix.size / 2) + 2;
        for (let y = from; y < to; y++) {
            for (let x = from; x < to; x++) {
                matrix.modules[y][x] = (x + y) % 2 === 0;
            }
        }
        const bitmap = toBitmap(matrix);
        expect(jsQR(bitmap.data, bitmap.width, bitmap.height)?.data).toBe(text);
    });
});

describe("selectMode", () => {
    it("picks the densest mode the payload qualifies for", () => {
        expect(selectMode("12345")).toBe("numeric");
        expect(selectMode("ABC 123")).toBe("alphanumeric");
        expect(selectMode("abc")).toBe("byte");
        expect(selectMode("café")).toBe("byte");
    });

    it("treats the empty string as numeric, the narrowest mode", () => {
        expect(selectMode("")).toBe("numeric");
    });

    it("rejects lower case from alphanumeric — the alphabet is upper-case only", () => {
        expect(selectMode("ABC")).toBe("alphanumeric");
        expect(selectMode("AbC")).toBe("byte");
    });
});

describe("encodeQR — the symbol itself", () => {
    it("sizes the matrix as 4 × version + 17", () => {
        const matrix = encodeQR("oi");
        expect(matrix.size).toBe(matrix.version * 4 + 17);
    });

    it("grows the version with the payload, not with the caller's wishes", () => {
        const small = encodeQR("oi").version;
        const large = encodeQR("x".repeat(500)).version;
        expect(large).toBeGreaterThan(small);
    });

    it("needs a bigger symbol for the same text at a stronger level", () => {
        const text = "https://tempest.dev/checkout/0001".repeat(4);
        expect(encodeQR(text, { level: "H" }).version).toBeGreaterThan(
            encodeQR(text, { level: "L" }).version,
        );
    });

    it("treats minVersion as a floor, never a cap that would truncate", () => {
        const matrix = encodeQR("x".repeat(400), { minVersion: 2 });
        expect(matrix.version).toBeGreaterThan(2);
    });

    it("draws the three finder patterns", () => {
        const { modules, size } = encodeQR("oi");
        for (const [ox, oy] of [
            [0, 0],
            [size - 7, 0],
            [0, size - 7],
        ]) {
            expect(modules[oy][ox]).toBe(true);
            expect(modules[oy + 1][ox + 1]).toBe(false);
            expect(modules[oy + 3][ox + 3]).toBe(true);
        }
    });

    it("keeps the dark module lit", () => {
        const { modules, size } = encodeQR("oi");
        expect(modules[size - 8][8]).toBe(true);
    });

    it("picks a mask in range", () => {
        const matrix = encodeQR("https://tempest.dev");
        expect(matrix.mask).toBeGreaterThanOrEqual(0);
        expect(matrix.mask).toBeLessThan(8);
    });

    it("is deterministic — same input, same symbol", () => {
        const a = encodeQR("https://tempest.dev", { level: "Q" });
        const b = encodeQR("https://tempest.dev", { level: "Q" });
        expect(a.modules).toEqual(b.modules);
        expect(a.mask).toBe(b.mask);
    });

    it("refuses a payload no version can hold, instead of truncating it", () => {
        expect(() => encodeQR("x".repeat(5000), { level: "H" })).toThrow(QRCapacityError);
    });
});

/** GF(256) exponent table, rebuilt here so the check is independent of the code under test. */
const GF: number[] = [];
{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF.push(x);
        x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }
}

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF[(GF.indexOf(a) + GF.indexOf(b)) % 255];
}

/**
 * Evaluate the codeword polynomial at a root of the generator.
 *
 * A correct Reed-Solomon remainder makes data-followed-by-ECC divisible by the
 * generator, so every one of these evaluations is zero. That is the property
 * the algorithm is defined by — worth asserting directly rather than pinning a
 * magic vector nobody can check by eye.
 */
function syndrome(codewords: readonly number[], root: number): number {
    let value = 0;
    for (const codeword of codewords) value = gfMul(value, root) ^ codeword;
    return value;
}

describe("reedSolomon", () => {
    it("produces exactly the requested number of codewords", () => {
        for (const degree of [7, 10, 13, 17, 30]) {
            expect(reedSolomon([1, 2, 3, 4], degree)).toHaveLength(degree);
        }
    });

    it("makes the message divisible by the generator, which is the whole point", () => {
        const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
        const degree = 10;
        const full = [...data, ...reedSolomon(data, degree)];
        for (let i = 0; i < degree; i++) {
            expect(syndrome(full, GF[i]), `root a^${i}`).toBe(0);
        }
    });

    it("leaves a non-zero syndrome once a codeword is corrupted", () => {
        const data = [10, 20, 30, 40, 50];
        const full = [...data, ...reedSolomon(data, 8)];
        full[2] ^= 0x5a;
        const syndromes = Array.from({ length: 8 }, (_, i) => syndrome(full, GF[i]));
        expect(syndromes.some((value) => value !== 0)).toBe(true);
    });

    it("is deterministic", () => {
        expect(reedSolomon([9, 8, 7], 12)).toEqual(reedSolomon([9, 8, 7], 12));
    });
});

describe("the transcribed tables", () => {
    it("gives version 1 no alignment patterns and version 7 three centres", () => {
        expect(alignmentPatternPositions(1)).toEqual([]);
        expect(alignmentPatternPositions(7)).toEqual([6, 22, 38]);
    });

    it("matches the standard's data capacity at the corners of the range", () => {
        expect(dataCodewords(1, "L")).toBe(19);
        expect(dataCodewords(1, "H")).toBe(9);
        expect(dataCodewords(40, "L")).toBe(2956);
        expect(dataCodewords(40, "H")).toBe(1276);
    });

    it("never lets capacity shrink as the version grows", () => {
        for (const level of ["L", "M", "Q", "H"] as const) {
            for (let version = 2; version <= 40; version++) {
                expect(
                    dataCodewords(version, level),
                    `v${version} ${level}`,
                ).toBeGreaterThanOrEqual(dataCodewords(version - 1, level));
            }
        }
    });
});

describe("matrixToPath", () => {
    it("merges a horizontal run of modules into one rectangle", () => {
        const matrix: QRMatrix = {
            size: 3,
            version: 1,
            level: "M",
            mode: "byte",
            mask: 0,
            modules: [
                [true, true, false],
                [false, false, false],
                [false, true, false],
            ],
        };
        expect(matrixToPath(matrix, 0)).toBe("M0 0h2v1h-2zM1 2h1v1h-1z");
    });

    it("offsets everything by the quiet zone", () => {
        const matrix: QRMatrix = {
            size: 1,
            version: 1,
            level: "M",
            mode: "byte",
            mask: 0,
            modules: [[true]],
        };
        expect(matrixToPath(matrix, 4)).toBe("M4 4h1v1h-1z");
    });

    it("returns nothing for an all-light matrix", () => {
        const matrix: QRMatrix = {
            size: 2,
            version: 1,
            level: "M",
            mode: "byte",
            mask: 0,
            modules: [
                [false, false],
                [false, false],
            ],
        };
        expect(matrixToPath(matrix)).toBe("");
    });
});
