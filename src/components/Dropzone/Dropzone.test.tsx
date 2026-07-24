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

describe("Dropzone — drag states and file filtering", () => {
    function makeFile(name: string, size: number): File {
        const file = new File(["x"], name);
        Object.defineProperty(file, "size", { value: size });
        return file;
    }

    function fileList(...files: File[]): FileList {
        return {
            length: files.length,
            item: (index: number) => files[index] ?? null,
            ...files,
        } as unknown as FileList;
    }

    it("marks itself as dragging between dragenter and dragleave", () => {
        const { container } = render(<Dropzone onDrop={vi.fn()} />);
        const zone = container.firstChild as HTMLElement;

        fireEvent.dragEnter(zone);
        expect(zone.className).toContain("dragging");

        fireEvent.dragLeave(zone);
        expect(zone.className).not.toContain("dragging");
    });

    it("keeps dragOver from bubbling to the browser default", () => {
        const { container } = render(<Dropzone onDrop={vi.fn()} />);
        const zone = container.firstChild as HTMLElement;
        const event = new Event("dragover", { bubbles: true, cancelable: true });
        zone.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it("ignores dragenter while disabled", () => {
        const { container } = render(<Dropzone disabled onDrop={vi.fn()} />);
        const zone = container.firstChild as HTMLElement;
        fireEvent.dragEnter(zone);
        expect(zone.className).not.toContain("dragging");
        expect(zone).toHaveAttribute("aria-disabled", "true");
        expect(zone).toHaveAttribute("tabindex", "-1");
    });

    it("ignores an empty drop", () => {
        const onDrop = vi.fn();
        const { container } = render(<Dropzone onDrop={onDrop} />);
        fireEvent.drop(container.firstChild as HTMLElement, {
            dataTransfer: { files: fileList() },
        });
        expect(onDrop).not.toHaveBeenCalled();
    });

    it("keeps only the first file when multiple is off", () => {
        const onDrop = vi.fn();
        const { container } = render(<Dropzone multiple={false} onDrop={onDrop} />);
        fireEvent.drop(container.firstChild as HTMLElement, {
            dataTransfer: { files: fileList(makeFile("a.txt", 10), makeFile("b.txt", 10)) },
        });
        expect(onDrop).toHaveBeenCalledWith([expect.objectContaining({ name: "a.txt" })]);
    });

    it("does not call onDrop when every file is rejected", () => {
        const onDrop = vi.fn();
        const onReject = vi.fn();
        const { container } = render(<Dropzone maxSize={5} onDrop={onDrop} onReject={onReject} />);
        fireEvent.drop(container.firstChild as HTMLElement, {
            dataTransfer: { files: fileList(makeFile("big.bin", 50)) },
        });
        expect(onDrop).not.toHaveBeenCalled();
        expect(onReject).toHaveBeenCalledWith([expect.objectContaining({ name: "big.bin" })]);
    });

    it("accepts files through the hidden input and clears it", () => {
        const onDrop = vi.fn();
        const { container } = render(<Dropzone onDrop={onDrop} />);
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        Object.defineProperty(input, "files", { value: fileList(makeFile("c.txt", 4)) });
        fireEvent.change(input);
        expect(onDrop).toHaveBeenCalled();
        expect(input.value).toBe("");
    });

    it("opens the dialog on Space and ignores other keys", () => {
        const { container } = render(<Dropzone onDrop={vi.fn()} />);
        const zone = container.firstChild as HTMLElement;
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        const click = vi.spyOn(input, "click").mockImplementation(() => undefined);

        fireEvent.keyDown(zone, { key: " " });
        expect(click).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(zone, { key: "Escape" });
        expect(click).toHaveBeenCalledTimes(1);
    });

    it("renders the default prompt without children", () => {
        render(<Dropzone onDrop={vi.fn()} />);
        expect(screen.getByText(/Arraste arquivos aqui/)).toBeInTheDocument();
    });
});
