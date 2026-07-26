import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageCropper, type ImageCropperHandle } from "./ImageCropper";

const FRAME = 300;
const NATURAL = { width: 800, height: 400 };

let drawImage: ReturnType<typeof vi.fn>;
let toBlob: ReturnType<typeof vi.fn>;
let contextAvailable: boolean;

beforeEach(() => {
    contextAvailable = true;
    drawImage = vi.fn();
    toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["x"], { type: "image/png" })));

    // jsdom implements neither `getContext` nor `toBlob`; the crop path needs both.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
        contextAvailable ? ({ drawImage } as unknown as CanvasRenderingContext2D) : null,
    );
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
        configurable: true,
        writable: true,
        value: toBlob,
    });

    // jsdom does no layout, so the frame would measure 0 and all crop maths would
    // collapse to zero.
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(FRAME);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(FRAME);

    Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: vi.fn(() => "blob:mock"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        writable: true,
        value: vi.fn(),
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

/** Render the cropper and report the image its natural size has loaded. */
function renderCropper(props: Partial<React.ComponentProps<typeof ImageCropper>> = {}) {
    const utils = render(<ImageCropper src="/photo.jpg" {...props} />);
    const image = utils.container.querySelector("img") as HTMLImageElement;
    Object.defineProperty(image, "naturalWidth", { value: NATURAL.width, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: NATURAL.height, configurable: true });
    act(() => {
        fireEvent.load(image);
    });
    return { ...utils, image };
}

/** The pan offset currently applied, parsed out of the inline transform. */
function offsetOf(image: HTMLElement): { x: number; y: number } {
    const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(image.style.transform);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: NaN, y: NaN };
}

const frame = () => screen.getByRole("group", { name: "Área de recorte" });

describe("ImageCropper — loading the source", () => {
    it("renders a URL source directly", () => {
        const { image } = renderCropper();
        expect(image).toHaveAttribute("src", "/photo.jpg");
    });

    it("creates an object URL for a File and revokes it on unmount", () => {
        const file = new File(["x"], "photo.png", { type: "image/png" });
        const { unmount } = render(<ImageCropper src={file} />);
        expect(URL.createObjectURL).toHaveBeenCalledWith(file);
        unmount();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    });

    it("revokes the previous object URL when the source changes", () => {
        const first = new File(["a"], "a.png", { type: "image/png" });
        const second = new File(["b"], "b.png", { type: "image/png" });
        const { rerender } = render(<ImageCropper src={first} />);
        rerender(<ImageCropper src={second} />);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    });

    it("sizes the image to cover the frame once it loads", () => {
        const { image } = renderCropper();
        // 800×400 covering a 300×300 frame scales by 0.75.
        expect(image.style.width).toBe("600px");
        expect(image.style.height).toBe("300px");
    });

    it("gives the image an empty alt — it is a crop surface, not content", () => {
        const { image } = renderCropper();
        expect(image).toHaveAttribute("alt", "");
    });

    it("disables the controls until the image has loaded", () => {
        render(<ImageCropper src="/photo.jpg" />);
        expect(screen.getByLabelText("Zoom")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Centralizar" })).toBeDisabled();
    });
});

describe("ImageCropper — panning", () => {
    it("follows a pointer drag along the axis with overflow", () => {
        const { image } = renderCropper();
        fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 140, clientY: 100 });
        expect(offsetOf(image).x).toBe(40);
    });

    it("refuses to pan along an axis with no overflow — it would expose background", () => {
        const { image } = renderCropper();
        fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 100, clientY: 180 });
        // The image is exactly as tall as the frame at zoom 1.
        expect(offsetOf(image).y).toBe(0);
    });

    it("clamps at the edge instead of letting the image slide away", () => {
        const { image } = renderCropper();
        fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 5000, clientY: 0 });
        // Overflow is (600 - 300) / 2 = 150.
        expect(offsetOf(image).x).toBe(150);
    });

    it("ignores moves from a different pointer mid-drag", () => {
        const { image } = renderCropper();
        fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(frame(), { pointerId: 2, clientX: 200, clientY: 100 });
        expect(offsetOf(image).x).toBe(0);
    });

    it("stops panning after the pointer is released", () => {
        const { image } = renderCropper();
        fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 130, clientY: 100 });
        fireEvent.pointerUp(frame(), { pointerId: 1 });
        fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 200, clientY: 100 });
        expect(offsetOf(image).x).toBe(30);
    });
});

describe("ImageCropper — zoom", () => {
    it("zooms from the slider and grows the displayed image", () => {
        const { image } = renderCropper();
        fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "2" } });
        expect(image.style.width).toBe("1200px");
    });

    it("clamps zoom to the 1…maxZoom range", () => {
        const { image } = renderCropper({ maxZoom: 2 });
        fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "9" } });
        expect(image.style.width).toBe("1200px");
        fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "0.1" } });
        expect(image.style.width).toBe("600px");
    });

    it("re-clamps the offset when zooming back out", () => {
        const { image } = renderCropper();
        fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "3" } });
        fireEvent.pointerDown(frame(), { pointerId: 1, clientX: 0, clientY: 0 });
        fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 5000, clientY: 5000 });
        expect(offsetOf(image).y).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "1" } });
        // At zoom 1 there is no vertical overflow left, so the offset must collapse.
        expect(offsetOf(image).y).toBe(0);
    });

    it("zooms on wheel, in on scroll-up and out on scroll-down", () => {
        const { image } = renderCropper();
        fireEvent.wheel(frame(), { deltaY: -100 });
        const zoomedIn = parseFloat(image.style.width);
        expect(zoomedIn).toBeGreaterThan(600);
        fireEvent.wheel(frame(), { deltaY: 100 });
        expect(parseFloat(image.style.width)).toBeLessThan(zoomedIn);
    });
});

describe("ImageCropper — keyboard", () => {
    it("pans with the arrow keys", () => {
        const { image } = renderCropper();
        fireEvent.keyDown(frame(), { key: "ArrowRight" });
        expect(offsetOf(image).x).toBe(12);
        fireEvent.keyDown(frame(), { key: "ArrowLeft" });
        expect(offsetOf(image).x).toBe(0);
    });

    it("moves in bigger steps with Shift held", () => {
        const { image } = renderCropper();
        fireEvent.keyDown(frame(), { key: "ArrowRight", shiftKey: true });
        expect(offsetOf(image).x).toBe(48);
    });

    it("zooms with + and -", () => {
        const { image } = renderCropper();
        fireEvent.keyDown(frame(), { key: "+" });
        expect(parseFloat(image.style.width)).toBeGreaterThan(600);
        fireEvent.keyDown(frame(), { key: "-" });
        expect(parseFloat(image.style.width)).toBeCloseTo(600, 1);
    });

    it("recentres with 0", () => {
        const { image } = renderCropper();
        fireEvent.keyDown(frame(), { key: "ArrowRight", shiftKey: true });
        fireEvent.keyDown(frame(), { key: "+" });
        fireEvent.keyDown(frame(), { key: "0" });
        expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
        expect(image.style.width).toBe("600px");
    });

    it("leaves unrelated keys alone", () => {
        const { image } = renderCropper();
        fireEvent.keyDown(frame(), { key: "a" });
        expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
    });

    it("is focusable and describes its own shortcuts", () => {
        renderCropper();
        expect(frame()).toHaveAttribute("tabIndex", "0");
        expect(frame()).toHaveAccessibleDescription(/Setas movem/);
    });
});

describe("ImageCropper — exporting", () => {
    it("draws the crop region from the natural pixels and resolves a Blob", async () => {
        const ref = createRef<ImageCropperHandle>();
        render(<ImageCropper ref={ref} src="/photo.jpg" />);
        const image = document.querySelector("img") as HTMLImageElement;
        Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 400, configurable: true });
        act(() => {
            fireEvent.load(image);
        });

        const blob = await ref.current!.crop();
        expect(blob).toBeInstanceOf(Blob);
        // Centre square of an 800×400 source, exported 1:1.
        expect(drawImage).toHaveBeenCalledWith(image, 200, 0, 400, 400, 0, 0, 400, 400);
    });

    it("caps the output at maxSize while keeping the ratio", async () => {
        const ref = createRef<ImageCropperHandle>();
        render(<ImageCropper ref={ref} src="/photo.jpg" maxSize={100} />);
        const image = document.querySelector("img") as HTMLImageElement;
        Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 400, configurable: true });
        act(() => {
            fireEvent.load(image);
        });

        await ref.current!.crop();
        const [, , , , , , , outW, outH] = drawImage.mock.calls[0];
        expect([outW, outH]).toEqual([100, 100]);
    });

    it("forwards the requested type and quality to the encoder", async () => {
        const ref = createRef<ImageCropperHandle>();
        render(
            <ImageCropper ref={ref} src="/photo.jpg" outputType="image/jpeg" outputQuality={0.5} />,
        );
        const image = document.querySelector("img") as HTMLImageElement;
        Object.defineProperty(image, "naturalWidth", { value: 400, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 400, configurable: true });
        act(() => {
            fireEvent.load(image);
        });

        await ref.current!.crop();
        expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.5);
    });

    it("resolves null instead of throwing before the image has loaded", async () => {
        const ref = createRef<ImageCropperHandle>();
        render(<ImageCropper ref={ref} src="/photo.jpg" />);
        await expect(ref.current!.crop()).resolves.toBeNull();
    });

    it("resolves null when no 2D context is available", async () => {
        contextAvailable = false;
        const ref = createRef<ImageCropperHandle>();
        render(<ImageCropper ref={ref} src="/photo.jpg" />);
        const image = document.querySelector("img") as HTMLImageElement;
        Object.defineProperty(image, "naturalWidth", { value: 400, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 400, configurable: true });
        act(() => {
            fireEvent.load(image);
        });
        await expect(ref.current!.crop()).resolves.toBeNull();
    });

    it("exposes reset on the handle", () => {
        const ref = createRef<ImageCropperHandle>();
        const { container } = render(<ImageCropper ref={ref} src="/photo.jpg" />);
        const image = container.querySelector("img") as HTMLImageElement;
        Object.defineProperty(image, "naturalWidth", { value: 800, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 400, configurable: true });
        act(() => {
            fireEvent.load(image);
        });
        fireEvent.keyDown(frame(), { key: "ArrowRight" });
        act(() => ref.current!.reset());
        expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
    });
});

describe("ImageCropper — reporting and options", () => {
    it("reports every crop change", () => {
        const onCropChange = vi.fn();
        renderCropper({ onCropChange });
        fireEvent.keyDown(frame(), { key: "ArrowRight" });
        expect(onCropChange).toHaveBeenCalledWith({ zoom: 1, offset: { x: 12, y: 0 } });
    });

    it("does not report a pan that changed nothing", () => {
        const onCropChange = vi.fn();
        renderCropper({ onCropChange });
        // No vertical overflow, so this is a no-op.
        fireEvent.keyDown(frame(), { key: "ArrowDown" });
        expect(onCropChange).not.toHaveBeenCalled();
    });

    it("applies the requested aspect ratio to the frame", () => {
        renderCropper({ aspect: 16 / 9 });
        // jsdom serializes the shorthand as "<ratio> / 1".
        expect(parseFloat(frame().style.aspectRatio)).toBeCloseTo(16 / 9, 5);
    });

    it("accepts a custom accessible name", () => {
        renderCropper({ label: "Foto do documento" });
        expect(screen.getByRole("group", { name: "Foto do documento" })).toBeInTheDocument();
    });

    it("recentres from the Centralizar button", () => {
        const { image } = renderCropper();
        fireEvent.keyDown(frame(), { key: "ArrowRight" });
        fireEvent.click(screen.getByRole("button", { name: "Centralizar" }));
        expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
    });
});

describe("ImageCropper — an image with no intrinsic size", () => {
    it("stays unloaded, so the controls do not enable over an unusable image", () => {
        const { container } = render(<ImageCropper src="/broken.svg" />);
        const image = container.querySelector("img") as HTMLImageElement;
        // An SVG without a viewBox decodes fine and reports 0×0.
        Object.defineProperty(image, "naturalWidth", { value: 0, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 0, configurable: true });
        act(() => {
            fireEvent.load(image);
        });

        expect(screen.getByLabelText("Zoom")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Centralizar" })).toBeDisabled();
        expect(image.style.width).toBe("");
    });

    it("resolves null from crop() rather than exporting a zero-size canvas", async () => {
        const ref = createRef<ImageCropperHandle>();
        const { container } = render(<ImageCropper ref={ref} src="/broken.svg" />);
        const image = container.querySelector("img") as HTMLImageElement;
        Object.defineProperty(image, "naturalWidth", { value: 0, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 0, configurable: true });
        act(() => {
            fireEvent.load(image);
        });
        await expect(ref.current!.crop()).resolves.toBeNull();
    });
});
