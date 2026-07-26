import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { moveItem, useSortable } from "./use-sortable";

const ROW_HEIGHT = 40;

/**
 * jsdom gives every element a zero-sized rect, so hit-testing would never match.
 * Faking rects by row index is what lets the pointer path be exercised at all —
 * and it mirrors the real geometry the hook reads (`[data-sortable-index]` rects).
 */
function stubRects(): void {
    Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
        const index = Number((this as HTMLElement).dataset?.sortableIndex ?? NaN);
        if (Number.isNaN(index)) {
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
        }
        return {
            top: index * ROW_HEIGHT,
            bottom: index * ROW_HEIGHT + ROW_HEIGHT,
            left: 0,
            right: 200,
            width: 200,
            height: ROW_HEIGHT,
        } as DOMRect;
    };
}

/** Viewport point inside the row at `index`. */
function pointOf(index: number): { clientX: number; clientY: number } {
    return { clientX: 100, clientY: index * ROW_HEIGHT + ROW_HEIGHT / 2 };
}

function List({
    initial = ["Alfa", "Bravo", "Charlie"],
    disabled = false,
    onReorder,
}: {
    initial?: string[];
    disabled?: boolean;
    onReorder?: (from: number, to: number) => void;
}) {
    const [items, setItems] = useState(initial);
    const sortable = useSortable({
        itemCount: items.length,
        disabled,
        roleDescription: "Item reordenável",
        onReorder: ({ from, to }) => {
            onReorder?.(from, to);
            setItems((current) => moveItem(current, from, to));
        },
    });

    return (
        <>
            <ul {...sortable.getListProps()} aria-label="Prioridade" ref={sortable.setContainer}>
                {items.map((item, index) => (
                    <li key={item} {...sortable.getItemProps(index)}>
                        {item}
                    </li>
                ))}
            </ul>
            <output data-testid="ordem">{items.join(",")}</output>
            <output data-testid="estado">{`${sortable.activeIndex}/${sortable.overIndex}`}</output>
            <button onClick={sortable.cancel}>cancelar</button>
        </>
    );
}

beforeEach(() => {
    stubRects();
});

describe("moveItem", () => {
    it("moves an item forward", () => {
        expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    });

    it("moves an item backward", () => {
        expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    });

    it("returns the same array when nothing moves", () => {
        const items = ["a", "b"];
        expect(moveItem(items, 1, 1)).toBe(items);
    });

    it("ignores out-of-range indices", () => {
        const items = ["a", "b"];
        expect(moveItem(items, -1, 1)).toBe(items);
        expect(moveItem(items, 0, 5)).toBe(items);
    });

    it("does not mutate the input", () => {
        const items = ["a", "b", "c"];
        moveItem(items, 0, 2);
        expect(items).toEqual(["a", "b", "c"]);
    });
});

describe("useSortable — pointer", () => {
    it("wires the list and items with listbox semantics", () => {
        render(<List />);

        const list = screen.getByRole("listbox", { name: "Prioridade" });
        expect(list).toHaveAttribute("aria-orientation", "vertical");
        expect(screen.getAllByRole("option")).toHaveLength(3);
        expect(screen.getByText("Alfa")).toHaveAttribute(
            "aria-roledescription",
            "Item reordenável",
        );
    });

    it("reorders on drag and release", () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointOf(2) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(onReorder).toHaveBeenCalledWith(0, 2);
        expect(screen.getByTestId("ordem")).toHaveTextContent("Bravo,Charlie,Alfa");
    });

    it("does not fire while the pointer is still moving", () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointOf(1) });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointOf(2) });

        expect(onReorder).not.toHaveBeenCalled();
        expect(screen.getByTestId("estado")).toHaveTextContent("0/2");
    });

    it("keeps the order when released over the origin", () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        fireEvent.pointerDown(screen.getByText("Bravo"), { pointerId: 1, ...pointOf(1) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(onReorder).not.toHaveBeenCalled();
        expect(screen.getByTestId("ordem")).toHaveTextContent("Alfa,Bravo,Charlie");
    });

    it("ignores a move that lands outside every row", () => {
        render(<List />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerMove(window, { pointerId: 1, clientX: 9999, clientY: 9999 });

        expect(screen.getByTestId("estado")).toHaveTextContent("0/0");
    });

    it("marks the dragged item while it is held", () => {
        render(<List />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });

        expect(screen.getByText("Alfa")).toHaveAttribute("data-sortable-active", "true");
        expect(screen.getByText("Alfa")).toHaveAttribute("aria-selected", "true");
    });

    it("aborts on pointercancel", () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointOf(2) });
        fireEvent.pointerCancel(window, { pointerId: 1 });

        expect(onReorder).not.toHaveBeenCalled();
        expect(screen.getByTestId("estado")).toHaveTextContent("null/null");
    });

    it("aborts on Escape mid-drag", () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointOf(2) });
        fireEvent.keyDown(window, { key: "Escape" });

        expect(onReorder).not.toHaveBeenCalled();
        expect(screen.getByTestId("estado")).toHaveTextContent("null/null");
    });

    it("ignores interaction while disabled", () => {
        const onReorder = vi.fn();
        render(<List disabled onReorder={onReorder} />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(onReorder).not.toHaveBeenCalled();
        expect(screen.getByText("Alfa")).toHaveAttribute("tabindex", "-1");
    });

    it("survives a canvas without pointer capture", () => {
        render(<List />);
        const row = screen.getByText("Alfa") as HTMLElement & { setPointerCapture?: unknown };
        Object.defineProperty(row, "setPointerCapture", { value: undefined, configurable: true });

        fireEvent.pointerDown(row, { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointOf(1) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(screen.getByTestId("ordem")).toHaveTextContent("Bravo,Alfa,Charlie");
    });
});

describe("useSortable — keyboard", () => {
    it("picks up, moves and drops with the keyboard alone", async () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        const row = screen.getByText("Alfa");
        row.focus();
        await userEvent.keyboard(" ");
        expect(screen.getByTestId("estado")).toHaveTextContent("0/0");

        await userEvent.keyboard("{ArrowDown}{ArrowDown}");
        expect(screen.getByTestId("estado")).toHaveTextContent("0/2");

        await userEvent.keyboard(" ");
        expect(onReorder).toHaveBeenCalledWith(0, 2);
        expect(screen.getByTestId("ordem")).toHaveTextContent("Bravo,Charlie,Alfa");
    });

    it("drops with Enter as well", async () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        screen.getByText("Charlie").focus();
        await userEvent.keyboard(" {ArrowUp}{Enter}");

        expect(onReorder).toHaveBeenCalledWith(2, 1);
    });

    it("accepts the horizontal arrows too", async () => {
        render(<List />);

        screen.getByText("Alfa").focus();
        await userEvent.keyboard(" {ArrowRight}");
        expect(screen.getByTestId("estado")).toHaveTextContent("0/1");

        await userEvent.keyboard("{ArrowLeft}");
        expect(screen.getByTestId("estado")).toHaveTextContent("0/0");
    });

    it("clamps at both ends of the list", async () => {
        render(<List />);

        screen.getByText("Alfa").focus();
        await userEvent.keyboard(" {ArrowUp}");
        expect(screen.getByTestId("estado")).toHaveTextContent("0/0");

        await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
        expect(screen.getByTestId("estado")).toHaveTextContent("0/2");
    });

    it("cancels with Escape and leaves the order untouched", async () => {
        const onReorder = vi.fn();
        render(<List onReorder={onReorder} />);

        screen.getByText("Alfa").focus();
        await userEvent.keyboard(" {ArrowDown}{Escape}");

        expect(onReorder).not.toHaveBeenCalled();
        expect(screen.getByTestId("ordem")).toHaveTextContent("Alfa,Bravo,Charlie");
    });

    it("ignores the arrows before an item is picked up", async () => {
        render(<List />);

        screen.getByText("Alfa").focus();
        await userEvent.keyboard("{ArrowDown}");

        expect(screen.getByTestId("estado")).toHaveTextContent("null/null");
    });

    it("ignores Escape when nothing is held", async () => {
        render(<List />);

        screen.getByText("Alfa").focus();
        await userEvent.keyboard("{Escape}");

        expect(screen.getByTestId("estado")).toHaveTextContent("null/null");
    });

    it("ignores unrelated keys", async () => {
        render(<List />);

        screen.getByText("Alfa").focus();
        await userEvent.keyboard("x");

        expect(screen.getByTestId("estado")).toHaveTextContent("null/null");
    });

    it("does nothing while disabled", async () => {
        render(<List disabled />);

        screen.getByText("Alfa").focus();
        await userEvent.keyboard(" {ArrowDown}");

        expect(screen.getByTestId("estado")).toHaveTextContent("null/null");
    });
});

describe("useSortable — lifecycle", () => {
    it("cancels an in-flight drag when the list length changes", () => {
        function Shrinking() {
            const [items, setItems] = useState(["a", "b", "c"]);
            const sortable = useSortable({ itemCount: items.length, onReorder: vi.fn() });
            return (
                <>
                    <ul {...sortable.getListProps()} ref={sortable.setContainer}>
                        {items.map((item, index) => (
                            <li key={item} {...sortable.getItemProps(index)}>
                                {item}
                            </li>
                        ))}
                    </ul>
                    <output data-testid="estado">{`${sortable.activeIndex}`}</output>
                    <button onClick={() => setItems(["a", "b"])}>remover</button>
                </>
            );
        }

        render(<Shrinking />);
        fireEvent.pointerDown(screen.getByText("a"), { pointerId: 1, ...pointOf(0) });
        expect(screen.getByTestId("estado")).toHaveTextContent("0");

        fireEvent.click(screen.getByRole("button", { name: "remover" }));

        expect(screen.getByTestId("estado")).toHaveTextContent("null");
    });

    it("cancels through the returned cancel()", () => {
        render(<List />);

        fireEvent.pointerDown(screen.getByText("Alfa"), { pointerId: 1, ...pointOf(0) });
        fireEvent.click(screen.getByRole("button", { name: "cancelar" }));

        expect(screen.getByTestId("estado")).toHaveTextContent("null/null");
    });

    it("uses the latest onReorder without restarting the drag", () => {
        const first = vi.fn();
        const second = vi.fn();

        function Swapper() {
            const [handler, setHandler] = useState(() => first);
            const sortable = useSortable({ itemCount: 3, onReorder: () => handler() });
            return (
                <>
                    <ul {...sortable.getListProps()} ref={sortable.setContainer}>
                        {[0, 1, 2].map((index) => (
                            <li key={index} {...sortable.getItemProps(index)}>
                                {`row-${index}`}
                            </li>
                        ))}
                    </ul>
                    <button onClick={() => setHandler(() => second)}>trocar handler</button>
                </>
            );
        }

        render(<Swapper />);
        fireEvent.click(screen.getByRole("button", { name: "trocar handler" }));

        fireEvent.pointerDown(screen.getByText("row-0"), { pointerId: 1, ...pointOf(0) });
        fireEvent.pointerMove(window, { pointerId: 1, ...pointOf(1) });
        fireEvent.pointerUp(window, { pointerId: 1 });

        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });
});
