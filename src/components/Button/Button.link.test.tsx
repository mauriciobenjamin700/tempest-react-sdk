import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { resolveLinkRel } from "./link-rel";

/**
 * Dispatch a mouse event and report whether the app cancelled it.
 *
 * A listener on `document` runs after React's root listener, so it reads the
 * verdict of every handler in the tree, records it, and only then cancels the
 * event itself — otherwise jsdom tries the navigation and logs "Not implemented".
 */
function appPrevented(target: Element, type: "click" | "auxclick", init: MouseEventInit): boolean {
    let prevented = false;
    function record(event: Event): void {
        prevented = event.defaultPrevented;
        event.preventDefault();
    }
    document.addEventListener(type, record);
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
    document.removeEventListener(type, record);
    return prevented;
}

describe("Button href — renders a real link", () => {
    it("is an <a> in the DOM, not a button inside a link", () => {
        const { container } = render(<Button href="/planos">Ver planos</Button>);
        const link = screen.getByRole("link", { name: "Ver planos" });
        expect(link.tagName).toBe("A");
        expect(link).toHaveAttribute("href", "/planos");
        expect(container.querySelector("button")).toBeNull();
    });

    it("carries the same variant, size and modifier classes as the <button>", () => {
        const { container } = render(
            <>
                <Button variant="outline" size="lg" pill fullWidth>
                    a
                </Button>
                <Button href="/x" variant="outline" size="lg" pill fullWidth>
                    a
                </Button>
            </>,
        );
        const button = container.querySelector("button");
        const link = container.querySelector("a");
        expect(link?.className).toBe(button?.className);
    });

    it("renders the icons and label in the same content row", () => {
        render(
            <Button
                href="/x"
                leftIcon={<i data-testid="left" />}
                rightIcon={<i data-testid="right" />}
            >
                Go
            </Button>,
        );
        const link = screen.getByRole("link", { name: "Go" });
        expect(link).toContainElement(screen.getByTestId("left"));
        expect(link).toContainElement(screen.getByTestId("right"));
    });

    it("forwards a ref typed as HTMLAnchorElement", () => {
        const ref = createRef<HTMLAnchorElement>();
        render(
            <Button href="/x" ref={ref}>
                Go
            </Button>,
        );
        expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
    });

    it("forwards a ref typed as HTMLButtonElement in the default mode", () => {
        const ref = createRef<HTMLButtonElement>();
        render(<Button ref={ref}>Go</Button>);
        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it("runs the consumer's onClick on an active link", async () => {
        const onClick = vi.fn();
        render(
            <Button href="/x" onClick={onClick}>
                Go
            </Button>,
        );
        appPrevented(screen.getByRole("link"), "click", { button: 0 });
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("does not block middle-click or Ctrl+click on an active link", () => {
        render(<Button href="/x">Go</Button>);
        const link = screen.getByRole("link");
        expect(appPrevented(link, "click", { button: 1 })).toBe(false);
        expect(appPrevented(link, "auxclick", { button: 1 })).toBe(false);
        expect(appPrevented(link, "click", { ctrlKey: true })).toBe(false);
    });
});

describe("Button href — target and rel", () => {
    it("adds noopener noreferrer to target=_blank without the consumer writing it", () => {
        render(
            <Button href="https://wa.me/55" target="_blank">
                WhatsApp
            </Button>,
        );
        const link = screen.getByRole("link");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("keeps the consumer's rel tokens and adds only the missing ones", () => {
        render(
            <Button href="https://x.dev" target="_blank" rel="external NoOpener">
                X
            </Button>,
        );
        expect(screen.getByRole("link")).toHaveAttribute("rel", "external NoOpener noreferrer");
    });

    it("leaves rel alone when the link opens in the same tab", () => {
        render(
            <Button href="/x" rel="next">
                X
            </Button>,
        );
        expect(screen.getByRole("link")).toHaveAttribute("rel", "next");
    });

    it("resolveLinkRel never duplicates a token", () => {
        expect(resolveLinkRel("_blank", "noopener noreferrer")).toBe("noopener noreferrer");
        expect(resolveLinkRel("_blank", undefined)).toBe("noopener noreferrer");
        expect(resolveLinkRel("_self", undefined)).toBeUndefined();
    });
});

describe("Button href — disabled and loading links", () => {
    it.each([
        ["disabled", { disabled: true }],
        ["loading", { loading: true }],
    ] as const)("a %s link has no navigable href and is announced as disabled", (_, state) => {
        render(
            <Button href="/x" {...state}>
                Go
            </Button>,
        );
        const link = screen.getByRole("link", { name: "Go" });
        expect(link).not.toHaveAttribute("href");
        expect(link).toHaveAttribute("aria-disabled", "true");
        expect(link).toHaveAttribute("tabindex", "-1");
    });

    it("a disabled link does not run the consumer's onClick and cancels the click", () => {
        const onClick = vi.fn();
        render(
            <Button href="/x" disabled onClick={onClick}>
                Go
            </Button>,
        );
        const link = screen.getByRole("link");
        expect(appPrevented(link, "click", { button: 0 })).toBe(true);
        expect(appPrevented(link, "auxclick", { button: 1 })).toBe(true);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("a disabled link is out of the tab order", async () => {
        render(
            <>
                <Button href="/x" disabled>
                    Off
                </Button>
                <Button href="/y">On</Button>
            </>,
        );
        await userEvent.tab();
        expect(screen.getByRole("link", { name: "On" })).toHaveFocus();
    });

    it("a loading link announces aria-busy", () => {
        render(
            <Button href="/x" loading>
                Go
            </Button>,
        );
        expect(screen.getByRole("link")).toHaveAttribute("aria-busy", "true");
    });
});
