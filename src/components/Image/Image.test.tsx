import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Image } from "./Image";

describe("Image", () => {
    it("renders an img with src and lazy loading by default", () => {
        render(<Image src="/photo.jpg" alt="A photo" />);
        const img = screen.getByAltText("A photo") as HTMLImageElement;
        expect(img.tagName).toBe("IMG");
        expect(img.getAttribute("src")).toBe("/photo.jpg");
        expect(img.getAttribute("loading")).toBe("lazy");
    });

    it("uses eager loading when lazy is false", () => {
        render(<Image src="/photo.jpg" alt="A photo" lazy={false} />);
        expect(screen.getByAltText("A photo").getAttribute("loading")).toBe("eager");
    });

    it("swaps to fallback on error", () => {
        render(<Image src="/broken.jpg" fallback="/fallback.jpg" alt="A photo" />);
        const img = screen.getByAltText("A photo") as HTMLImageElement;
        fireEvent.error(img);
        expect(img.getAttribute("src")).toBe("/fallback.jpg");
    });

    it("does not loop when the fallback also fails", () => {
        render(<Image src="/broken.jpg" fallback="/fallback.jpg" alt="A photo" />);
        const img = screen.getByAltText("A photo") as HTMLImageElement;
        fireEvent.error(img);
        expect(img.getAttribute("src")).toBe("/fallback.jpg");
        fireEvent.error(img);
        expect(img.getAttribute("src")).toBe("/fallback.jpg");
    });

    it("forwards className and calls onError", () => {
        const onError = vi.fn();
        render(<Image src="/photo.jpg" alt="A photo" className="custom" onError={onError} />);
        const img = screen.getByAltText("A photo");
        expect(img.className).toContain("custom");
        fireEvent.error(img);
        expect(onError).toHaveBeenCalledTimes(1);
    });
});
