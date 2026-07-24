import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OfflineSync, SyncState } from "@/offline";
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

    it("omits the label when iconOnly", () => {
        render(<SyncStatusBadge tone="idle" iconOnly />);
        expect(screen.queryByText("Sincronizado")).not.toBeInTheDocument();
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
});
