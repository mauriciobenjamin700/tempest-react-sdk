import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dropzone } from "./Dropzone";

function makeFile(name: string, size: number): File {
    const file = new File(["x"], name, { type: "text/plain" });
    Object.defineProperty(file, "size", { value: size });
    return file;
}

describe("Dropzone", () => {
    it("clicking triggers the hidden file input", () => {
        render(<Dropzone onDrop={() => {}} />);
        const zone = screen.getByRole("button");
        const input = zone.querySelector<HTMLInputElement>('input[type="file"]')!;
        const clickSpy = vi.spyOn(input, "click");
        fireEvent.click(zone);
        expect(clickSpy).toHaveBeenCalled();
    });

    it("drop calls onDrop with the dropped files", () => {
        const onDrop = vi.fn();
        render(<Dropzone onDrop={onDrop} />);
        const zone = screen.getByRole("button");
        const files = [makeFile("a.txt", 10), makeFile("b.txt", 20)];
        fireEvent.drop(zone, { dataTransfer: { files } });
        expect(onDrop).toHaveBeenCalledWith(files);
    });

    it("disabled blocks click and drop", () => {
        const onDrop = vi.fn();
        render(<Dropzone onDrop={onDrop} disabled />);
        const zone = screen.getByRole("button");
        const input = zone.querySelector<HTMLInputElement>('input[type="file"]')!;
        const clickSpy = vi.spyOn(input, "click");
        fireEvent.click(zone);
        fireEvent.drop(zone, { dataTransfer: { files: [makeFile("a.txt", 10)] } });
        expect(clickSpy).not.toHaveBeenCalled();
        expect(onDrop).not.toHaveBeenCalled();
    });

    it("maxSize filters oversized files and calls onReject", () => {
        const onDrop = vi.fn();
        const onReject = vi.fn();
        render(<Dropzone onDrop={onDrop} onReject={onReject} maxSize={100} />);
        const zone = screen.getByRole("button");
        const small = makeFile("small.txt", 50);
        const big = makeFile("big.txt", 500);
        fireEvent.drop(zone, { dataTransfer: { files: [small, big] } });
        expect(onDrop).toHaveBeenCalledWith([small]);
        expect(onReject).toHaveBeenCalledWith([big]);
    });

    it("opens the dialog on Enter key", () => {
        render(<Dropzone onDrop={() => {}} />);
        const zone = screen.getByRole("button");
        const input = zone.querySelector<HTMLInputElement>('input[type="file"]')!;
        const clickSpy = vi.spyOn(input, "click");
        fireEvent.keyDown(zone, { key: "Enter" });
        expect(clickSpy).toHaveBeenCalled();
    });
});
