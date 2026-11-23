import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createOfflineSync,
    type OutboxEntry,
    type PullPage,
    type SyncRunSummary,
} from "./create-offline-sync";
import type { OutboxAttachments } from "./outbox-attachments";

interface Visit {
    id: string;
    photoIds: string[];
}

type Stage = "list" | "upload:p1" | "upload:p2" | "uploaded:p1" | "uploaded:p2" | "patch";

/**
 * Who is signed in, the requests the tus double received (each tagged with who
 * was signed in when it was sent) and the stage hook a test switches the
 * principal from.
 */
const world: {
    who: string | null;
    wire: string[];
    created: number;
    offsets: Map<string, number>;
    hook: ((stage: Stage) => void) | null;
} = { who: "carlos", wire: [], created: 0, offsets: new Map(), hook: null };

/**
 * Stub `XMLHttpRequest` with a tus double: creation answers a fresh
 * `Location`, `HEAD` the offset the upload holds, and `PATCH` appends the body
 * after running the `"patch"` stage.
 */
function installXhr(): void {
    class FakeXhr {
        private method = "";
        private target = "";
        private reply: Record<string, string> = {};
        status = 0;
        responseText = "";
        withCredentials = false;
        upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;

        open(method: string, url: string): void {
            this.method = method;
            this.target = url;
        }
        setRequestHeader(): void {}
        getResponseHeader(name: string): string | null {
            const found = Object.entries(this.reply).find(
                ([key]) => key.toLowerCase() === name.toLowerCase(),
            );
            return found ? found[1] : null;
        }
        abort(): void {
            this.onabort?.();
        }
        send(body?: Blob): void {
            world.wire.push(`${this.method}@${world.who}`);
            setTimeout(() => {
                if (this.method === "POST") {
                    world.created += 1;
                    this.status = 201;
                    this.reply = { Location: `/api/uploads/${world.created}` };
                } else if (this.method === "PATCH") {
                    world.hook?.("patch");
                    const next = (world.offsets.get(this.target) ?? 0) + (body?.size ?? 0);
                    world.offsets.set(this.target, next);
                    this.status = 204;
                    this.reply = { "Upload-Offset": String(next) };
                } else {
                    this.status = 200;
                    this.reply = { "Upload-Offset": String(world.offsets.get(this.target) ?? 0) };
                }
                this.onload?.();
            }, 1);
        }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

/**
 * An engine with `getPrincipal`, two attachments per visit kept in an app
 * store — `p1` takes two 4-byte chunks, `p2` one — and a `deliver` that logs who it went out as.
 *
 * @param foreignEntries - The policy under test.
 * @returns The engine, the photos already uploaded and the `onUploaded` spy.
 */
function makeSync(foreignEntries: "drop" | "hold") {
    const blobs = new Map<string, Blob>([
        ["p1", new Blob(["aaaaaaaa"])],
        ["p2", new Blob(["bbbb"])],
    ]);
    const uploaded = new Map<string, string>();
    const onUploaded = vi.fn(async (attachment: { id: string }, url: string) => {
        uploaded.set(attachment.id, url);
        world.hook?.(`uploaded:${attachment.id}` as Stage);
    });
    const attachments: OutboxAttachments<Visit> = {
        list: async (entry) => {
            await Promise.resolve();
            world.hook?.("list");
            return (entry.payload?.photoIds ?? []).map((id) => ({
                id,
                blob: uploaded.has(id) ? null : (blobs.get(id) ?? null),
                uploadedUrl: uploaded.get(id) ?? null,
            }));
        },
        upload: async (attachment) => {
            world.hook?.(`upload:${attachment.id}` as Stage);
            return { endpoint: "/api/uploads", chunkSize: 4, retry: { retries: 0 } };
        },
        onUploaded,
    };
    const sync = createOfflineSync<Visit, never>({
        databaseName: `attachments-owner-${Math.random().toString(36).slice(2)}`,
        watermark: { get: () => null, set: () => undefined, clear: () => undefined },
        deliver: async (entry: OutboxEntry<Visit>) => {
            world.wire.push(`deliver:${entry.recordId}@${world.who}`);
        },
        pullPage: async (): Promise<PullPage<never>> => ({
            items: [],
            nextCursor: null,
            serverTime: null,
        }),
        applyRemote: async () => undefined,
        getPrincipal: () => world.who,
        foreignEntries,
        attachments,
    });
    return { sync, uploaded, onUploaded };
}

/**
 * Switch the principal once, the first time `stage` runs.
 *
 * @param stage - Where in the attachment phase the switch happens.
 * @param next - Who is signed in afterwards.
 */
function switchAt(stage: Stage, next: string | null): void {
    world.hook = (current) => {
        if (current !== stage) return;
        world.who = next;
        world.hook = null;
    };
}

/**
 * The summary counts this suite asserts on.
 *
 * @param summary - A run's summary.
 * @returns The ownership-related counts.
 */
function counts(summary: SyncRunSummary) {
    return {
        succeeded: summary.succeeded,
        failed: summary.failed,
        deferred: summary.deferred,
        held: summary.held ?? 0,
        dropped: summary.dropped ?? 0,
    };
}

beforeEach(() => {
    world.who = "carlos";
    world.wire = [];
    world.created = 0;
    world.offsets = new Map();
    world.hook = null;
    localStorage.clear();
    installXhr();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("createOfflineSync attachments — the owner is re-checked through the upload phase", () => {
    it("control: a switch before the flush holds the entry and sends nothing", async () => {
        const { sync } = makeSync("hold");
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        world.who = "ana";

        const summary = await sync.flush();

        expect(world.wire).toEqual([]);
        expect(counts(summary)).toEqual({
            succeeded: 0,
            failed: 0,
            deferred: 0,
            held: 1,
            dropped: 0,
        });
    });

    it("hold: a switch after attachment 1 holds the entry, sends no POST for attachment 2 and never delivers", async () => {
        const { sync, onUploaded } = makeSync("hold");
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        await sync.enqueue("update", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        switchAt("uploaded:p1", "ana");

        const summary = await sync.flush();

        expect(world.wire).toEqual(["POST@carlos", "PATCH@carlos", "PATCH@carlos"]);
        expect(onUploaded).toHaveBeenCalledTimes(1);
        expect(counts(summary)).toEqual({
            succeeded: 0,
            failed: 0,
            deferred: 1,
            held: 1,
            dropped: 0,
        });
        expect(await sync.pendingCount()).toBe(2);
    });

    it("drop: a switch after attachment 1 deletes the entry unsent", async () => {
        const { sync } = makeSync("drop");
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        switchAt("uploaded:p1", "ana");

        const summary = await sync.flush();

        expect(world.wire).toEqual(["POST@carlos", "PATCH@carlos", "PATCH@carlos"]);
        expect(counts(summary)).toEqual({
            succeeded: 0,
            failed: 0,
            deferred: 0,
            held: 0,
            dropped: 1,
        });
        expect(await sync.pendingCount()).toBe(0);
    });

    it("a switch inside upload() of attachment 2 stops before its creation", async () => {
        const { sync } = makeSync("hold");
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        switchAt("upload:p2", "ana");

        const summary = await sync.flush();

        expect(world.wire).toEqual(["POST@carlos", "PATCH@carlos", "PATCH@carlos"]);
        expect(summary.held).toBe(1);
        expect(summary.succeeded).toBe(0);
    });

    it("a switch while attachment 1's first chunk is on the wire stops that upload before its second chunk goes out as the next account", async () => {
        const { sync, onUploaded } = makeSync("hold");
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        switchAt("patch", "ana");

        const summary = await sync.flush();

        expect(world.wire).toEqual(["POST@carlos", "PATCH@carlos"]);
        expect(onUploaded).not.toHaveBeenCalled();
        expect(counts(summary)).toEqual({
            succeeded: 0,
            failed: 0,
            deferred: 0,
            held: 1,
            dropped: 0,
        });
        expect((await sync.listPending())[0].attempts).toBe(0);
    });

    it("a sign-out inside list() holds the entry instead of delivering it with no session", async () => {
        const { sync } = makeSync("hold");
        await sync.enqueue("create", "v1", { id: "v1", photoIds: [] });
        switchAt("list", null);

        const summary = await sync.flush();

        expect(world.wire).toEqual([]);
        expect(summary.held).toBe(1);
    });

    it("the owner's next run, back as carlos, delivers with the file uploaded before the switch", async () => {
        const { sync, uploaded } = makeSync("hold");
        await sync.enqueue("create", "v1", { id: "v1", photoIds: ["p1", "p2"] });
        switchAt("uploaded:p1", "ana");
        await sync.flush();
        world.who = "carlos";
        world.wire = [];

        const summary = await sync.flush();

        expect(world.wire).toEqual(["POST@carlos", "PATCH@carlos", "deliver:v1@carlos"]);
        expect(summary.succeeded).toBe(1);
        expect([...uploaded.keys()]).toEqual(["p1", "p2"]);
    });
});
