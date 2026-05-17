import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileUpload } from "./FileUpload";

describe("FileUpload disabled + keyboard", () => {
    it("does not accept files when disabled", () => {
        const onChange = vi.fn();
        const { container } = render(
            <FileUpload value={[]} onChange={onChange} disabled />,
        );
        const dropzone = container.querySelector('[role="button"]') as HTMLElement;
        fireEvent.dragEnter(dropzone);
        fireEvent.drop(dropzone, {
            dataTransfer: {
                files: [new File(["x"], "x.png", { type: "image/png" })],
            },
        });
        expect(onChange).not.toHaveBeenCalled();
    });

    it("opens file picker on Enter/Space", () => {
        const onChange = vi.fn();
        const { container } = render(<FileUpload value={[]} onChange={onChange} />);
        const dropzone = container.querySelector('[role="button"]') as HTMLElement;
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        const clickSpy = vi.spyOn(input, "click").mockImplementation(() => undefined);
        fireEvent.keyDown(dropzone, { key: "Enter" });
        fireEvent.keyDown(dropzone, { key: " " });
        expect(clickSpy).toHaveBeenCalledTimes(2);
        clickSpy.mockRestore();
    });

    it("replaces existing files when multiple=false", () => {
        let captured: File[] = [];
        const { container, rerender } = render(
            <FileUpload value={[]} onChange={(files) => (captured = files)} />,
        );
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        fireEvent.change(input, {
            target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
        });
        rerender(<FileUpload value={captured} onChange={(files) => (captured = files)} />);
        const input2 = container.querySelector("input[type=file]") as HTMLInputElement;
        fireEvent.change(input2, {
            target: { files: [new File(["y"], "b.png", { type: "image/png" })] },
        });
        expect(captured.map((f) => f.name)).toEqual(["b.png"]);
    });
});
