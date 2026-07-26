import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotificationCenter } from "./NotificationCenter";
import type { NotificationItem } from "./use-notification-inbox";

const NOW = new Date("2026-07-26T12:00:00Z").getTime();

const ITEMS: NotificationItem[] = [
    { id: "a", title: "Pedido enviado", body: "#1234 saiu para entrega", receivedAt: NOW - 60_000 },
    { id: "b", title: "Pagamento aprovado", receivedAt: NOW - 7_200_000, read: true },
];

/** Render with a frozen `now`, so the relative timestamps are assertable. */
function renderCenter(props: Partial<React.ComponentProps<typeof NotificationCenter>> = {}) {
    return render(<NotificationCenter items={ITEMS} now={NOW} {...props} />);
}

describe("NotificationCenter — rendering", () => {
    it("lists every entry with its title and body", () => {
        renderCenter();
        expect(screen.getByText("Pedido enviado")).toBeInTheDocument();
        expect(screen.getByText("#1234 saiu para entrega")).toBeInTheDocument();
        expect(screen.getByText("Pagamento aprovado")).toBeInTheDocument();
    });

    it("renders a title-only entry without a body", () => {
        const { container } = renderCenter({ items: [ITEMS[1]] });
        expect(container.querySelectorAll("li")).toHaveLength(1);
    });

    it("shows relative timestamps with a machine-readable dateTime", () => {
        renderCenter();
        const times = screen.getAllByText(/atrás|agora/);
        expect(times.length).toBe(2);
        expect(times[0].closest("time")).toHaveAttribute(
            "dateTime",
            new Date(NOW - 60_000).toISOString(),
        );
    });

    it("counts the unread entries in the header", () => {
        renderCenter();
        expect(screen.getByLabelText("1 não lidas")).toHaveTextContent("1");
    });

    it("omits the unread badge when everything is read", () => {
        renderCenter({ items: ITEMS.map((item) => ({ ...item, read: true })) });
        expect(screen.queryByLabelText(/não lidas/)).not.toBeInTheDocument();
    });

    it("marks unread rows for assistive technology, not only visually", () => {
        const { container } = renderCenter();
        const rows = [...container.querySelectorAll("li")];
        expect(rows[0]).toHaveAttribute("aria-current", "true");
        expect(rows[1]).not.toHaveAttribute("aria-current");
    });

    it("renders a custom leading icon per entry", () => {
        renderCenter({ renderIcon: (item) => <span data-testid={`icon-${item.id}`} /> });
        expect(screen.getByTestId("icon-a")).toBeInTheDocument();
        expect(screen.getByTestId("icon-b")).toBeInTheDocument();
    });

    it("accepts a custom heading and drops the header when title is null", () => {
        const { rerender } = renderCenter({ title: "Avisos" });
        expect(screen.getByRole("heading", { name: /Avisos/ })).toBeInTheDocument();

        rerender(<NotificationCenter items={ITEMS} now={NOW} title={null} />);
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    });
});

describe("NotificationCenter — empty", () => {
    it("shows the default empty state", () => {
        renderCenter({ items: [] });
        expect(screen.getByText("Nenhuma notificação")).toBeInTheDocument();
    });

    it("shows a custom empty state", () => {
        renderCenter({ items: [], emptyState: <p>Tudo limpo</p> });
        expect(screen.getByText("Tudo limpo")).toBeInTheDocument();
    });

    it("does not render the mark-all action with nothing unread", () => {
        renderCenter({ items: [], onMarkAllRead: vi.fn() });
        expect(
            screen.queryByRole("button", { name: /Marcar todas como lidas/ }),
        ).not.toBeInTheDocument();
    });
});

describe("NotificationCenter — interaction", () => {
    it("calls onSelect when an entry is activated", () => {
        const onSelect = vi.fn();
        renderCenter({ onSelect });
        fireEvent.click(screen.getByRole("button", { name: /Pedido enviado/ }));
        expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);
    });

    it("marks an entry read on activation, since opening it means reading it", () => {
        const onMarkRead = vi.fn();
        renderCenter({ onSelect: vi.fn(), onMarkRead });
        fireEvent.click(screen.getByRole("button", { name: /Pedido enviado/ }));
        expect(onMarkRead).toHaveBeenCalledWith("a");
    });

    it("does not re-mark an entry that is already read", () => {
        const onMarkRead = vi.fn();
        renderCenter({ onSelect: vi.fn(), onMarkRead });
        fireEvent.click(screen.getByRole("button", { name: /Pagamento aprovado/ }));
        expect(onMarkRead).not.toHaveBeenCalled();
    });

    it("is reachable by keyboard, because each entry is a real button", () => {
        const onSelect = vi.fn();
        renderCenter({ onSelect });
        const trigger = screen.getByRole("button", { name: /Pedido enviado/ });
        trigger.focus();
        expect(trigger).toHaveFocus();
        fireEvent.click(trigger);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it("renders plain text, not buttons, with no interaction handlers", () => {
        renderCenter();
        expect(screen.queryByRole("button", { name: /Pedido enviado/ })).not.toBeInTheDocument();
        expect(screen.getByText("Pedido enviado")).toBeInTheDocument();
    });

    it("calls onMarkAllRead from the header", () => {
        const onMarkAllRead = vi.fn();
        renderCenter({ onMarkAllRead });
        fireEvent.click(screen.getByRole("button", { name: /Marcar todas como lidas/ }));
        expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    });

    it("calls onDismiss from a per-entry control that names the entry", () => {
        const onDismiss = vi.fn();
        renderCenter({ onDismiss });
        fireEvent.click(screen.getByRole("button", { name: "Descartar: Pedido enviado" }));
        expect(onDismiss).toHaveBeenCalledWith("a");
    });

    it("omits the dismiss control when there is no handler", () => {
        renderCenter();
        expect(screen.queryByRole("button", { name: /Descartar/ })).not.toBeInTheDocument();
    });
});
