import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "../Modal/Modal";
import { Portal } from "./Portal";

/**
 * Pretend an element is presented fullscreen.
 *
 * jsdom implements neither `requestFullscreen` nor `fullscreenElement`, so the
 * property is defined by hand and the event dispatched the way the browser
 * would. That is enough for what these tests check — which host the portal
 * picks — while `e2e/fullscreen.spec.ts` covers the part only a real browser can
 * answer: that the overlay is actually painted and clickable.
 *
 * @param element - The element to present, or `null` to leave fullscreen.
 * @returns Nothing.
 */
function setFullscreenElement(element: Element | null): void {
    Object.defineProperty(document, "fullscreenElement", {
        value: element,
        configurable: true,
        writable: true,
    });
    act(() => {
        document.dispatchEvent(new Event("fullscreenchange"));
    });
}

describe("portal host follows fullscreen", () => {
    afterEach(() => {
        setFullscreenElement(null);
    });

    it("mounts into document.body when no element is fullscreen", () => {
        render(
            <Portal>
                <span>conteúdo</span>
            </Portal>,
        );
        expect(screen.getByText("conteúdo").parentElement).toBe(document.body);
    });

    it("mounts into the fullscreen element while one is presented", () => {
        const stage = document.createElement("div");
        document.body.append(stage);
        setFullscreenElement(stage);

        render(
            <Portal>
                <span>conteúdo</span>
            </Portal>,
        );

        expect(stage.contains(screen.getByText("conteúdo"))).toBe(true);
        stage.remove();
    });

    it("moves an already-open dialog when the page enters fullscreen", () => {
        const stage = document.createElement("div");
        document.body.append(stage);

        render(
            <Modal open onClose={() => {}} title="Áudio e vídeo">
                corpo
            </Modal>,
        );
        expect(stage.contains(screen.getByRole("dialog"))).toBe(false);

        setFullscreenElement(stage);

        expect(stage.contains(screen.getByRole("dialog"))).toBe(true);
        stage.remove();
    });

    it("moves it back when fullscreen ends", () => {
        const stage = document.createElement("div");
        document.body.append(stage);
        setFullscreenElement(stage);

        render(
            <Modal open onClose={() => {}} title="Áudio e vídeo">
                corpo
            </Modal>,
        );
        expect(stage.contains(screen.getByRole("dialog"))).toBe(true);

        setFullscreenElement(null);

        expect(stage.contains(screen.queryByRole("dialog"))).toBe(false);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        stage.remove();
    });

    it("honours an explicit container instead of the fullscreen element", () => {
        const stage = document.createElement("div");
        const pinned = document.createElement("div");
        document.body.append(stage, pinned);
        setFullscreenElement(stage);

        render(
            <Portal container={pinned}>
                <span>conteúdo</span>
            </Portal>,
        );

        expect(pinned.contains(screen.getByText("conteúdo"))).toBe(true);
        stage.remove();
        pinned.remove();
    });
});
