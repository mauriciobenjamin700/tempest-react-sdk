import { describe, expect, it, vi } from "vitest";
import { createAppErrorQueue } from "./app-error-queue";
import type { AppErrorQueueStorage } from "./app-error-queue";

function memoryStorage(initial: Record<string, string> = {}): AppErrorQueueStorage & {
    data: Record<string, string>;
} {
    const data = { ...initial };
    return {
        data,
        getItem: (key) => data[key] ?? null,
        setItem: (key, value) => {
            data[key] = value;
        },
        removeItem: (key) => {
            delete data[key];
        },
    };
}

const report = (code: string, app_version = "1.0.0") => ({ code, message: "m", app_version });

describe("createAppErrorQueue", () => {
    it("persists what it holds, so a reload keeps the reports", () => {
        const storage = memoryStorage();
        createAppErrorQueue(storage, "k", 10).push(report("A"));
        expect(createAppErrorQueue(storage, "k", 10).entries()).toEqual([
            { report: report("A"), count: 1 },
        ]);
    });

    it("folds an identical report into a count instead of a new entry", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 10);
        queue.push(report("A"));
        queue.push(report("A"));
        queue.push(report("A"));
        expect(queue.entries()).toEqual([{ report: report("A"), count: 3 }]);
    });

    it("keeps the same code from two builds apart", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 10);
        queue.push(report("A", "1.0.0"));
        queue.push(report("A", "1.1.0"));
        expect(queue.entries()).toHaveLength(2);
    });

    it("evicts the oldest entry past the ceiling and says so", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 2);
        expect(queue.push(report("A"))).toBe(0);
        expect(queue.push(report("B"))).toBe(0);
        expect(queue.push(report("C"))).toBe(1);
        expect(queue.entries().map((entry) => entry.report.code)).toEqual(["B", "C"]);
    });

    it("removes by content, so an eviction during a send cannot drop the wrong report", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 2);
        queue.push(report("A"));
        queue.push(report("B"));
        queue.push(report("C"));
        queue.remove(report("A"));
        expect(queue.entries().map((entry) => entry.report.code)).toEqual(["B", "C"]);
    });

    it("deletes the key once the queue is empty", () => {
        const storage = memoryStorage();
        const queue = createAppErrorQueue(storage, "k", 10);
        queue.push(report("A"));
        queue.clear();
        expect(storage.data).toEqual({});
    });

    it("treats a corrupt or non-array stored value as empty", () => {
        expect(createAppErrorQueue(memoryStorage({ k: "{nope" }), "k", 10).entries()).toEqual([]);
        expect(createAppErrorQueue(memoryStorage({ k: '{"a":1}' }), "k", 10).entries()).toEqual([]);
    });

    it("keeps working in memory when storage refuses writes", () => {
        const storage = memoryStorage();
        storage.setItem = vi.fn(() => {
            throw new DOMException("full", "QuotaExceededError");
        });
        const queue = createAppErrorQueue(storage, "k", 10);
        queue.push(report("A"));
        expect(queue.entries()).toHaveLength(1);
    });

    it("works with no storage at all", () => {
        const queue = createAppErrorQueue(null, "k", 10);
        queue.push(report("A"));
        expect(queue.entries()).toHaveLength(1);
    });

    it("treats storage whose read throws as empty", () => {
        const storage = memoryStorage();
        storage.getItem = () => {
            throw new Error("blocked");
        };
        expect(createAppErrorQueue(storage, "k", 10).entries()).toEqual([]);
    });
});
