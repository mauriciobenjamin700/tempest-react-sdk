import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FileUpload } from "./FileUpload";

function makeFile(name: string, size: number, type = "image/png"): File {
    return new File([new ArrayBuffer(size)], name, { type });
}

function Controlled({ accept }: { accept?: string }) {
    const [files, setFiles] = useState<File[]>([]);
    return <FileUpload value={files} onChange={setFiles} accept={accept} multiple />;
}

describe("FileUpload — full", () => {
    it("rejects mismatched type via accept filter", () => {
        const onReject = vi.fn();
        const { container } = render(
            <FileUpload
                value={[]}
                onChange={vi.fn()}
                accept=".png"
                onReject={onReject}
            />,
        );
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        fireEvent.change(input, {
            target: { files: [makeFile("doc.pdf", 100, "application/pdf")] },
        });
        expect(onReject).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ reason: "type" })]),
        );
    });

    it("handles drag-over and drop", () => {
        const { container } = render(<Controlled />);
        const dropzone = container.querySelector('[role="button"]') as HTMLElement;
        const file = makeFile("ok.png", 100);
        fireEvent.dragEnter(dropzone);
        fireEvent.dragOver(dropzone);
        fireEvent.drop(dropzone, {
            dataTransfer: { files: [file] },
        });
        expect(screen.getByText("ok.png")).toBeInTheDocument();
    });

    it("removes file when × is clicked", () => {
        const { container } = render(<Controlled />);
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeFile("x.png", 50)] } });
        const removeBtn = screen.getByLabelText("Remover x.png");
        fireEvent.click(removeBtn);
        expect(screen.queryByText("x.png")).not.toBeInTheDocument();
    });
});
