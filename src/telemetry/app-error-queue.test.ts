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

const NONE = { session: null };

const report = (code: string, app_version = "1.0.0") => ({ code, message: "m", app_version });

describe("createAppErrorQueue", () => {
    it("persists what it holds, so a reload keeps the reports", () => {
        const storage = memoryStorage();
        createAppErrorQueue(storage, "k", 10).push(report("A"), NONE);
        expect(createAppErrorQueue(storage, "k", 10).entries()).toEqual([
            { report: report("A"), count: 1, session: null },
        ]);
    });

    it("folds an identical report into a count instead of a new entry", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 10);
        queue.push(report("A"), NONE);
        queue.push(report("A"), NONE);
        queue.push(report("A"), NONE);
        expect(queue.entries()).toEqual([{ report: report("A"), count: 3, session: null }]);
    });

    it("keeps the same code from two builds apart", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 10);
        queue.push(report("A", "1.0.0"), NONE);
        queue.push(report("A", "1.1.0"), NONE);
        expect(queue.entries()).toHaveLength(2);
    });

    it("evicts the oldest entry past the ceiling and says so", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 2);
        expect(queue.push(report("A"), NONE)).toBe(0);
        expect(queue.push(report("B"), NONE)).toBe(0);
        expect(queue.push(report("C"), NONE)).toBe(1);
        expect(queue.entries().map((entry) => entry.report.code)).toEqual(["B", "C"]);
    });

    it("removes by content, so an eviction during a send cannot drop the wrong report", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 2);
        queue.push(report("A"), NONE);
        queue.push(report("B"), NONE);
        queue.push(report("C"), NONE);
        queue.remove({ report: report("A"), count: 1, session: null });
        expect(queue.entries().map((entry) => entry.report.code)).toEqual(["B", "C"]);
    });

    it("never folds one session's or owner's report into another's", () => {
        const queue = createAppErrorQueue(memoryStorage(), "k", 10);
        queue.push(report("A"), { session: "t:a" });
        queue.push(report("A"), { session: "t:b" });
        queue.push(report("A"), { session: "t:a", owner: "p:alice" });
        queue.push(report("A"), NONE);
        expect(queue.entries().map((entry) => [entry.session, entry.owner, entry.count])).toEqual([
            ["t:a", undefined, 1],
            ["t:b", undefined, 1],
            ["t:a", "p:alice", 1],
            [null, undefined, 1],
        ]);
        const bob = { report: report("A"), count: 1, session: "t:b" };
        expect(queue.has(bob)).toBe(true);
        queue.remove(bob);
        expect(queue.has(bob)).toBe(false);
        expect(queue.entries()).toHaveLength(3);
    });

    it("reads entries persisted before stamps existed, with the session left unknown", () => {
        const legacy = JSON.stringify([{ report: report("A"), count: 2 }]);
        const queue = createAppErrorQueue(memoryStorage({ k: legacy }), "k", 10);
        expect(queue.entries()[0]?.session).toBeUndefined();
        queue.push(report("A"), NONE);
        expect(queue.entries()).toHaveLength(2);
        queue.remove({ report: report("A"), count: 2 });
        expect(queue.entries()).toEqual([{ report: report("A"), count: 1, session: null }]);
    });

    it("deletes the key once the queue is empty", () => {
        const storage = memoryStorage();
        const queue = createAppErrorQueue(storage, "k", 10);
        queue.push(report("A"), NONE);
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
        queue.push(report("A"), NONE);
        expect(queue.entries()).toHaveLength(1);
    });

    it("works with no storage at all", () => {
        const queue = createAppErrorQueue(null, "k", 10);
        queue.push(report("A"), NONE);
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
