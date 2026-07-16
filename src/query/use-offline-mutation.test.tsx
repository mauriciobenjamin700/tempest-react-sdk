import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OfflineSync } from "../offline";
import { useOfflineMutation } from "./use-offline-mutation";

interface Note {
    id: string;
    text: string;
}

function fakeSync(overrides: Partial<OfflineSync<Note>> = {}): OfflineSync<Note> {
    return {
        enqueue: vi.fn(async () => "entry-1"),
        flush: vi.fn(async () => ({
            trigger: "after-mutation",
            succeeded: 1,
            failed: 0,
            durationMs: 0,
            skipped: false,
            lastError: null,
        })),
        pendingCount: vi.fn(async () => 0),
        listPending: vi.fn(async () => []),
        clearOutbox: vi.fn(async () => undefined),
        resetWatermark: vi.fn(),
        getState: vi.fn(() => ({
            phase: "idle" as const,
            pending: 0,
            lastSummary: null,
            lastError: null,
            lastSyncedAt: null,
        })),
        subscribe: vi.fn(() => () => undefined),
        ...overrides,
    };
}

function makeWrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

describe("useOfflineMutation", () => {
    it("enqueues the entry and flushes after mutation", async () => {
        const sync = fakeSync();
        const client = new QueryClient();
        const { result } = renderHook(
            () =>
                useOfflineMutation<Note, Note[], Note>({
                    sync,
                    queryKey: ["notes"],
                    toEntry: (note) => ({ op: "create", recordId: note.id, payload: note }),
                }),
            { wrapper: makeWrapper(client) },
        );
        await act(async () => {
            await result.current.mutateAsync({ id: "n1", text: "hi" });
        });
        expect(sync.enqueue).toHaveBeenCalledWith("create", "n1", { id: "n1", text: "hi" });
        expect(sync.flush).toHaveBeenCalledWith("after-mutation");
    });

    it("optimistically patches the query cache", async () => {
        const sync = fakeSync();
        const client = new QueryClient();
        client.setQueryData(["notes"], [{ id: "n0", text: "old" }]);
        const { result } = renderHook(
            () =>
                useOfflineMutation<Note, Note[], Note>({
                    sync,
                    queryKey: ["notes"],
                    toEntry: (note) => ({ op: "create", recordId: note.id, payload: note }),
                    applyOptimistic: (current = [], note) => [...current, note],
                }),
            { wrapper: makeWrapper(client) },
        );
        await act(async () => {
            await result.current.mutateAsync({ id: "n1", text: "hi" });
        });
        expect(client.getQueryData<Note[]>(["notes"])).toHaveLength(2);
    });

    it("rolls back the cache when enqueue throws", async () => {
        const sync = fakeSync({
            enqueue: vi.fn(async () => {
                throw new Error("db down");
            }),
        });
        const client = new QueryClient();
        client.setQueryData(["notes"], [{ id: "n0", text: "old" }]);
        const { result } = renderHook(
            () =>
                useOfflineMutation<Note, Note[], Note>({
                    sync,
                    queryKey: ["notes"],
                    toEntry: (note) => ({ op: "create", recordId: note.id, payload: note }),
                    applyOptimistic: (current = [], note) => [...current, note],
                }),
            { wrapper: makeWrapper(client) },
        );
        await act(async () => {
            await result.current.mutateAsync({ id: "n1", text: "hi" }).catch(() => undefined);
        });
        await waitFor(() =>
            expect(client.getQueryData<Note[]>(["notes"])).toEqual([{ id: "n0", text: "old" }]),
        );
    });

    it("skips flush when flush is false", async () => {
        const sync = fakeSync();
        const client = new QueryClient();
        const { result } = renderHook(
            () =>
                useOfflineMutation<Note, Note[], Note>({
                    sync,
                    flush: false,
                    toEntry: (note) => ({ op: "create", recordId: note.id, payload: note }),
                }),
            { wrapper: makeWrapper(client) },
        );
        await act(async () => {
            await result.current.mutateAsync({ id: "n1", text: "hi" });
        });
        expect(sync.flush).not.toHaveBeenCalled();
    });
});
