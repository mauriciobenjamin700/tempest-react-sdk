import { act, render, screen } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
    createOfflineSync,
    type OfflineSync,
    type PullPage,
    type SyncState,
    type SyncStatusSource,
} from "@/offline";
import { SyncStatusBadge } from "./SyncStatusBadge";

function fakeSync(state: Partial<SyncState>): OfflineSync<unknown> {
    const full: SyncState = {
        phase: "idle",
        pending: 0,
        lastSummary: null,
        lastError: null,
        lastSyncedAt: null,
        ...state,
    };
    return {
        enqueue: vi.fn(),
        flush: vi.fn(),
        pendingCount: vi.fn(),
        listPending: vi.fn(),
        clearOutbox: vi.fn(),
        resetWatermark: vi.fn(),
        getState: () => full,
        subscribe: () => () => undefined,
        dispose: vi.fn(),
    } as unknown as OfflineSync<unknown>;
}

describe("SyncStatusBadge", () => {
    it("renders the default label per tone", () => {
        render(<SyncStatusBadge tone="offline" />);
        expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    it("shows pending count for pending/error tones", () => {
        render(<SyncStatusBadge tone="pending" pending={3} />);
        expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("hides pending count for idle tone", () => {
        render(<SyncStatusBadge tone="idle" pending={3} />);
        expect(screen.queryByText("3")).not.toBeInTheDocument();
    });

    it("respects custom labels", () => {
        render(<SyncStatusBadge tone="syncing" labels={{ syncing: "Enviando" }} />);
        expect(screen.getByText("Enviando")).toBeInTheDocument();
    });

    /**
     * `iconOnly` hides the label visually but must keep it in the accessibility
     * tree: the badge is a `role="status"` live region, so dropping the text
     * altogether left a region whose content never changed — a switch to `offline`
     * or `error` was then announced as nothing at all.
     */
    it("hides the label visually but keeps it announceable when iconOnly", () => {
        const { container } = render(<SyncStatusBadge tone="idle" iconOnly />);
        const label = screen.getByText("Sincronizado");
        expect(label).toBeInTheDocument();
        expect(label.className).toContain("hidden");
        expect(container.querySelector("[class*='label']")).toBeNull();
        expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("derives tone and pending from a connected engine", () => {
        render(<SyncStatusBadge sync={fakeSync({ phase: "error", pending: 5, lastError: "x" })} />);
        expect(screen.getByText("Erro")).toBeInTheDocument();
        expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("connected engine with pending mutations reads as pending tone", () => {
        render(<SyncStatusBadge sync={fakeSync({ phase: "idle", pending: 2 })} />);
        expect(screen.getByText("Pendente")).toBeInTheDocument();
    });

    /**
     * #718: the prop used to be `OfflineSync<unknown>`. The engine is invariant in
     * its payload (`enqueue` takes it as a parameter), so under `strict` every
     * engine an app creates — `OfflineSync<Visit>` — failed with TS2322 at
     * `sync={...}`. The engine below is real and typed, with no cast: if the prop
     * narrows back to the whole engine, `npm run typecheck` fails on this file.
     */
    it("accepts an engine created with a concrete payload type", async () => {
        interface Visit {
            id: string;
            note: string;
        }
        const visits = createOfflineSync<Visit, Visit>({
            databaseName: `badge-${Math.random().toString(36).slice(2)}`,
            watermark: { get: () => null, set: () => undefined, clear: () => undefined },
            deliver: vi.fn(async () => undefined),
            pullPage: vi.fn(async (): Promise<PullPage<Visit>> => ({
                items: [],
                nextCursor: null,
                serverTime: null,
            })),
            applyRemote: vi.fn(async () => undefined),
        });
        expectTypeOf(visits).toExtend<SyncStatusSource>();

        render(<SyncStatusBadge sync={visits} />);
        expect(screen.getByText("Sincronizado")).toBeInTheDocument();

        await act(async () => {
            await visits.enqueue("create", "v1", { id: "v1", note: "porta 3" });
        });
        expect(screen.getByText("Pendente")).toBeInTheDocument();
        expect(screen.getByText("1")).toBeInTheDocument();
        visits.dispose();
    });
});
