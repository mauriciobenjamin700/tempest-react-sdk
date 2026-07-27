/**
 * The fixed tables of ISO/IEC 18004, transcribed.
 *
 * They are data, not logic: the standard specifies them and there is nothing to
 * derive. They live apart from {@link ./qr-encode} so the algorithm reads as
 * algorithm and a typo in a table stays findable.
 */

/** Error correction level, by how much of the symbol it can lose and survive. */
export type QRErrorCorrection = "L" | "M" | "Q" | "H";

export const ECC_LEVELS: readonly QRErrorCorrection[] = ["L", "M", "Q", "H"];

/** The 2-bit code each level carries in the format information. */
export const ECC_FORMAT_BITS: Record<QRErrorCorrection, number> = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * Error-correction codewords per block, indexed `[level][version - 1]`.
 *
 * Together with {@link ECC_BLOCK_COUNT} this fixes how much of each version is
 * data and how much is redundancy.
 */
export const ECC_CODEWORDS_PER_BLOCK: Record<QRErrorCorrection, readonly number[]> = {
    L: [
        7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
        30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    M: [
        10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28,
        28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    ],
    Q: [
        13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30,
        30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    H: [
        17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30,
        30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
};

/** Number of error-correction blocks, indexed `[level][version - 1]`. */
export const ECC_BLOCK_COUNT: Record<QRErrorCorrection, readonly number[]> = {
    L: [
        1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14,
        15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
    ],
    M: [
        1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23,
        25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
    ],
    Q: [
        1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34,
        34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
    ],
    H: [
        1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35,
        37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
    ],
};

/** The alphanumeric mode's 45-character alphabet, in code order. */
export const ALPHANUMERIC_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/** Lowest and highest symbol version. */
export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/**
 * Total data modules in a symbol, before subtracting error correction.
 *
 * Closed form rather than a 40-row table: the function patterns a version
 * carries are themselves a function of the version, so counting them beats
 * transcribing the totals and hoping.
 *
 * @param version - Symbol version, 1 to 40.
 * @returns The module count available to data and error correction.
 */
export function rawDataModules(version: number): number {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const alignCount = Math.floor(version / 7) + 2;
        result -= (25 * alignCount - 10) * alignCount - 55;
        if (version >= 7) result -= 36;
    }
    return result;
}

/**
 * How many data codewords a version holds at a given level.
 *
 * @param version - Symbol version, 1 to 40.
 * @param level - Error correction level.
 * @returns Codewords left for the message itself.
 */
export function dataCodewords(version: number, level: QRErrorCorrection): number {
    return (
        Math.floor(rawDataModules(version) / 8) -
        ECC_CODEWORDS_PER_BLOCK[level][version - 1] * ECC_BLOCK_COUNT[level][version - 1]
    );
}

/**
 * Row/column centres of the alignment patterns for a version.
 *
 * @param version - Symbol version, 1 to 40.
 * @returns Coordinates, ascending. Empty for version 1, which has none.
 */
export function alignmentPatternPositions(version: number): number[] {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    // Version 32 is the one case the general spacing rule gets wrong.
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const positions = [6];
    for (let pos = version * 4 + 10; positions.length < count; pos -= step) {
        positions.splice(1, 0, pos);
    }
    return positions;
}
