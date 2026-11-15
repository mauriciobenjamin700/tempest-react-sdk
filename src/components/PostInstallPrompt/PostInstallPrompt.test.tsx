import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostInstallPrompt } from "./PostInstallPrompt";

/** Fires the event Chromium sends after any install path completes. */
function fireAppInstalled(): void {
    act(() => {
        window.dispatchEvent(new Event("appinstalled"));
    });
}

/**
 * Makes the tab look script-closable or not, the way Chromium decides it.
 *
 * @param length - The `history.length` to report.
 */
function setHistoryLength(length: number): void {
    vi.spyOn(window.history, "length", "get").mockReturnValue(length);
}

const overridden: string[] = [];

/**
 * Replaces a `window` property for one test. jsdom keeps `closed` and `opener`
 * where `vi.spyOn(..., "get")` cannot reach them, so the test defines its own.
 *
 * @param key - The `window` property to override.
 * @param value - The value it should report.
 */
function overrideWindow(key: "closed" | "opener", value: unknown): void {
    Object.defineProperty(window, key, { configurable: true, get: () => value });
    overridden.push(key);
}

afterEach(() => {
    vi.restoreAllMocks();
    overridden.splice(0).forEach((key) => {
        Reflect.deleteProperty(window, key);
    });
});

describe("PostInstallPrompt", () => {
    it("stays closed until the app is installed", () => {
        render(<PostInstallPrompt />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens as a named dialog on appinstalled", () => {
        render(<PostInstallPrompt title="Pronto!" />);
        fireAppInstalled();
        expect(screen.getByRole("dialog", { name: "Pronto!" })).toBeInTheDocument();
    });

    it("does not open on beforeinstallprompt alone", () => {
        render(<PostInstallPrompt />);
        const event = Object.assign(new Event("beforeinstallprompt"), {
            prompt: () => Promise.resolve(),
            userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
            platforms: [],
        });
        act(() => {
            window.dispatchEvent(event);
        });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("stays closed for the session after the user continued", () => {
        render(<PostInstallPrompt />);
        fireAppInstalled();
        fireEvent.click(screen.getByRole("button", { name: "Continuar no navegador" }));
        fireAppInstalled();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("continue closes the overlay and reports it", () => {
        const onContinue = vi.fn();
        render(<PostInstallPrompt onContinue={onContinue} />);
        fireAppInstalled();
        fireEvent.click(screen.getByRole("button", { name: "Continuar no navegador" }));
        expect(onContinue).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Escape counts as continuing in the browser", () => {
        const onContinue = vi.fn();
        render(<PostInstallPrompt onContinue={onContinue} />);
        fireAppInstalled();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it("offers to close the tab while the browser allows a script to close it", () => {
        setHistoryLength(1);
        const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
        overrideWindow("closed", true);
        render(<PostInstallPrompt />);
        fireAppInstalled();

        fireEvent.click(screen.getByRole("button", { name: "Fechar esta aba" }));
        expect(close).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("swaps the close button for the instruction when the browser ignores close()", () => {
        setHistoryLength(1);
        vi.spyOn(window, "close").mockImplementation(() => undefined);
        overrideWindow("closed", false);
        render(<PostInstallPrompt closeBlockedMessage="Feche a aba." />);
        fireAppInstalled();

        fireEvent.click(screen.getByRole("button", { name: "Fechar esta aba" }));
        expect(screen.queryByRole("button", { name: "Fechar esta aba" })).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Feche a aba.");
    });

    it("never shows a dead close button in a tab that already navigated", () => {
        setHistoryLength(3);
        render(<PostInstallPrompt />);
        fireAppInstalled();
        expect(screen.queryByRole("button", { name: "Fechar esta aba" })).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Continuar no navegador" })).toBeInTheDocument();
    });

    it("offers close in a tab opened by script even after it navigated", () => {
        setHistoryLength(4);
        overrideWindow("opener", {});
        render(<PostInstallPrompt />);
        fireAppInstalled();
        expect(screen.getByRole("button", { name: "Fechar esta aba" })).toBeInTheDocument();
    });
});
