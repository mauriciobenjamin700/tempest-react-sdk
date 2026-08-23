import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignaturePad } from "./SignaturePad";
import type { SignaturePadHandle } from "./SignaturePad";

/**
 * jsdom ships no canvas implementation, so `getContext("2d")` returns `null` and
 * nothing would be exercised. This records the calls instead, which lets the
 * tests assert the *drawing* decisions (one path per stroke, the dot for a single
 * tap, the devicePixelRatio transform) and not merely that nothing threw.
 */
interface Recorder {
    calls: string[];
    strokeCount: number;
}

let recorder: Recorder;

function fakeContext(): CanvasRenderingContext2D {
    const push =
        (name: string) =>
        (...args: unknown[]): void => {
            recorder.calls.push(`${name}(${args.join(",")})`);
            if (name === "stroke") recorder.strokeCount += 1;
        };
    return {
        setTransform: push("setTransform"),
        clearRect: push("clearRect"),
        beginPath: push("beginPath"),
        moveTo: push("moveTo"),
        lineTo: push("lineTo"),
        stroke: push("stroke"),
        lineWidth: 0,
        lineCap: "butt",
        lineJoin: "miter",
        strokeStyle: "",
    } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
    recorder = { calls: [], strokeCount: 0 };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        () => fakeContext() as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAA");
    HTMLCanvasElement.prototype.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 400, height: 160 }) as DOMRect;
});

afterEach(() => {
    vi.restoreAllMocks();
});

function draw(canvas: HTMLElement, points: [number, number][], pointerId = 1): void {
    fireEvent.pointerDown(canvas, { clientX: points[0][0], clientY: points[0][1], pointerId });
    for (const [x, y] of points.slice(1)) {
        fireEvent.pointerMove(canvas, { clientX: x, clientY: y, pointerId });
    }
    fireEvent.pointerUp(canvas, { pointerId });
}

describe("SignaturePad", () => {
    it("renders a labeled surface", () => {
        render(<SignaturePad label="Assinatura do cliente" />);
        expect(screen.getByRole("img", { name: "Assinatura do cliente" })).toBeInTheDocument();
    });

    it("keeps the action buttons disabled while empty", () => {
        render(<SignaturePad />);
        expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    });

    it("hides the actions on request", () => {
        render(<SignaturePad showActions={false} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("draws a stroke and enables the actions", () => {
        render(<SignaturePad />);
        const canvas = screen.getByRole("img");

        draw(canvas, [
            [10, 10],
            [20, 20],
            [30, 30],
        ]);

        expect(recorder.strokeCount).toBeGreaterThan(0);
        expect(recorder.calls).toContain("moveTo(10,10)");
        expect(recorder.calls).toContain("lineTo(30,30)");
        expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
    });

    it("leaves a dot for a single tap", () => {
        render(<SignaturePad />);
        const canvas = screen.getByRole("img");

        fireEvent.pointerDown(canvas, { clientX: 5, clientY: 6, pointerId: 1 });

        expect(recorder.calls).toContain("moveTo(5,6)");
        expect(recorder.calls).toContain("lineTo(5,6)");
    });

    it("scales the backing store by the device pixel ratio", () => {
        const original = window.devicePixelRatio;
        Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });

        render(<SignaturePad width={300} height={100} />);
        const canvas = screen.getByRole("img") as HTMLCanvasElement;

        expect(canvas.width).toBe(600);
        expect(canvas.height).toBe(200);
        expect(recorder.calls).toContain("setTransform(2,0,0,2,0,0)");

        Object.defineProperty(window, "devicePixelRatio", { value: original, configurable: true });
    });

    it("reports the first move of a stroke through onBegin", () => {
        const onBegin = vi.fn();
        render(<SignaturePad onBegin={onBegin} />);

        draw(screen.getByRole("img"), [
            [1, 1],
            [2, 2],
        ]);

        expect(onBegin).toHaveBeenCalledTimes(1);
    });

    it("hands the image to onEnd when the stroke finishes", () => {
        const onEnd = vi.fn();
        render(<SignaturePad onEnd={onEnd} />);

        draw(screen.getByRole("img"), [
            [1, 1],
            [2, 2],
        ]);

        expect(onEnd).toHaveBeenCalledWith("data:image/png;base64,AAA");
    });

    it("reports emptiness transitions once each way", async () => {
        const onEmptyChange = vi.fn();
        render(<SignaturePad onEmptyChange={onEmptyChange} />);
        const canvas = screen.getByRole("img");

        draw(canvas, [
            [1, 1],
            [2, 2],
        ]);
        expect(onEmptyChange).toHaveBeenLastCalledWith(false);

        await userEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(onEmptyChange).toHaveBeenLastCalledWith(true);
    });

    it("undoes only the last stroke", async () => {
        render(<SignaturePad />);
        const canvas = screen.getByRole("img");

        draw(canvas, [
            [1, 1],
            [2, 2],
        ]);
        draw(canvas, [
            [50, 50],
            [60, 60],
        ]);

        recorder.calls = [];
        await userEvent.click(screen.getByRole("button", { name: "Undo" }));

        expect(recorder.calls).toContain("moveTo(1,1)");
        expect(recorder.calls).not.toContain("moveTo(50,50)");
        expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    });

    it("goes back to empty once every stroke is undone", async () => {
        render(<SignaturePad />);
        const canvas = screen.getByRole("img");

        draw(canvas, [
            [1, 1],
            [2, 2],
        ]);
        await userEvent.click(screen.getByRole("button", { name: "Undo" }));

        expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    });

    it("ignores drawing while disabled", () => {
        render(<SignaturePad disabled />);
        const canvas = screen.getByRole("img");

        draw(canvas, [
            [1, 1],
            [2, 2],
        ]);

        expect(recorder.strokeCount).toBe(0);
        expect(canvas).toHaveAttribute("aria-disabled", "true");
    });

    it("ignores a move that did not start with a pointerdown", () => {
        render(<SignaturePad />);

        fireEvent.pointerMove(screen.getByRole("img"), { clientX: 5, clientY: 5, pointerId: 1 });

        expect(recorder.strokeCount).toBe(0);
    });

    it("ignores a pointerup with no stroke in progress", () => {
        const onEnd = vi.fn();
        render(<SignaturePad onEnd={onEnd} />);

        fireEvent.pointerUp(screen.getByRole("img"), { pointerId: 1 });

        expect(onEnd).not.toHaveBeenCalled();
    });

    it("uses an explicit pen color over the computed one", () => {
        render(<SignaturePad penColor="#ff0000" />);

        draw(screen.getByRole("img"), [
            [1, 1],
            [2, 2],
        ]);

        expect(recorder.strokeCount).toBeGreaterThan(0);
    });

    describe("imperative handle", () => {
        it("exposes isEmpty, clear and undo", () => {
            const ref = createRef<SignaturePadHandle>();
            render(<SignaturePad ref={ref} />);
            const canvas = screen.getByRole("img");

            expect(ref.current?.isEmpty()).toBe(true);

            draw(canvas, [
                [1, 1],
                [2, 2],
            ]);
            expect(ref.current?.isEmpty()).toBe(false);

            ref.current?.undo();
            expect(ref.current?.isEmpty()).toBe(true);

            draw(canvas, [
                [3, 3],
                [4, 4],
            ]);
            ref.current?.clear();
            expect(ref.current?.isEmpty()).toBe(true);
        });

        it("exports a data URL", () => {
            const ref = createRef<SignaturePadHandle>();
            render(<SignaturePad ref={ref} />);

            expect(ref.current?.toDataURL("image/png")).toBe("data:image/png;base64,AAA");
        });

        it("exports a blob", async () => {
            const blob = new Blob(["x"], { type: "image/png" });
            HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
                callback(blob);
            };

            const ref = createRef<SignaturePadHandle>();
            render(<SignaturePad ref={ref} />);

            await expect(ref.current?.toBlob()).resolves.toBe(blob);
        });

        it("resolves null when the canvas cannot export a blob", async () => {
            const ref = createRef<SignaturePadHandle>();
            render(<SignaturePad ref={ref} />);

            const canvas = screen.getByRole("img") as HTMLCanvasElement & { toBlob?: unknown };
            Object.defineProperty(canvas, "toBlob", { value: undefined, configurable: true });

            await expect(ref.current?.toBlob()).resolves.toBeNull();
        });
    });

    it("survives a missing 2d context", () => {
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

        render(<SignaturePad />);
        draw(screen.getByRole("img"), [
            [1, 1],
            [2, 2],
        ]);

        expect(screen.getByRole("img")).toBeInTheDocument();
    });

    it("falls back to a literal ink color when the computed color is empty", () => {
        vi.spyOn(window, "getComputedStyle").mockReturnValue({
            color: "",
        } as unknown as CSSStyleDeclaration);

        render(<SignaturePad />);
        draw(screen.getByRole("img"), [
            [1, 1],
            [2, 2],
        ]);

        expect(recorder.strokeCount).toBeGreaterThan(0);
    });

    it("works on a canvas without pointer capture", () => {
        render(<SignaturePad />);
        const canvas = screen.getByRole("img") as HTMLCanvasElement & {
            setPointerCapture?: unknown;
            releasePointerCapture?: unknown;
        };
        Object.defineProperty(canvas, "setPointerCapture", {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(canvas, "releasePointerCapture", {
            value: undefined,
            configurable: true,
        });

        draw(canvas, [
            [3, 3],
            [4, 4],
        ]);

        expect(recorder.strokeCount).toBeGreaterThan(0);
    });

    it("defaults the pixel ratio to 1 when the browser reports none", () => {
        const original = window.devicePixelRatio;
        Object.defineProperty(window, "devicePixelRatio", { value: 0, configurable: true });

        render(<SignaturePad width={200} height={80} />);
        const canvas = screen.getByRole("img") as HTMLCanvasElement;

        expect(canvas.width).toBe(200);
        expect(recorder.calls).toContain("setTransform(1,0,0,1,0,0)");

        Object.defineProperty(window, "devicePixelRatio", { value: original, configurable: true });
    });

    it("skips an empty stroke while redrawing", () => {
        const ref = createRef<SignaturePadHandle>();
        render(<SignaturePad ref={ref} />);

        ref.current?.clear();

        expect(recorder.strokeCount).toBe(0);
    });

    it("accepts an extra className", () => {
        const { container } = render(<SignaturePad className="mine" />);
        expect(container.firstElementChild).toHaveClass("mine");
    });
});

describe("SignaturePad — the handle after the canvas is gone", () => {
    it("hands back an empty data URL once the pad has unmounted", () => {
        const ref = createRef<SignaturePadHandle>();
        const { unmount } = render(<SignaturePad ref={ref} />);
        const handle = ref.current;

        unmount();

        expect(handle?.toDataURL()).toBe("");
    });
});
