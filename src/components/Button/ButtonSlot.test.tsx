import { createRef } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, NavLink, Route, Routes, Link, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ButtonSlot } from "./ButtonSlot";

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

/** Let a navigation the router may have scheduled run before asserting it did not. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
}

function CurrentPath() {
    const location = useLocation();
    return <output data-testid="path">{location.pathname}</output>;
}

function renderInRouter(ui: React.ReactNode) {
    return render(
        <MemoryRouter initialEntries={["/"]}>
            {ui}
            <Routes>
                <Route path="*" element={<CurrentPath />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("ButtonSlot — react-router Link", () => {
    it("navigates the route without a document reload", async () => {
        renderInRouter(
            <ButtonSlot variant="outline">
                <Link to="/planos">Ver planos</Link>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link", { name: "Ver planos" });
        expect(link).toHaveAttribute("href", "/planos");
        expect(appPrevented(link, "click", { button: 0 })).toBe(true);
        await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/planos"));
    });

    it("renders the Link's own <a> with the button classes — no wrapper element", () => {
        const { container } = renderInRouter(
            <ButtonSlot variant="soft" size="sm">
                <Link to="/x" className="mine">
                    X
                </Link>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link");
        expect(container.querySelector("button")).toBeNull();
        expect(link.className).toContain("soft");
        expect(link.className).toContain("sm");
        expect(link.className).toContain("mine");
    });

    it("leaves middle-click and Ctrl+click to the browser on an active Link", async () => {
        renderInRouter(
            <ButtonSlot>
                <Link to="/x">X</Link>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link");
        expect(appPrevented(link, "click", { button: 1 })).toBe(false);
        expect(appPrevented(link, "click", { button: 0, ctrlKey: true })).toBe(false);
        await settle();
        expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
    });

    it("a disabled ButtonSlot does not let the Link navigate", async () => {
        const onLinkClick = vi.fn();
        renderInRouter(
            <ButtonSlot disabled>
                <Link to="/x" onClick={onLinkClick}>
                    X
                </Link>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link");
        expect(link).toHaveAttribute("aria-disabled", "true");
        expect(link).toHaveAttribute("tabindex", "-1");
        await userEvent.click(link);
        await settle();
        expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
        expect(onLinkClick).not.toHaveBeenCalled();
        expect(appPrevented(link, "auxclick", { button: 1 })).toBe(true);
    });

    it("keeps a NavLink's function className working, with the button classes added", () => {
        renderInRouter(
            <ButtonSlot variant="ghost">
                <NavLink to="/" className={({ isActive }) => (isActive ? "is-active" : "idle")}>
                    Home
                </NavLink>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link");
        expect(link.className).toContain("ghost");
        expect(link.className).toContain("is-active");
    });

    it("runs both the ButtonSlot's and the child's onClick on an active Link", async () => {
        const onButtonClick = vi.fn();
        const onLinkClick = vi.fn();
        renderInRouter(
            <ButtonSlot onClick={onButtonClick}>
                <Link to="/x" onClick={onLinkClick}>
                    X
                </Link>
            </ButtonSlot>,
        );
        await userEvent.click(screen.getByRole("link"));
        expect(onButtonClick).toHaveBeenCalledOnce();
        expect(onLinkClick).toHaveBeenCalledOnce();
        await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/x"));
    });
});

describe("ButtonSlot — any element", () => {
    it("gives the child's ref and the forwarded ref the same node", () => {
        const outer = createRef<HTMLElement>();
        const inner = createRef<HTMLAnchorElement>();
        render(
            <ButtonSlot ref={outer}>
                <a href="/x" ref={inner}>
                    X
                </a>
            </ButtonSlot>,
        );
        expect(outer.current).toBeInstanceOf(HTMLAnchorElement);
        expect(inner.current).toBe(outer.current);
    });

    it("adds noopener noreferrer when the child opens a new tab", () => {
        render(
            <ButtonSlot>
                <a href="https://x.dev" target="_blank" rel="external">
                    X
                </a>
            </ButtonSlot>,
        );
        expect(screen.getByRole("link")).toHaveAttribute("rel", "external noopener noreferrer");
    });

    it("strips the href of a disabled plain <a> child and keeps it announced as a link", () => {
        render(
            <ButtonSlot loading>
                <a href="/x">X</a>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link");
        expect(link).not.toHaveAttribute("href");
        expect(link).toHaveAttribute("aria-disabled", "true");
        expect(link).toHaveAttribute("aria-busy", "true");
    });

    it("renders the icons around the child's own label", () => {
        render(
            <ButtonSlot leftIcon={<i data-testid="left" />}>
                <a href="/x">Label</a>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link", { name: "Label" });
        expect(link).toContainElement(screen.getByTestId("left"));
    });

    it("merges style objects with ButtonSlot's keys winning", () => {
        render(
            <ButtonSlot style={{ color: "red" }}>
                <a href="/x" style={{ color: "blue", margin: 4 }}>
                    X
                </a>
            </ButtonSlot>,
        );
        const link = screen.getByRole("link");
        expect(link.style.color).toBe("red");
        expect(link.style.margin).toBe("4px");
    });

    it("throws a clear error when the child is not a single element", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(() =>
            render(
                // @ts-expect-error — ButtonSlot requires a single React element child.
                <ButtonSlot>text</ButtonSlot>,
            ),
        ).toThrow(/ButtonSlot expects exactly one React element/);
        spy.mockRestore();
    });
});
