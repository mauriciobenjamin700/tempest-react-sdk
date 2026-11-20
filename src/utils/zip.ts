import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/** Deflate level: `0` stores the bytes as they are, `9` squeezes hardest. */
export type ZipLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** One file inside the archive. */
export interface ZipEntry {
    /**
     * Path inside the archive, relative and `/`-separated (`"photos/0001.jpg"`).
     * Must be unique; `..` segments, absolute paths, drive letters, backslashes
     * and NUL are refused.
     */
    path: string;
    /** Contents. A string is written as UTF-8. */
    data: Blob | Uint8Array | string;
    /**
     * Deflate level for this entry, overriding both the archive `level` and the
     * automatic store of already-compressed formats.
     */
    level?: ZipLevel;
}

/** Progress of {@link createZip}, in input bytes. */
export interface ZipProgress {
    /** Input bytes compressed so far. */
    loaded: number;
    /** Input bytes of every entry together, known before the first byte is read. */
    total: number;
}

/** Options for {@link createZip}. */
export interface CreateZipOptions {
    /** Called after every chunk, and once more with `loaded === total` at the end. */
    onProgress?: (progress: ZipProgress) => void;
    /** Deflate level for compressible entries. Defaults to `6`, fflate's own default. */
    level?: ZipLevel;
    /** Cancels the build; the promise rejects with the signal's reason. */
    signal?: AbortSignal;
}

/**
 * Bytes deflated between progress callbacks and time checks.
 *
 * The slice budget is what bounds a stall; the chunk only bounds how far one
 * push can overshoot it. At the level 6 throughput measured below (8.4 MB in
 * 131–232 ms with `zipSync`), 64 KB is one to two milliseconds of work.
 */
const CHUNK_BYTES = 64 * 1024;

/**
 * Longest stretch of work before yielding to the event loop. One frame at
 * 60 Hz is 16.7 ms; half of it leaves room for the app's own work.
 */
const SLICE_MS = 8;

/**
 * Extensions whose contents are already compressed, stored at level `0`.
 *
 * Deflating them burns CPU for no gain: in the {@link createZip} measurement,
 * storing the 20 random "images" cut the build from 178–275 ms to 48–70 ms,
 * and the archive came out *smaller* (4.11 MB stored against 4.12 MB deflated —
 * deflate framing on random bytes).
 */
const STORED_EXTENSIONS = new Set([
    "7z",
    "avif",
    "br",
    "docx",
    "gif",
    "gz",
    "heic",
    "jpeg",
    "jpg",
    "m4a",
    "mov",
    "mp3",
    "mp4",
    "ogg",
    "png",
    "pptx",
    "webm",
    "webp",
    "xlsx",
    "zip",
]);

/**
 * Level for an entry: its own, else `0` for a compressed format, else the archive's.
 *
 * @param entry - The entry.
 * @param level - The archive-wide level.
 * @returns The level to deflate it at.
 */
function levelFor(entry: ZipEntry, level: ZipLevel): ZipLevel {
    if (entry.level !== undefined) return entry.level;
    const dot = entry.path.lastIndexOf(".");
    const extension = dot === -1 ? "" : entry.path.slice(dot + 1).toLowerCase();
    return STORED_EXTENSIONS.has(extension) ? 0 : level;
}

/**
 * A drive prefix (`C:`), with or without a separator after it. On Windows
 * `C:evil.exe` is relative to the drive's current directory, so it escapes the
 * extraction folder just like `C:\evil.exe`.
 */
const DRIVE_PREFIX = /^[A-Za-z]:/;

/**
 * Characters that Windows best-fit conversion turns into a path separator, a
 * dot or a colon, and that NFKC leaves alone.
 *
 * Ported from Microsoft's `WindowsBestFit` tables
 * (`https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/WindowsBestFit/`,
 * the `WCTABLE` of `bestfit874`, `bestfit932`, `bestfit936`, `bestfit949`,
 * `bestfit950` and `bestfit1250`–`bestfit1258`): every code point those
 * tables map to `0x2E`, `0x2F`, `0x5C` or `0x3A`, minus the fullwidth forms
 * (`U+FF0E`, `U+FF0F`, `U+FF1A`, `U+FF3C`), which NFKC already folds. An
 * extractor that converts entry names to the ANSI code page with best-fit —
 * the default of `WideCharToMultiByte` — writes these as the ASCII character,
 * so `..\u2215evil.sh` lands as `../evil.sh` (security audit run-16 §6, #657).
 */
const BEST_FIT_PATH_LOOK_ALIKES: Readonly<Record<string, string>> = {
    "\u00A5": "\\",
    "\u00B4": "/",
    "\u0589": ":",
    "\u2044": "/",
    "\u20A9": "\\",
    "\u2215": "/",
    "\u2216": "\\",
    "\u2236": ":",
};

/**
 * The path as an extractor that folds Unicode would write it: the best-fit
 * look-alikes, NFKC, and the look-alikes again (NFKC turns `U+FFE5` into
 * `¥`, and would turn `´` into a space and a combining accent before the
 * table saw it), with `\` read as a separator.
 *
 * @param path - The entry path.
 * @returns The folded path.
 */
function foldedPath(path: string): string {
    const bestFit = (text: string): string =>
        Array.from(text, (char) => BEST_FIT_PATH_LOOK_ALIKES[char] ?? char).join("");
    return bestFit(bestFit(path).normalize("NFKC")).replace(/\\/g, "/");
}

/**
 * Why a path is unsafe to hand to an extractor, or `null` when it is safe.
 *
 * The zip format stores names verbatim and leaves interpretation to whoever
 * unpacks the archive. An extractor that joins the name onto its target folder
 * without checking (the zip-slip shape) writes `../evil.sh` beside the folder,
 * `/etc/x` or `C:\x` anywhere on disk, and treats `\` as a separator on Windows.
 * NUL truncates the name in C-based tools, so `a.txt<NUL>.jpg` lands as `a.txt`.
 * Each of those is refused instead of normalized: rewriting a name silently would
 * ship an archive whose layout differs from what the caller asked for, and only
 * the caller knows what the name was meant to be.
 *
 * A dot inside a segment (`a..b.txt`, `..config`) and a `./` segment are left
 * alone — neither leaves the extraction folder.
 *
 * The same shapes are refused once the path is folded (see `foldedPath`):
 * Unicode look-alikes of `.`, `/`, `\` and `:` — `U+FF0E`, `U+2215`, `U+FF3C`,
 * `U+2024` and the rest — pass the ASCII checks and come back as the ASCII
 * character in an extractor that applies NFKC or Windows best-fit conversion
 * (#657). Only the escape is refused: a look-alike that folds into an
 * ordinary name (`recibo ¥1000.pdf`, `a．b.jpg`) is kept as written.
 *
 * @param path - The entry path.
 * @returns A short reason, or `null` when the path is safe.
 */
function unsafePathReason(path: string): string | null {
    if (path.includes("\u0000")) return "contains NUL";
    if (path.includes("\\")) return "uses a backslash; separate folders with /";
    if (path.startsWith("/")) return "is absolute";
    if (DRIVE_PREFIX.test(path)) return "starts with a drive letter";
    if (path.split("/").includes("..")) return "has a .. segment";
    const folded = foldedPath(path);
    if (folded.startsWith("/")) return "folds to an absolute path (Unicode look-alike)";
    if (DRIVE_PREFIX.test(folded)) return "folds to a drive letter (Unicode look-alike)";
    if (folded.split("/").includes("..")) return "folds to a .. segment (Unicode look-alike)";
    return null;
}

/**
 * Hand control back to the event loop.
 *
 * A `MessageChannel` message is a macrotask without the 4 ms clamp browsers put
 * on nested `setTimeout`, which over a few hundred slices would add up to a
 * second of pure waiting.
 *
 * @returns A promise settled on the next macrotask.
 */
function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof MessageChannel === "undefined") {
            setTimeout(resolve, 0);
            return;
        }
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
            channel.port1.close();
            resolve();
        };
        channel.port2.postMessage(null);
    });
}

/**
 * The bytes of an entry, read only when its turn comes so a Blob's contents are
 * not all held in memory at once.
 *
 * @param data - The entry's contents.
 * @param encoded - The UTF-8 bytes already encoded for a string entry, else `null`.
 * @returns The bytes.
 */
async function bytesOf(data: ZipEntry["data"], encoded: Uint8Array | null): Promise<Uint8Array> {
    if (encoded) return encoded;
    if (data instanceof Uint8Array) return data;
    return new Uint8Array(await (data as Blob).arrayBuffer());
}

/**
 * Build a `.zip` archive without freezing the page, reporting progress.
 *
 * The pair of {@link writeXlsx} for the common export: a spreadsheet plus the
 * photos it refers to. Built on fflate's streaming `Zip`, fed in 64 KB chunks;
 * the work runs in slices of at most ~8 ms and yields to the event loop between
 * them, so scrolling and a progress bar keep moving.
 *
 * Why slices on the main thread and not fflate's worker-backed `zip()`. On
 * 8.4 MB (a 4 MB CSV + 20 × 200 KB random "images", level 6, Node 24, fflate
 * 0.8.3, five runs of `node scripts/bench-zip.mjs 5`):
 *
 * | variant                    | total      | longest stall |
 * | -------------------------- | ---------- | ------------- |
 * | `zipSync`                  | 131–232 ms | 131–232 ms    |
 * | `zip()` (one worker/file)  | 576–962 ms | 32–145 ms     |
 * | `createZip`, all deflated  | 178–275 ms | 12–30 ms      |
 * | `createZip`, images stored | 48–70 ms   | 11–14 ms      |
 *
 * The worker version is three times slower (a worker spawned per file, each
 * file copied into it), stalls longer, and has no progress until a whole file
 * is done.
 *
 * Already-compressed formats (JPEG, PNG, WebP, MP4, ZIP, XLSX, …) are stored at
 * level `0` by extension — deflating them costs time and saves nothing. A
 * per-entry `level` overrides that.
 *
 * Entry names are checked before any byte is read. A name that would let a
 * naive extractor write outside its target folder (zip-slip) is refused with a
 * `TypeError` rather than rewritten: a `..` segment, an absolute path (`/x`), a
 * drive letter (`C:\x`, `C:/x`, `C:x`), a backslash, or a NUL — written in
 * ASCII or with a Unicode look-alike that NFKC or Windows best-fit folds into
 * one (`．．/x`, `..∕x`; #657). Subfolders with
 * `/` (`fotos/a.jpg`) are the supported shape.
 *
 * @param entries - Files to archive, in order. Paths must be unique, relative
 *     and `/`-separated.
 * @param options - Progress callback, deflate level and abort signal.
 * @returns The archive as a `Blob` of type `application/zip`.
 * @throws {TypeError} When a path is empty, repeated, or unsafe to extract.
 * @throws The signal's reason when aborted.
 *
 * @example
 * ```ts
 * import { createZip, writeXlsx } from "tempest-react-sdk";
 *
 * async function exportHistory(photos: File[]): Promise<Blob> {
 *     const sheet = writeXlsx(["Animal", "Grau"], [["Ovelha 12", 3]]);
 *     return createZip(
 *         [
 *             { path: "historico.xlsx", data: sheet },
 *             ...photos.map((photo) => ({ path: `fotos/${photo.name}`, data: photo })),
 *         ],
 *         { onProgress: ({ loaded, total }) => console.log(loaded / total) },
 *     );
 * }
 * ```
 */
export async function createZip(
    entries: readonly ZipEntry[],
    options: CreateZipOptions = {},
): Promise<Blob> {
    const { onProgress, level = 6, signal } = options;
    const seen = new Set<string>();
    for (const entry of entries) {
        if (entry.path === "") throw new TypeError("createZip: an entry has an empty path");
        const unsafe = unsafePathReason(entry.path);
        if (unsafe !== null) {
            throw new TypeError(`createZip: unsafe path "${entry.path}" (${unsafe})`);
        }
        if (seen.has(entry.path)) {
            throw new TypeError(`createZip: duplicate path "${entry.path}"`);
        }
        seen.add(entry.path);
    }
    signal?.throwIfAborted();

    const encoder = new TextEncoder();
    const encoded = entries.map((entry) =>
        typeof entry.data === "string" ? encoder.encode(entry.data) : null,
    );
    const total = entries.reduce((sum, entry, index) => {
        const data = entry.data;
        return (
            sum +
            (encoded[index]?.length ??
                (data instanceof Uint8Array ? data.length : (data as Blob).size))
        );
    }, 0);

    const chunks: Uint8Array[] = [];
    let failure: Error | null = null;
    const archive = new Zip((error, chunk) => {
        if (error) failure = error;
        else chunks.push(chunk);
    });

    let loaded = 0;
    let sliceStart = performance.now();
    try {
        for (const [index, entry] of entries.entries()) {
            const bytes = await bytesOf(entry.data, encoded[index] ?? null);
            signal?.throwIfAborted();
            const entryLevel = levelFor(entry, level);
            const file =
                entryLevel === 0
                    ? new ZipPassThrough(entry.path)
                    : new ZipDeflate(entry.path, { level: entryLevel });
            archive.add(file);
            if (bytes.length === 0) file.push(bytes, true);
            for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
                const end = Math.min(offset + CHUNK_BYTES, bytes.length);
                file.push(bytes.subarray(offset, end), end === bytes.length);
                if (failure) throw failure;
                loaded += end - offset;
                onProgress?.({ loaded, total });
                if (performance.now() - sliceStart >= SLICE_MS) {
                    await yieldToEventLoop();
                    signal?.throwIfAborted();
                    sliceStart = performance.now();
                }
            }
        }
        archive.end();
        if (failure) throw failure;
    } catch (error) {
        archive.terminate();
        throw error;
    }
    onProgress?.({ loaded: total, total });
    return new Blob(chunks as Uint8Array<ArrayBuffer>[], { type: "application/zip" });
}
