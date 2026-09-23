import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox } from "../Combobox";
import { ContextMenu } from "../ContextMenu";
import { Drawer } from "../Drawer";
import { DropdownMenu } from "../DropdownMenu";
import { Modal } from "../Modal";
import { MultiSelect } from "../MultiSelect";
import { Popover } from "../Popover";
import { Tooltip } from "../Tooltip";
import { useEscapeLayer } from "./escape-layer";

const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
];

/**
 * Press `Escape` on the focused element, inside `act` so React applies the result.
 *
 * @param init - Extra event fields, such as `isComposing`.
 * @returns Whether the event was consumed (`preventDefault()` called).
 */
function pressEscape(init: KeyboardEventInit = {}): boolean {
    return !fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
        ...init,
    });
}

function outerOpen(): boolean {
    return screen.queryByRole("dialog", { name: "Outer" }) !== null;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Escape layers", () => {
    it("closes a nested modal first and the outer one on the next press", async () => {
        function Nested() {
            const [inner, setInner] = useState(false);
            return (
                <Modal open onClose={vi.fn()} title="Outer">
                    <button type="button" onClick={() => setInner(true)}>
                        nested
                    </button>
                    <Modal open={inner} onClose={() => setInner(false)} title="Inner">
                        inner body
                    </Modal>
                </Modal>
            );
        }
        const onOuterClose = vi.fn();
        const { rerender } = render(<Nested />);
        await userEvent.click(screen.getByText("nested"));
        expect(screen.getByText("inner body")).toBeInTheDocument();
        pressEscape();
        expect(screen.queryByText("inner body")).not.toBeInTheDocument();
        rerender(
            <Modal open onClose={onOuterClose} title="Outer">
                x
            </Modal>,
        );
        pressEscape();
        expect(onOuterClose).toHaveBeenCalledTimes(1);
    });

    it("lets a modal with closeOnEsc off swallow the key instead of leaking it below", () => {
        const onOuterClose = vi.fn();
        const onInnerClose = vi.fn();
        render(
            <Modal open onClose={onOuterClose} title="Outer">
                <Modal open onClose={onInnerClose} closeOnEsc={false} title="Inner">
                    locked
                </Modal>
            </Modal>,
        );
        pressEscape();
        expect(onInnerClose).not.toHaveBeenCalled();
        expect(onOuterClose).not.toHaveBeenCalled();
    });

    it("leaves a modal open when a menu inside it consumed the key", async () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="Outer">
                <DropdownMenu
                    trigger={<button type="button">menu</button>}
                    items={[{ type: "item", id: "a", label: "A", onSelect: vi.fn() }]}
                />
            </Modal>,
        );
        await userEvent.click(screen.getByText("menu"));
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("closes a combobox list first and the modal only once the list is closed", async () => {
        const onClose = vi.fn();
        function Field() {
            const [value, setValue] = useState("");
            return <Combobox options={options} value={value} onChange={setValue} label="Combo" />;
        }
        render(
            <Modal open onClose={onClose} title="Outer">
                <Field />
            </Modal>,
        );
        await userEvent.click(screen.getByRole("combobox", { name: "Combo" }));
        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByRole("listbox")).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
        await userEvent.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes a multiselect list without closing the modal", async () => {
        const onClose = vi.fn();
        function Field() {
            const [value, setValue] = useState<string[]>([]);
            return (
                <MultiSelect options={options} value={value} onChange={setValue} label="Multi" />
            );
        }
        render(
            <Modal open onClose={onClose} title="Outer">
                <Field />
            </Modal>,
        );
        await userEvent.click(screen.getByRole("combobox"));
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard("{Escape}");
        expect(onClose).not.toHaveBeenCalled();
    });

    it("closes a popover opened in a modal without closing the modal", async () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="Outer">
                <Popover trigger={<button type="button">pop</button>}>panel</Popover>
            </Modal>,
        );
        await userEvent.click(screen.getByText("pop"));
        pressEscape();
        expect(screen.queryByText("panel")).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
        expect(outerOpen()).toBe(true);
    });

    it("closes a popover opened in a drawer without closing the drawer", async () => {
        const onClose = vi.fn();
        render(
            <Drawer open onClose={onClose} title="Drawer">
                <Popover trigger={<button type="button">pop</button>}>panel</Popover>
            </Drawer>,
        );
        await userEvent.click(screen.getByText("pop"));
        pressEscape();
        expect(screen.queryByText("panel")).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("closes a context menu opened in a modal without closing the modal", () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="Outer">
                <ContextMenu items={[{ label: "Copy", onSelect: vi.fn() }]}>
                    <div>target</div>
                </ContextMenu>
            </Modal>,
        );
        fireEvent.contextMenu(screen.getByText("target"));
        expect(screen.getByRole("menu")).toBeInTheDocument();
        pressEscape();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("hides a tooltip on Escape before the modal behind it", async () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="Outer">
                <Tooltip content="hint" openDelay={0}>
                    <button type="button">btn</button>
                </Tooltip>
            </Modal>,
        );
        fireEvent.mouseEnter(screen.getByText("btn"));
        expect(await screen.findByRole("tooltip")).toBeInTheDocument();
        pressEscape();
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
        pressEscape();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("ignores an Escape that belongs to an IME composition", () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="Outer">
                x
            </Modal>,
        );
        pressEscape({ isComposing: true });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("ignores an Escape another handler already consumed", () => {
        const onClose = vi.fn();
        render(
            <Modal open onClose={onClose} title="Outer">
                <input aria-label="field" onKeyDown={(event) => event.preventDefault()} />
            </Modal>,
        );
        screen.getByLabelText("field").focus();
        pressEscape();
        expect(onClose).not.toHaveBeenCalled();
    });

    it("marks the key it handled as consumed", () => {
        render(
            <Modal open onClose={vi.fn()} title="Outer">
                x
            </Modal>,
        );
        expect(pressEscape()).toBe(true);
    });

    it("calls the latest callback without re-registering the layer", () => {
        const first = vi.fn();
        const second = vi.fn();
        function Layer({ onEscape }: { onEscape: () => void }) {
            useEscapeLayer(true, onEscape);
            return null;
        }
        const { rerender } = render(<Layer onEscape={first} />);
        rerender(<Layer onEscape={second} />);
        pressEscape();
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("removes the window listener once the last layer closes", () => {
        const remove = vi.spyOn(window, "removeEventListener");
        function Layer() {
            useEscapeLayer(true, vi.fn());
            return null;
        }
        const { unmount } = render(<Layer />);
        unmount();
        expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
        expect(pressEscape()).toBe(false);
    });
});
