/**
 * Benchmark behind the numbers in `createZip`'s docstring and in
 * `docs/utilities.md` (#622): total time and the longest main-thread stall of
 * `zipSync`, fflate's worker-backed `zip()`, and `createZip` with and without
 * the automatic store of already-compressed formats.
 *
 * Input: a 4 MB CSV plus 20 × 200 KB of random bytes (standing in for photos,
 * which deflate cannot shrink), 8.4 MB in total. The stall is the longest gap
 * between ticks of a 1 ms `setInterval` — the time the event loop could not run
 * anything else.
 *
 * Run after `npm run build`:
 *
 *     node scripts/bench-zip.mjs [rounds]
 */
import { randomBytes } from "node:crypto";
import * as fflate from "fflate";
import { createZip } from "../dist/utils/zip.js";

const rounds = Number(process.argv[2] ?? 3);

const csvRow = "2026-11-15;Fazenda Boa Vista;Ovelha 1234;FAMACHA 3;observação qualquer\n";
const csvText = csvRow.repeat(Math.ceil((4 * 1024 * 1024) / csvRow.length));
const csv = new TextEncoder().encode(csvText);
const photos = Array.from({ length: 20 }, () => new Uint8Array(randomBytes(200 * 1024)));

/**
 * Start sampling the event loop.
 *
 * @returns A function that stops sampling and returns the longest gap, in ms.
 */
function stallMonitor() {
    let last = performance.now();
    let longest = 0;
    const tick = () => {
        const now = performance.now();
        longest = Math.max(longest, now - last);
        last = now;
    };
    const timer = setInterval(tick, 1);
    return () => {
        tick();
        clearInterval(timer);
        return longest;
    };
}

/**
 * Time one variant and print a Markdown table row.
 *
 * @param {string} name - Row label.
 * @param {() => Promise<number>} build - Builds the archive, resolving to its size.
 */
async function run(name, build) {
    const stop = stallMonitor();
    const start = performance.now();
    const size = await build();
    const total = performance.now() - start;
    const stall = stop();
    console.log(
        `| ${name} | ${total.toFixed(0)} | ${stall.toFixed(0)} | ${(size / 1e6).toFixed(2)} |`,
    );
}

/**
 * The input as fflate's `Zippable`.
 *
 * @returns A fresh map, so the worker variant can transfer its buffers.
 */
function zippable() {
    return Object.fromEntries([
        ["history.csv", csv.slice()],
        ...photos.map((bytes, i) => [`photos/${i}.jpg`, bytes.slice()]),
    ]);
}

/**
 * The input as `createZip` entries.
 *
 * @param {string} extension - Photo extension: `jpg` is stored, `bin` is deflated.
 * @returns The entries.
 */
function entries(extension) {
    return [
        { path: "history.csv", data: csvText },
        ...photos.map((bytes, i) => ({ path: `photos/${i}.${extension}`, data: bytes })),
    ];
}

console.log(`node ${process.version}, input 8.41 MB, level 6, ${rounds} rounds`);
console.log("| variant | total ms | longest stall ms | archive MB |");
console.log("| --- | --- | --- | --- |");
for (let round = 0; round < rounds; round++) {
    await run("zipSync", async () => fflate.zipSync(zippable(), { level: 6 }).length);
    await run(
        "zip() (one worker per file)",
        () =>
            new Promise((resolve, reject) => {
                fflate.zip(zippable(), { level: 6 }, (error, data) =>
                    error ? reject(error) : resolve(data.length),
                );
            }),
    );
    await run("createZip, all deflated", async () => (await createZip(entries("bin"))).size);
    await run("createZip, photos stored", async () => (await createZip(entries("jpg"))).size);
}
