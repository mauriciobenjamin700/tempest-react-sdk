import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { announce, clearAnnouncer, useAnnounce, type AnnouncePoliteness } from "./use-announce";

function region(politeness: AnnouncePoliteness): HTMLElement | null {
    return document.querySelector(`[data-tempest-announcer="${politeness}"]`);
}

function Harness({ message, politeness }: { message: string; politeness?: AnnouncePoliteness }) {
    const say = useAnnounce();
    return (
        <button type="button" onClick={() => say(message, politeness)}>
            falar
        </button>
    );
}

afterEach(() => {
    vi.useRealTimers();
});

describe("useAnnounce", () => {
    it("mounts both regions before anything is announced", () => {
        render(<Harness message="oi" />);
        expect(region("polite")).not.toBeNull();
        expect(region("assertive")).not.toBeNull();
        expect(region("polite")).toHaveTextContent("");
    });

    it("gives the polite region a status role and the assertive one none", () => {
        render(<Harness message="oi" />);
        expect(region("polite")).toHaveAttribute("role", "status");
        expect(region("assertive")).not.toHaveAttribute("role");
        expect(region("assertive")).toHaveAttribute("aria-live", "assertive");
    });

    it("hides the regions visually without needing the stylesheet", () => {
        render(<Harness message="oi" />);
        expect(region("polite")!.style.position).toBe("absolute");
        expect(region("polite")!.style.clipPath).toBe("inset(50%)");
    });

    it("announces politely by default", async () => {
        render(<Harness message="3 pedidos" />);
        await userEvent.click(screen.getByText("falar"));
        expect(region("polite")).toHaveTextContent("3 pedidos");
        expect(region("assertive")).toHaveTextContent("");
    });

    it("routes an assertive message to the other region", async () => {
        render(<Harness message="falhou" politeness="assertive" />);
        await userEvent.click(screen.getByText("falar"));
        expect(region("assertive")).toHaveTextContent("falhou");
        expect(region("polite")).toHaveTextContent("");
    });

    /**
     * The whole reason the implementation replaces a child element instead of
     * writing `textContent`: identical text is not a change, and a screen reader
     * announces a live region only when its content changes.
     */
    it("announces the same string twice by inserting a fresh node", async () => {
        render(<Harness message="item removido" />);
        await userEvent.click(screen.getByText("falar"));
        const first = region("polite")!.firstElementChild;
        await userEvent.click(screen.getByText("falar"));
        const second = region("polite")!.firstElementChild;

        expect(first).not.toBe(second);
        expect(second).toHaveTextContent("item removido");
        expect(region("polite")!.childElementCount).toBe(1);
    });

    it("returns a stable function across renders", async () => {
        const seen: unknown[] = [];
        function Capture() {
            const say = useAnnounce();
            seen.push(say);
            return <p>x</p>;
        }
        const { rerender } = render(<Capture />);
        rerender(<Capture />);
        expect(seen[0]).toBe(seen[1]);
    });
});

describe("announce (framework-free)", () => {
    it("creates the regions on first use", () => {
        expect(region("polite")).toBeNull();
        announce("pronto");
        expect(region("polite")).toHaveTextContent("pronto");
    });

    it("ignores an empty message", () => {
        announce("");
        expect(region("polite")).toBeNull();
    });

    it("clears the message after the retention window", () => {
        vi.useFakeTimers();
        announce("salvo");
        expect(region("polite")).toHaveTextContent("salvo");
        act(() => {
            vi.advanceTimersByTime(7_100);
        });
        expect(region("polite")).toHaveTextContent("");
    });

    it("re-creates a detached pair without leaving the surviving sibling behind", () => {
        announce("um");
        region("polite")!.remove();
        announce("dois");
        expect(region("polite")).toHaveTextContent("dois");
        expect(document.querySelectorAll("[data-tempest-announcer]")).toHaveLength(2);
    });

    it("clearAnnouncer removes the regions and cancels pending cleanups", () => {
        vi.useFakeTimers();
        announce("tchau");
        clearAnnouncer();
        expect(region("polite")).toBeNull();
        expect(region("assertive")).toBeNull();
        expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
    });

    it("clearAnnouncer with nothing mounted is a no-op", () => {
        expect(() => clearAnnouncer()).not.toThrow();
    });

    /**
     * A message replaced before its retention window elapsed is already detached,
     * so the pending cleanup must not try to remove it a second time.
     */
    it("survives a cleanup whose node was already replaced", () => {
        vi.useFakeTimers();
        announce("primeiro");
        announce("segundo");
        expect(() => vi.advanceTimersByTime(7_100)).not.toThrow();
        expect(region("polite")).toHaveTextContent("");
    });

    it("does nothing outside a document, so a worker import cannot crash", () => {
        vi.stubGlobal("document", undefined);
        try {
            expect(() => announce("ninguém ouve")).not.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
        expect(region("polite")).toBeNull();
    });
});
