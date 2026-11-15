import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { createZip } from "./zip";
import type { ZipProgress } from "./zip";
import { writeXlsx } from "./xlsx";

async function unzipBlob(blob: Blob): Promise<Record<string, Uint8Array>> {
    return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

async function methods(blob: Blob): Promise<Record<string, number>> {
    const found: Record<string, number> = {};
    unzipSync(new Uint8Array(await blob.arrayBuffer()), {
        filter: (file) => {
            found[file.name] = file.compression;
            return false;
        },
    });
    return found;
}

function pseudoRandom(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let state = 0x2545f491;
    for (let i = 0; i < length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        bytes[i] = state & 0xff;
    }
    return bytes;
}

describe("createZip", () => {
    it("round-trips strings, bytes and Blobs, in a Blob of type application/zip", async () => {
        const sheet = writeXlsx(["Animal", "Grau"], [["Ovelha 12", 3]]);
        const blob = await createZip([
            { path: "leia-me.txt", data: "Exportação — ç, ã, é" },
            { path: "historico.xlsx", data: sheet },
            { path: "fotos/1.bin", data: new Blob([new Uint8Array([1, 2, 3])]) },
        ]);
        expect(blob.type).toBe("application/zip");
        const files = await unzipBlob(blob);
        expect(strFromU8(files["leia-me.txt"] as Uint8Array)).toBe("Exportação — ç, ã, é");
        expect(files["historico.xlsx"]).toEqual(sheet);
        expect(Array.from(files["fotos/1.bin"] as Uint8Array)).toEqual([1, 2, 3]);
    });

    it("reports progress in input bytes, monotonic, ending at the total", async () => {
        const big = pseudoRandom(300 * 1024);
        const calls: ZipProgress[] = [];
        await createZip(
            [
                { path: "a.csv", data: "x".repeat(100 * 1024) },
                { path: "b.bin", data: big },
            ],
            { onProgress: (progress) => calls.push(progress) },
        );
        const total = 100 * 1024 + big.length;
        expect(calls.length).toBeGreaterThan(2);
        expect(calls.every((call) => call.total === total)).toBe(true);
        for (let i = 1; i < calls.length; i++) {
            expect(calls[i]!.loaded).toBeGreaterThanOrEqual(calls[i - 1]!.loaded);
        }
        expect(calls.at(-1)).toEqual({ loaded: total, total });
    });

    it("counts a Blob and a string by their byte size before reading them", async () => {
        const calls: ZipProgress[] = [];
        await createZip(
            [
                { path: "a.txt", data: "ção" },
                { path: "b.bin", data: new Blob([new Uint8Array(10)]) },
            ],
            { onProgress: (progress) => calls.push(progress) },
        );
        expect(calls[0]?.total).toBe(5 + 10);
    });

    it("stores already-compressed formats and deflates the rest", async () => {
        const blob = await createZip([
            { path: "fotos/a.JPG", data: pseudoRandom(1024) },
            { path: "video.mp4", data: pseudoRandom(1024) },
            { path: "dados.csv", data: "a;b\n".repeat(500) },
        ]);
        expect(await methods(blob)).toEqual({ "fotos/a.JPG": 0, "video.mp4": 0, "dados.csv": 8 });
    });

    it("lets an entry level override both the archive level and the automatic store", async () => {
        const blob = await createZip(
            [
                { path: "a.jpg", data: pseudoRandom(64), level: 9 },
                { path: "b.csv", data: "a;b\n".repeat(50) },
                { path: "c.csv", data: "a;b\n".repeat(50), level: 6 },
            ],
            { level: 0 },
        );
        expect(await methods(blob)).toEqual({ "a.jpg": 8, "b.csv": 0, "c.csv": 8 });
    });

    it("compresses repetitive text far below its size", async () => {
        const text = "2026-11-15;Fazenda Boa Vista;FAMACHA 3\n".repeat(20_000);
        const blob = await createZip([{ path: "historico.csv", data: text }]);
        expect(blob.size).toBeLessThan(text.length / 50);
    });

    it("writes empty files and an empty archive", async () => {
        const files = await unzipBlob(await createZip([{ path: "vazio.txt", data: "" }]));
        expect(files["vazio.txt"]).toEqual(new Uint8Array(0));
        expect(await unzipBlob(await createZip([]))).toEqual({});
    });

    it("refuses empty and duplicate paths before reading anything", async () => {
        await expect(createZip([{ path: "", data: "x" }])).rejects.toThrow(TypeError);
        await expect(
            createZip([
                { path: "a.txt", data: "1" },
                { path: "a.txt", data: "2" },
            ]),
        ).rejects.toThrow(/duplicate path "a.txt"/);
    });

    it.each([
        ["a parent segment at the start", "../evil.sh"],
        ["a parent segment in the middle", "fotos/../../evil.sh"],
        ["a lone parent segment", ".."],
        ["a trailing parent segment", "fotos/.."],
        ["an absolute POSIX path", "/etc/passwd"],
        ["a Windows drive path with a backslash", "C:\\Windows\\evil.exe"],
        ["a Windows drive path with a slash", "C:/Windows/evil.exe"],
        ["a drive-relative Windows path", "c:evil.exe"],
        ["a backslash separator", "fotos\\a.jpg"],
        ["a leading backslash", "\\evil.sh"],
        ["a NUL byte", "a.txt\u0000.jpg"],
    ])("refuses %s, which a naive extractor turns into zip-slip", async (_label, path) => {
        await expect(createZip([{ path, data: "x" }])).rejects.toThrow(TypeError);
    });

    it("refuses an unsafe path before reading any entry", async () => {
        const blob = new Blob(["x"]);
        const read = vi.spyOn(blob, "arrayBuffer");
        await expect(
            createZip([
                { path: "ok.txt", data: blob },
                { path: "../evil.sh", data: "x" },
            ]),
        ).rejects.toThrow(/unsafe path "\.\.\/evil\.sh"/);
        expect(read).not.toHaveBeenCalled();
    });

    it("keeps legitimate names, subfolders and dots inside a segment", async () => {
        const paths = [
            "fotos/a.jpg",
            "fotos/2026/11/b.png",
            "..config",
            "fotos/a..b.txt",
            "./leia-me.txt",
            "relatório final.txt",
        ];
        const files = await unzipBlob(await createZip(paths.map((path) => ({ path, data: path }))));
        expect(Object.keys(files).sort()).toEqual([...paths].sort());
    });

    it("yields to the event loop while it works, so the page keeps moving", async () => {
        const ticks = vi.fn();
        const timer = setInterval(ticks, 0);
        try {
            await createZip([{ path: "a.bin", data: pseudoRandom(4 * 1024 * 1024) }]);
        } finally {
            clearInterval(timer);
        }
        expect(ticks).toHaveBeenCalled();
    });

    it("rejects with the reason when aborted before starting", async () => {
        const controller = new AbortController();
        controller.abort(new Error("cancelado"));
        await expect(
            createZip([{ path: "a.txt", data: "x" }], { signal: controller.signal }),
        ).rejects.toThrow("cancelado");
    });

    it("stops mid-way when aborted during the build", async () => {
        const controller = new AbortController();
        const onProgress = vi.fn((progress: ZipProgress) => {
            if (progress.loaded >= 256 * 1024) controller.abort(new Error("cancelado"));
        });
        await expect(
            createZip([{ path: "a.bin", data: pseudoRandom(8 * 1024 * 1024) }], {
                signal: controller.signal,
                onProgress,
            }),
        ).rejects.toThrow("cancelado");
        const last = onProgress.mock.calls.at(-1)?.[0];
        expect(last?.loaded).toBeLessThan(8 * 1024 * 1024);
    });

    it("works without MessageChannel, falling back to setTimeout", async () => {
        vi.stubGlobal("MessageChannel", undefined);
        try {
            const files = await unzipBlob(
                await createZip([{ path: "a.bin", data: pseudoRandom(2 * 1024 * 1024) }]),
            );
            expect(files["a.bin"]?.length).toBe(2 * 1024 * 1024);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
