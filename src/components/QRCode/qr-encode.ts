import {
    ALPHANUMERIC_CHARS,
    alignmentPatternPositions,
    dataCodewords,
    ECC_BLOCK_COUNT,
    ECC_CODEWORDS_PER_BLOCK,
    ECC_FORMAT_BITS,
    MAX_VERSION,
    MIN_VERSION,
    rawDataModules,
    type QRErrorCorrection,
} from "./qr-tables";

export type { QRErrorCorrection };

/** How the payload is packed into bits. */
export type QRMode = "numeric" | "alphanumeric" | "byte";

export interface QRMatrix {
    /** Side length in modules, including no quiet zone. */
    size: number;
    /** Row-major modules; `true` is dark. */
    modules: boolean[][];
    /** Symbol version, 1 to 40. */
    version: number;
    /** Level the symbol was encoded at. */
    level: QRErrorCorrection;
    /** The mode chosen for the payload. */
    mode: QRMode;
    /** Which of the eight masks scored best. */
    mask: number;
}

export interface QREncodeOptions {
    /** Error correction level. Default `"M"`. */
    level?: QRErrorCorrection;
    /**
     * Force a minimum version. The encoder still grows past it when the payload
     * does not fit — a version is a floor, never a cap that silently truncates.
     */
    minVersion?: number;
}

/** Raised when a payload cannot be encoded at the requested level. */
export class QRCapacityError extends Error {
    constructor(
        readonly length: number,
        readonly level: QRErrorCorrection,
    ) {
        super(
            `Payload of ${length} bytes does not fit in a version-${MAX_VERSION} QR symbol at level ${level}. ` +
                "Shorten the data, or drop to a lower correction level.",
        );
        this.name = "QRCapacityError";
    }
}

const MODE_INDICATOR: Record<QRMode, number> = { numeric: 1, alphanumeric: 2, byte: 4 };

const NUMERIC_RE = /^[0-9]*$/;
const ALPHANUMERIC_RE = /^[0-9A-Z $%*+\-./:]*$/;

/**
 * Pick the densest mode the payload qualifies for.
 *
 * Numeric packs 3 digits into 10 bits and alphanumeric 2 characters into 11, so
 * a phone number or an upper-case code encodes far smaller than the same string
 * as bytes — often a whole version smaller, which is a visibly coarser symbol
 * and therefore easier to scan.
 *
 * @param text - The payload.
 * @returns The narrowest mode that can represent it.
 */
export function selectMode(text: string): QRMode {
    if (NUMERIC_RE.test(text)) return "numeric";
    if (ALPHANUMERIC_RE.test(text)) return "alphanumeric";
    return "byte";
}

/** Bits the character-count field takes, which widens with the version. */
function charCountBits(mode: QRMode, version: number): number {
    const tier = version <= 9 ? 0 : version <= 26 ? 1 : 2;
    if (mode === "numeric") return [10, 12, 14][tier];
    if (mode === "alphanumeric") return [9, 11, 13][tier];
    return [8, 16, 16][tier];
}

/** A bit sink that appends most-significant-bit first. */
class BitBuffer {
    readonly bits: number[] = [];

    append(value: number, length: number) {
        for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
    }

    get length(): number {
        return this.bits.length;
    }
}

/** UTF-8 bytes for the byte mode, so accents and emoji survive the round trip. */
function utf8Bytes(text: string): number[] {
    return Array.from(new TextEncoder().encode(text));
}

/** Bits the payload itself occupies in a given mode, excluding the headers. */
function payloadBits(text: string, mode: QRMode): number {
    if (mode === "numeric") {
        const groups = Math.floor(text.length / 3);
        const rest = text.length % 3;
        return groups * 10 + (rest === 0 ? 0 : rest === 1 ? 4 : 7);
    }
    if (mode === "alphanumeric") {
        return Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
    }
    return utf8Bytes(text).length * 8;
}

/** Write the payload into the buffer in the chosen mode. */
function writePayload(buffer: BitBuffer, text: string, mode: QRMode) {
    if (mode === "numeric") {
        for (let i = 0; i < text.length; i += 3) {
            const chunk = text.slice(i, i + 3);
            buffer.append(Number(chunk), chunk.length * 3 + 1);
        }
        return;
    }
    if (mode === "alphanumeric") {
        for (let i = 0; i < text.length; i += 2) {
            const first = ALPHANUMERIC_CHARS.indexOf(text[i]);
            if (i + 1 === text.length) {
                buffer.append(first, 6);
            } else {
                buffer.append(first * 45 + ALPHANUMERIC_CHARS.indexOf(text[i + 1]), 11);
            }
        }
        return;
    }
    for (const byte of utf8Bytes(text)) buffer.append(byte, 8);
}

/** Character count for the header, which is bytes — not characters — in byte mode. */
function headerCount(text: string, mode: QRMode): number {
    return mode === "byte" ? utf8Bytes(text).length : text.length;
}

/**
 * The smallest version that fits the payload at this level.
 *
 * @throws {QRCapacityError} When even version 40 is too small.
 */
function selectVersion(
    text: string,
    mode: QRMode,
    level: QRErrorCorrection,
    minVersion: number,
): number {
    const bits = payloadBits(text, mode);
    for (let version = Math.max(MIN_VERSION, minVersion); version <= MAX_VERSION; version++) {
        const capacity = dataCodewords(version, level) * 8;
        if (4 + charCountBits(mode, version) + bits <= capacity) return version;
    }
    throw new QRCapacityError(headerCount(text, mode), level);
}

// ── Reed-Solomon over GF(256), primitive polynomial 0x11D ───────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

{
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** The generator polynomial for `degree` error-correction codewords. */
function rsGenerator(degree: number): number[] {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array<number>(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j];
            next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
        }
        poly = next;
    }
    return poly;
}

/**
 * The error-correction codewords for one block.
 *
 * @param data - The block's data codewords.
 * @param degree - How many correction codewords to produce.
 * @returns The remainder of the polynomial division, which is the ECC block.
 */
export function reedSolomon(data: readonly number[], degree: number): number[] {
    const generator = rsGenerator(degree);
    const remainder = new Array<number>(degree).fill(0);
    for (const byte of data) {
        const factor = byte ^ remainder[0];
        remainder.shift();
        remainder.push(0);
        for (let i = 0; i < degree; i++) {
            remainder[i] ^= gfMul(generator[i + 1], factor);
        }
    }
    return remainder;
}

/**
 * Split into blocks, add correction, and interleave into the final codeword
 * stream.
 *
 * Interleaving is what makes the correction useful against a real-world smudge:
 * a contiguous scratch on the printed symbol then damages a few codewords of
 * every block instead of destroying one block completely.
 */
function buildCodewords(
    data: readonly number[],
    version: number,
    level: QRErrorCorrection,
): number[] {
    const blockCount = ECC_BLOCK_COUNT[level][version - 1];
    const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[level][version - 1];
    const totalCodewords = Math.floor(rawDataModules(version) / 8);
    const shortBlockLength = Math.floor(totalCodewords / blockCount) - eccPerBlock;
    const longBlockCount = totalCodewords % blockCount;

    const dataBlocks: number[][] = [];
    const eccBlocks: number[][] = [];
    let offset = 0;
    for (let i = 0; i < blockCount; i++) {
        const length = shortBlockLength + (i >= blockCount - longBlockCount ? 1 : 0);
        const block = data.slice(offset, offset + length);
        offset += length;
        dataBlocks.push(block);
        eccBlocks.push(reedSolomon(block, eccPerBlock));
    }

    const result: number[] = [];
    for (let i = 0; i < shortBlockLength + 1; i++) {
        for (const block of dataBlocks) {
            if (i < block.length) result.push(block[i]);
        }
    }
    for (let i = 0; i < eccPerBlock; i++) {
        for (const block of eccBlocks) result.push(block[i]);
    }
    return result;
}

// ── Matrix construction ─────────────────────────────────────────────────────

/** A grid under construction: modules plus which cells are function patterns. */
interface Canvas {
    size: number;
    modules: boolean[][];
    reserved: boolean[][];
}

function createCanvas(version: number): Canvas {
    const size = version * 4 + 17;
    return {
        size,
        modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
        reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    };
}

function setModule(canvas: Canvas, x: number, y: number, dark: boolean, reserve = true) {
    if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
    canvas.modules[y][x] = dark;
    if (reserve) canvas.reserved[y][x] = true;
}

/** A finder pattern with its separator, anchored at a corner. */
function drawFinder(canvas: Canvas, left: number, top: number) {
    for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
            const distance = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
            setModule(canvas, left + dx, top + dy, distance !== 2 && distance <= 3);
        }
    }
}

function drawAlignment(canvas: Canvas, cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            setModule(canvas, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }
}

function drawFunctionPatterns(canvas: Canvas, version: number) {
    drawFinder(canvas, 0, 0);
    drawFinder(canvas, canvas.size - 7, 0);
    drawFinder(canvas, 0, canvas.size - 7);

    for (let i = 8; i < canvas.size - 8; i++) {
        const dark = i % 2 === 0;
        setModule(canvas, i, 6, dark);
        setModule(canvas, 6, i, dark);
    }

    const positions = alignmentPatternPositions(version);
    for (const cy of positions) {
        for (const cx of positions) {
            // The three corners already hold finder patterns.
            const atFinder =
                (cx === 6 && cy === 6) ||
                (cx === 6 && cy === canvas.size - 7) ||
                (cx === canvas.size - 7 && cy === 6);
            if (!atFinder) drawAlignment(canvas, cx, cy);
        }
    }

    // Reserve the format information, and light the always-dark module.
    for (let i = 0; i < 9; i++) {
        setModule(canvas, i, 8, false);
        setModule(canvas, 8, i, false);
    }
    for (let i = 0; i < 8; i++) {
        setModule(canvas, canvas.size - 1 - i, 8, false);
        setModule(canvas, 8, canvas.size - 1 - i, false);
    }
    setModule(canvas, 8, canvas.size - 8, true);

    if (version >= 7) {
        const value = versionInformation(version);
        for (let i = 0; i < 18; i++) {
            const bit = ((value >>> i) & 1) === 1;
            const a = canvas.size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            setModule(canvas, a, b, bit);
            setModule(canvas, b, a, bit);
        }
    }
}

/** The 18-bit version information block, BCH(18,6) with generator 0x1F25. */
function versionInformation(version: number): number {
    let remainder = version;
    for (let i = 0; i < 12; i++) {
        remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }
    return (version << 12) | remainder;
}

/** The 15-bit format information, BCH(15,5) masked with 0x5412. */
function formatInformation(level: QRErrorCorrection, mask: number): number {
    const data = (ECC_FORMAT_BITS[level] << 3) | mask;
    let remainder = data;
    for (let i = 0; i < 10; i++) {
        remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    return ((data << 10) | remainder) ^ 0x5412;
}

function drawFormatInformation(canvas: Canvas, level: QRErrorCorrection, mask: number) {
    const bits = formatInformation(level, mask);

    for (let i = 0; i <= 5; i++) setModule(canvas, 8, i, ((bits >>> i) & 1) === 1);
    setModule(canvas, 8, 7, ((bits >>> 6) & 1) === 1);
    setModule(canvas, 8, 8, ((bits >>> 7) & 1) === 1);
    setModule(canvas, 7, 8, ((bits >>> 8) & 1) === 1);
    for (let i = 9; i < 15; i++) setModule(canvas, 14 - i, 8, ((bits >>> i) & 1) === 1);

    for (let i = 0; i < 8; i++) {
        setModule(canvas, canvas.size - 1 - i, 8, ((bits >>> i) & 1) === 1);
    }
    for (let i = 8; i < 15; i++) {
        setModule(canvas, 8, canvas.size - 15 + i, ((bits >>> i) & 1) === 1);
    }
    setModule(canvas, 8, canvas.size - 8, true);
}

/**
 * Lay the codeword stream into the free modules.
 *
 * The path is a boustrophedon over two-module columns from the bottom-right
 * corner, skipping the vertical timing pattern in column 6 entirely — that
 * column would otherwise shift every subsequent column by one.
 */
function drawCodewords(canvas: Canvas, codewords: readonly number[]) {
    let bitIndex = 0;
    let upward = true;

    for (let right = canvas.size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let step = 0; step < canvas.size; step++) {
            const y = upward ? canvas.size - 1 - step : step;
            for (let column = 0; column < 2; column++) {
                const x = right - column;
                if (canvas.reserved[y][x]) continue;
                const byte = codewords[bitIndex >>> 3];
                // Remainder bits past the stream are light, per the standard.
                canvas.modules[y][x] =
                    byte !== undefined && ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
                bitIndex++;
            }
        }
        upward = !upward;
    }
}

const MASK_FUNCTIONS: readonly ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(canvas: Canvas, mask: number) {
    const fn = MASK_FUNCTIONS[mask];
    for (let y = 0; y < canvas.size; y++) {
        for (let x = 0; x < canvas.size; x++) {
            if (!canvas.reserved[y][x] && fn(x, y)) canvas.modules[y][x] = !canvas.modules[y][x];
        }
    }
}

/**
 * Score a masked symbol; lower is better.
 *
 * The four penalties push away from patterns a scanner confuses with the finder
 * marks, and from large flat areas where it cannot lock on.
 */
function penalty(canvas: Canvas): number {
    const { size, modules } = canvas;
    let score = 0;

    const runPenalty = (run: number) => (run >= 5 ? 3 + (run - 5) : 0);

    for (let y = 0; y < size; y++) {
        let run = 1;
        for (let x = 1; x < size; x++) {
            if (modules[y][x] === modules[y][x - 1]) run++;
            else {
                score += runPenalty(run);
                run = 1;
            }
        }
        score += runPenalty(run);
    }
    for (let x = 0; x < size; x++) {
        let run = 1;
        for (let y = 1; y < size; y++) {
            if (modules[y][x] === modules[y - 1][x]) run++;
            else {
                score += runPenalty(run);
                run = 1;
            }
        }
        score += runPenalty(run);
    }

    for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
            const cell = modules[y][x];
            if (
                cell === modules[y][x + 1] &&
                cell === modules[y + 1][x] &&
                cell === modules[y + 1][x + 1]
            ) {
                score += 3;
            }
        }
    }

    // 1:1:3:1:1 with four light modules on either side — the finder's signature.
    const FINDER = [true, false, true, true, true, false, true];
    const matchesAt = (line: readonly boolean[], at: number): boolean => {
        for (let i = 0; i < FINDER.length; i++) {
            if (line[at + i] !== FINDER[i]) return false;
        }
        const before = line.slice(Math.max(0, at - 4), at);
        const after = line.slice(at + 7, at + 11);
        const clear = (part: readonly boolean[]) => part.length === 4 && part.every((m) => !m);
        return clear(before) || clear(after);
    };

    for (let i = 0; i < size; i++) {
        const row = modules[i];
        const column = modules.map((line) => line[i]);
        for (let at = 0; at + 7 <= size; at++) {
            if (matchesAt(row, at)) score += 40;
            if (matchesAt(column, at)) score += 40;
        }
    }

    let dark = 0;
    for (const row of modules) for (const cell of row) if (cell) dark++;
    const percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
}

function cloneCanvas(canvas: Canvas): Canvas {
    return {
        size: canvas.size,
        modules: canvas.modules.map((row) => [...row]),
        reserved: canvas.reserved.map((row) => [...row]),
    };
}

/**
 * Encode text into a QR matrix.
 *
 * The whole pipeline of ISO/IEC 18004: pick the densest mode the payload
 * qualifies for, pick the smallest version that fits, build the bit stream, add
 * Reed-Solomon correction, interleave the blocks, lay the modules out, then try
 * all eight masks and keep the one the standard's penalty function likes best.
 *
 * @param text - The payload. Byte mode encodes it as UTF-8.
 * @param options - Level and an optional version floor.
 * @returns The finished matrix, without a quiet zone.
 * @throws {QRCapacityError} When the payload does not fit at that level.
 *
 * @example
 * const qr = encodeQR("https://tempest.dev", { level: "Q" });
 * qr.modules[0][0]; // true — top-left of the finder pattern
 */
export function encodeQR(text: string, options: QREncodeOptions = {}): QRMatrix {
    const { level = "M", minVersion = MIN_VERSION } = options;
    const mode = selectMode(text);
    const version = selectVersion(text, mode, level, minVersion);

    const buffer = new BitBuffer();
    buffer.append(MODE_INDICATOR[mode], 4);
    buffer.append(headerCount(text, mode), charCountBits(mode, version));
    writePayload(buffer, text, mode);

    const capacity = dataCodewords(version, level) * 8;
    buffer.append(0, Math.min(4, capacity - buffer.length));
    buffer.append(0, (8 - (buffer.length % 8)) % 8);

    const data: number[] = [];
    for (let i = 0; i < buffer.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | buffer.bits[i + j];
        data.push(byte);
    }
    // The two alternating pad bytes are prescribed, not arbitrary filler.
    for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);

    const codewords = buildCodewords(data, version, level);

    const base = createCanvas(version);
    drawFunctionPatterns(base, version);
    drawCodewords(base, codewords);

    let best: Canvas | null = null;
    let bestMask = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let mask = 0; mask < 8; mask++) {
        const candidate = cloneCanvas(base);
        applyMask(candidate, mask);
        drawFormatInformation(candidate, level, mask);
        const score = penalty(candidate);
        if (score < bestScore) {
            bestScore = score;
            bestMask = mask;
            best = candidate;
        }
    }

    const chosen = best as Canvas;
    return {
        size: chosen.size,
        modules: chosen.modules,
        version,
        level,
        mode,
        mask: bestMask,
    };
}

/**
 * The matrix as an SVG path, one `M…h…v…h…z` rectangle per dark module.
 *
 * A path beats one `<rect>` per module: a version-10 symbol is 3 481 modules,
 * and that many elements is a real cost to parse and to paint. Coordinates are
 * whole numbers in module space, so the shape stays crisp at any size.
 *
 * @param matrix - An encoded matrix.
 * @param margin - Quiet zone in modules. The standard asks for 4.
 * @returns The `d` attribute, empty when there is nothing dark.
 */
export function matrixToPath(matrix: QRMatrix, margin = 4): string {
    const parts: string[] = [];
    for (let y = 0; y < matrix.size; y++) {
        let runStart = -1;
        for (let x = 0; x <= matrix.size; x++) {
            const dark = x < matrix.size && matrix.modules[y][x];
            if (dark && runStart === -1) runStart = x;
            if (!dark && runStart !== -1) {
                // Merge each horizontal run into one rectangle.
                parts.push(
                    `M${runStart + margin} ${y + margin}h${x - runStart}v1h-${x - runStart}z`,
                );
                runStart = -1;
            }
        }
    }
    return parts.join("");
}
