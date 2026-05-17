import { render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Show, Hide } from "./Responsive";

function setWindowWidth(width: number): void {
    Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: width,
    });
}

function resize(width: number): void {
    setWindowWidth(width);
    act(() => {
        window.dispatchEvent(new Event("resize"));
    });
}

describe("Responsive Show/Hide", () => {
    beforeEach(() => {
        setWindowWidth(1024);
    });

    it("Show.above renders when viewport >= breakpoint", () => {
        setWindowWidth(900);
        render(<Show above="md">desktop</Show>);
        expect(screen.getByText("desktop")).toBeInTheDocument();
    });

    it("Show.above hides when viewport < breakpoint", () => {
        setWindowWidth(500);
        const { queryByText } = render(<Show above="md">desktop</Show>);
        expect(queryByText("desktop")).not.toBeInTheDocument();
    });

    it("Show.below renders only below breakpoint", () => {
        setWindowWidth(500);
        const { queryByText, rerender } = render(<Show below="md">mobile</Show>);
        expect(queryByText("mobile")).toBeInTheDocument();
        resize(900);
        rerender(<Show below="md">mobile</Show>);
        expect(queryByText("mobile")).not.toBeInTheDocument();
    });

    it("Show.only restricts to listed breakpoints", () => {
        setWindowWidth(800);
        const { queryByText } = render(<Show only={["md", "lg"]}>tablet+</Show>);
        expect(queryByText("tablet+")).toBeInTheDocument();
    });

    it("Hide is inverse of Show", () => {
        setWindowWidth(500);
        const { queryByText } = render(<Hide above="md">x</Hide>);
        expect(queryByText("x")).toBeInTheDocument();
    });
});
