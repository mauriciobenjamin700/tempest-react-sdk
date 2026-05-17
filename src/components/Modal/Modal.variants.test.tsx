import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal — new sizes + fullscreen", () => {
    const sizes = ["sm", "md", "lg", "xl", "2xl", "3xl"] as const;

    it.each(sizes)("renders size=%s", (size) => {
        render(
            <Modal open size={size} onClose={vi.fn()}>
                body
            </Modal>,
        );
        const dialog = screen.getByRole("dialog");
        if (size === "2xl") {
            expect(dialog.className).toContain("size2xl");
        } else if (size === "3xl") {
            expect(dialog.className).toContain("size3xl");
        } else {
            expect(dialog.className).toContain(size);
        }
    });

    it("fullscreen adds class", () => {
        render(
            <Modal open fullscreen onClose={vi.fn()}>
                x
            </Modal>,
        );
        expect(screen.getByRole("dialog").className).toContain("fullscreen");
    });

    it("fullscreenOnMobile adds class", () => {
        render(
            <Modal open fullscreenOnMobile onClose={vi.fn()}>
                x
            </Modal>,
        );
        expect(screen.getByRole("dialog").className).toContain("fullscreenOnMobile");
    });
});
