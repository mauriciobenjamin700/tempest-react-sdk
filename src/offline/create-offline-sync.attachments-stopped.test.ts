import { describe, expect, it, vi } from "vitest";
import { createOfflineSync, type OutboxEntry, type PullPage } from "./create-offline-sync";

vi.mock("../http/resumable-upload", () => ({
    createResumableUpload: () => ({ start: async () => null }),
}));

describe("createOfflineSync attachments — an upload that stops short", () => {
    it("fails the entry when start() resolves null, since the record would point at a file that is not there", async () => {
        const deliver = vi.fn(async (_entry: OutboxEntry<{ id: string }>) => undefined);
        const onUploaded = vi.fn();
        const sync = createOfflineSync<{ id: string }, never>({
            databaseName: `attachments-stopped-${Math.random().toString(36).slice(2)}`,
            watermark: { get: () => null, set: () => undefined, clear: () => undefined },
            deliver,
            pullPage: async (): Promise<PullPage<never>> => ({
                items: [],
                nextCursor: null,
                serverTime: null,
            }),
            applyRemote: async () => undefined,
            attachments: {
                list: () => [{ id: "p1", blob: new Blob(["abcd"]) }],
                upload: () => ({ endpoint: "/api/uploads" }),
                onUploaded,
            },
        });
        await sync.enqueue("create", "v1", { id: "v1" });

        const summary = await sync.flush();

        expect(deliver).not.toHaveBeenCalled();
        expect(onUploaded).not.toHaveBeenCalled();
        expect(summary).toMatchObject({ failed: 1, succeeded: 0 });
        expect(summary.lastError).toBe("Upload of attachment p1 stopped before completing.");
        expect((await sync.listPending())[0].attempts).toBe(1);
    });
});
