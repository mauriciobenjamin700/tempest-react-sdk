import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StorageUsage } from "./StorageUsage";

const MB: number = 1024 * 1024;

describe("StorageUsage", () => {
    it("shows usage, quota and pending bytes in a named meter", () => {
        render(<StorageUsage usage={30 * MB} quota={100 * MB} pendingBytes={5 * MB} />);
        const meter = screen.getByRole("meter", { name: "Armazenamento" });
        expect(meter).toHaveAttribute("aria-valuenow", "30");
        expect(meter).toHaveAttribute("aria-valuemin", "0");
        expect(meter).toHaveAttribute("aria-valuemax", "100");
        expect(meter).toHaveAttribute("aria-valuetext", "30 MB de 100 MB usados");
        expect(screen.getByText("30%")).toBeInTheDocument();
        expect(screen.getByText(/5 MB pendentes de envio/)).toBeInTheDocument();
    });

    it("stays quiet below the warning threshold", () => {
        render(<StorageUsage usage={30 * MB} quota={100 * MB} persisted pendingBytes={MB} />);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("warns once usage reaches the app's warnAt", () => {
        const { rerender } = render(<StorageUsage usage={89 * MB} quota={100 * MB} warnAt={0.9} />);
        expect(screen.queryByText(/quase cheio/)).not.toBeInTheDocument();
        rerender(<StorageUsage usage={90 * MB} quota={100 * MB} warnAt={0.9} />);
        expect(screen.getByRole("status")).toHaveTextContent(/Armazenamento quase cheio/);
    });

    it("caps the bar at 100% when usage exceeds the quota", () => {
        render(<StorageUsage usage={150 * MB} quota={100 * MB} />);
        expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
        expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("warns that pending data can be evicted when storage is not persisted", () => {
        render(
            <StorageUsage usage={10 * MB} quota={100 * MB} persisted={false} pendingBytes={MB} />,
        );
        expect(screen.getByRole("status")).toHaveTextContent(/não é permanente/);
    });

    it("does not warn about eviction when nothing is pending", () => {
        render(
            <StorageUsage usage={10 * MB} quota={100 * MB} persisted={false} pendingBytes={0} />,
        );
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getByText(/Nada pendente de envio/)).toBeInTheDocument();
    });

    it("does not warn about eviction when persistence is unknown", () => {
        render(
            <StorageUsage usage={10 * MB} quota={100 * MB} persisted={null} pendingBytes={MB} />,
        );
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("offers the persist action only while storage is not persisted", () => {
        const onRequestPersist = vi.fn();
        const { rerender } = render(
            <StorageUsage
                usage={10 * MB}
                quota={100 * MB}
                persisted={false}
                onRequestPersist={onRequestPersist}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Tornar armazenamento permanente" }));
        expect(onRequestPersist).toHaveBeenCalledTimes(1);
        rerender(
            <StorageUsage
                usage={10 * MB}
                quota={100 * MB}
                persisted
                onRequestPersist={onRequestPersist}
            />,
        );
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("keeps the persist button busy until the returned promise settles", async () => {
        let resolve: (granted: boolean) => void = () => {};
        const pending = new Promise<boolean>((r) => {
            resolve = r;
        });
        render(
            <StorageUsage
                usage={10 * MB}
                quota={100 * MB}
                persisted={false}
                onRequestPersist={() => pending}
            />,
        );
        const button = screen.getByRole("button", { name: /Tornar armazenamento permanente/ });
        fireEvent.click(button);
        expect(button).toHaveAttribute("aria-busy", "true");
        await act(async () => {
            resolve(true);
            await pending;
        });
        expect(button).not.toHaveAttribute("aria-busy");
    });

    it("replaces the meter with a sentence when the browser reports nothing", () => {
        render(<StorageUsage usage={null} quota={null} pendingBytes={2 * MB} />);
        expect(screen.queryByRole("meter")).not.toBeInTheDocument();
        expect(screen.getByText(/não informa o uso de armazenamento/)).toBeInTheDocument();
        expect(screen.getByText("2 MB pendentes de envio")).toBeInTheDocument();
        expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    });

    it("treats a zero quota as unknown instead of dividing by it", () => {
        render(<StorageUsage usage={0} quota={0} />);
        expect(screen.queryByRole("meter")).not.toBeInTheDocument();
        expect(screen.queryByText(/quase cheio/)).not.toBeInTheDocument();
    });

    it("hides the pending line when the app does not track pending bytes", () => {
        render(<StorageUsage usage={10 * MB} quota={100 * MB} />);
        expect(screen.getByText("10 MB de 100 MB usados")).toBeInTheDocument();
        expect(screen.queryByText(/pendente/)).not.toBeInTheDocument();
    });

    it("lets the app replace every text", () => {
        render(
            <StorageUsage
                usage={95 * MB}
                quota={100 * MB}
                pendingBytes={MB}
                persisted={false}
                onRequestPersist={() => undefined}
                labels={{
                    title: "Storage",
                    used: (u, q) => `${u} of ${q} used`,
                    pending: (p) => `${p} waiting to upload`,
                    overLimit: "Storage almost full.",
                    notPersisted: "Storage may be cleared.",
                    persistAction: "Make storage persistent",
                }}
            />,
        );
        expect(screen.getByRole("meter", { name: "Storage" })).toHaveAttribute(
            "aria-valuetext",
            "95 MB of 100 MB used",
        );
        expect(screen.getByText(/1 MB waiting to upload/)).toBeInTheDocument();
        expect(screen.getByText("Storage almost full.")).toBeInTheDocument();
        expect(screen.getByText("Storage may be cleared.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Make storage persistent" })).toBeInTheDocument();
    });
});
