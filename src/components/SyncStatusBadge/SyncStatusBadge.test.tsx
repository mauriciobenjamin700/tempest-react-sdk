import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SyncStatusBadge } from "./SyncStatusBadge";

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
});
