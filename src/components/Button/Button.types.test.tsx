import { createRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

/**
 * Compile-time contract of the per-mode props. `tsc -b` checks this file, so every
 * `@ts-expect-error` below fails the typecheck the day the union lets that call through.
 */
describe("Button — per-mode prop types", () => {
    it("rejects the props that belong to the other element", () => {
        const buttonRef = createRef<HTMLButtonElement>();
        const anchorRef = createRef<HTMLAnchorElement>();
        const ui = (
            <>
                {/* @ts-expect-error — `type` is a <button> attribute, not a link one. */}
                <Button href="/x" type="submit">
                    x
                </Button>
                {/* @ts-expect-error — a link's ref is an HTMLAnchorElement. */}
                <Button href="/x" ref={buttonRef}>
                    x
                </Button>
                {/* @ts-expect-error — a <button>'s ref is an HTMLButtonElement. */}
                <Button ref={anchorRef}>x</Button>
                {/* @ts-expect-error — `asChild` is not a Button prop; ButtonSlot is the component. */}
                <Button asChild>x</Button>
                <Button type="submit" ref={buttonRef}>
                    x
                </Button>
                <Button href="/x" target="_blank" download ref={anchorRef}>
                    x
                </Button>
            </>
        );
        const { container } = render(ui);
        expect(container.querySelectorAll("a, button").length).toBe(6);
    });
});
