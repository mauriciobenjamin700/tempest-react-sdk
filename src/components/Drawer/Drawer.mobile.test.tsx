import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Drawer } from "./Drawer";

function setWidth(width: number): void {
    Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: width,
    });
}

describe("Drawer — mobile placement + handle", () => {
    beforeEach(() => setWidth(1024));

    it("uses placement prop on desktop", () => {
        setWidth(1200);
        render(
            <Drawer open onClose={vi.fn()} placement="right" mobilePlacement="bottom">
                x
            </Drawer>,
        );
        expect(screen.getByRole("dialog").className).toContain("right");
    });

    it("switches to mobilePlacement on mobile", () => {
        setWidth(500);
        render(
            <Drawer open onClose={vi.fn()} placement="right" mobilePlacement="bottom">
                x
            </Drawer>,
        );
        expect(screen.getByRole("dialog").className).toContain("bottom");
    });

    it("showHandle renders handle in bottom placement", () => {
        render(
            <Drawer open onClose={vi.fn()} placement="bottom" showHandle>
                x
            </Drawer>,
        );
        const handles = document.body.querySelectorAll("[aria-hidden]");
        expect(handles.length).toBeGreaterThan(0);
    });
});
