import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Popover } from "@/components/Popover";
import { registerPortalLayer } from "./tab-sequence";
import { useFocusTrap } from "./use-focus-trap";

/**
 * A trapped container whose trap can be switched on and off.
 *
 * @param props - The content and whether the trap is armed.
 * @returns The container.
 */
function Trapped({ children, active = true }: { children: ReactNode; active?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref, active);
    return (
        <div ref={ref} tabIndex={-1} data-testid="trap">
            {children}
        </div>
    );
}

/**
 * The name of the focused element, for sequences that read like the page.
 *
 * @returns Its accessible label, placeholder or text.
 */
function focused(): string {
    const el = document.activeElement as HTMLElement;
    return el.getAttribute("aria-label") ?? el.textContent ?? el.tagName;
}

const unregisters: Array<() => void> = [];

afterEach(() => {
    unregisters.splice(0).forEach((unregister) => unregister());
});

describe("useFocusTrap — opener and activation", () => {
    it("returns focus to the opener even when an autoFocus child took focus first", () => {
        function Palette() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>opener</button>
                    <Trapped active={open}>
                        {open && (
                            <>
                                <input aria-label="search" autoFocus />
                                <button onClick={() => setOpen(false)}>close</button>
                            </>
                        )}
                    </Trapped>
                </>
            );
        }
        render(<Palette />);
        const opener = screen.getByText("opener");
        opener.focus();
        fireEvent.click(opener);
        expect(focused()).toBe("search");
        fireEvent.click(screen.getByText("close"));
        expect(document.activeElement).toBe(opener);
    });

    it("leaves focus where content already put it inside the container", () => {
        render(
            <Trapped>
                <button>first</button>
                <input aria-label="second" autoFocus />
            </Trapped>,
        );
        expect(focused()).toBe("second");
    });

    it("focuses the container itself when it has no tab stop", () => {
        render(
            <Trapped>
                <p>only text</p>
            </Trapped>,
        );
        expect(document.activeElement).toBe(screen.getByTestId("trap"));
    });

    it("skips restoring an opener that left the document", () => {
        const { rerender } = render(
            <>
                <button>gone</button>
                <Trapped active={false}>
                    <button>inside</button>
                </Trapped>
            </>,
        );
        screen.getByText("gone").focus();
        rerender(
            <>
                <button>gone</button>
                <Trapped>
                    <button>inside</button>
                </Trapped>
            </>,
        );
        rerender(
            <Trapped active={false}>
                <button>inside</button>
            </Trapped>,
        );
        expect(focused()).toBe("inside");
    });
});

describe("useFocusTrap — Tab never leaves", () => {
    it("pulls a forward Tab from outside back to the first stop", async () => {
        render(
            <>
                <button>outside</button>
                <Trapped>
                    <button>first</button>
                    <button>last</button>
                </Trapped>
            </>,
        );
        screen.getByText("outside").focus();
        await userEvent.tab();
        expect(focused()).toBe("first");
    });

    it("cycles a real Tab walk through every stop and back", async () => {
        render(
            <>
                <button>before</button>
                <Trapped>
                    <button>a</button>
                    <button>b</button>
                </Trapped>
                <button>after</button>
            </>,
        );
        const walk: string[] = [focused()];
        for (let step = 0; step < 4; step += 1) {
            await userEvent.tab();
            walk.push(focused());
        }
        for (let step = 0; step < 3; step += 1) {
            await userEvent.tab({ shift: true });
            walk.push(focused());
        }
        expect(walk).toEqual(["a", "b", "a", "b", "a", "b", "a", "b"]);
    });

    it("wraps Shift+Tab from the focused container to the last stop", () => {
        render(
            <Trapped>
                <p>text</p>
                <button tabIndex={-1}>not a stop</button>
            </Trapped>,
        );
        const trap = screen.getByTestId("trap");
        const late = document.createElement("button");
        late.textContent = "late";
        trap.append(late);
        trap.focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(focused()).toBe("late");
    });
});

describe("useFocusTrap — stacked traps", () => {
    it("lets only the top trap move focus, then hands focus back to its opener", () => {
        function Stack() {
            const [inner, setInner] = useState(false);
            return (
                <Trapped>
                    <button onClick={() => setInner(true)}>open inner</button>
                    <button>outer last</button>
                    {inner && (
                        <Trapped>
                            <button>inner a</button>
                            <button onClick={() => setInner(false)}>inner b</button>
                        </Trapped>
                    )}
                </Trapped>
            );
        }
        render(<Stack />);
        const opener = screen.getByText("open inner");
        opener.focus();
        fireEvent.click(opener);
        expect(focused()).toBe("inner a");

        screen.getByText("inner b").focus();
        fireEvent.keyDown(document, { key: "Tab" });
        expect(focused()).toBe("inner a");
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(focused()).toBe("inner b");

        fireEvent.click(screen.getByText("inner b"));
        expect(document.activeElement).toBe(opener);
    });
});

describe("useFocusTrap — portalled panels opened inside", () => {
    /**
     * A container whose trigger is its last stop, and a panel mounted at the end
     * of `body`, registered as belonging to that trigger.
     *
     * @param withFollower - Whether the page has a tab stop after the panel's
     * trap, which is where the portal bridge would send the last panel stop.
     * @returns The panel's two stops.
     */
    function mountLastAnchor(withFollower: boolean): { p1: HTMLElement; p2: HTMLElement } {
        render(
            <Trapped>
                <button>first</button>
                <span data-testid="anchor">
                    <button>trigger</button>
                </span>
            </Trapped>,
        );
        const panel = document.createElement("div");
        const p1 = document.createElement("button");
        p1.textContent = "p1";
        const p2 = document.createElement("button");
        p2.textContent = "p2";
        panel.append(p1, p2);
        document.body.append(panel);
        if (withFollower) {
            const follower = document.createElement("button");
            follower.textContent = "follower";
            document.body.append(follower);
        }
        unregisters.push(registerPortalLayer({ anchor: screen.getByTestId("anchor"), panel }));
        return { p1, p2 };
    }

    it("leaves Shift+Tab in the middle of the panel to the browser", () => {
        const { p2 } = mountLastAnchor(false);
        p2.focus();
        const event = new KeyboardEvent("keydown", {
            key: "Tab",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        p2.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(focused()).toBe("p2");
    });

    it("wraps Tab from the last panel stop to the first stop of the container", () => {
        const { p2 } = mountLastAnchor(false);
        p2.focus();
        fireEvent.keyDown(p2, { key: "Tab" });
        expect(focused()).toBe("first");
    });

    it("wraps Shift+Tab from the first stop to the last stop of the panel", () => {
        mountLastAnchor(false);
        screen.getByText("first").focus();
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(focused()).toBe("p2");
    });

    it("brings back a Tab another layer consumed and moved out of the trap", () => {
        const { p2 } = mountLastAnchor(true);
        p2.focus();
        const follower = screen.getByText("follower");
        const bridge = (event: KeyboardEvent): void => {
            event.preventDefault();
            follower.focus();
        };
        document.addEventListener("keydown", bridge, true);
        fireEvent.keyDown(p2, { key: "Tab" });
        document.removeEventListener("keydown", bridge, true);
        expect(focused()).toBe("first");
    });

    it("keeps a consumed Tab that stayed inside where the other layer put it", () => {
        const { p1 } = mountLastAnchor(false);
        const trigger = screen.getByText("trigger");
        trigger.focus();
        const bridge = (event: KeyboardEvent): void => {
            event.preventDefault();
            p1.focus();
        };
        document.addEventListener("keydown", bridge, true);
        fireEvent.keyDown(trigger, { key: "Tab" });
        document.removeEventListener("keydown", bridge, true);
        expect(focused()).toBe("p1");
    });

    it("reaches a Popover panel inside a Modal and cycles back, with real Tab presses", async () => {
        const user = userEvent.setup();
        function Screen() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>opener</button>
                    <Modal open={open} onClose={() => setOpen(false)} title="Filtros">
                        <Popover trigger={<Button>Período</Button>}>
                            <input aria-label="De" />
                            <input aria-label="Até" />
                        </Popover>
                    </Modal>
                </>
            );
        }
        render(<Screen />);
        await user.click(screen.getByText("opener"));
        expect(focused()).toBe("Fechar");

        await user.tab();
        expect(focused()).toBe("Período");
        await act(async () => {
            await user.keyboard("{Enter}");
        });
        const walk: string[] = [];
        for (let step = 0; step < 4; step += 1) {
            await user.tab();
            walk.push(focused());
        }
        for (let step = 0; step < 4; step += 1) {
            await user.tab({ shift: true });
            walk.push(focused());
        }
        expect(walk).toEqual(["De", "Até", "Fechar", "Período", "Fechar", "Até", "De", "Período"]);
    });
});
