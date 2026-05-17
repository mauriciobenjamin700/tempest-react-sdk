import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FileUpload } from "./FileUpload";

function makeFile(name: string, size: number, type = "image/png"): File {
    return new File([new ArrayBuffer(size)], name, { type });
}

function Controlled({
    onReject,
}: {
    onReject?: (rejected: { file: File; reason: string }[]) => void;
}) {
    const [files, setFiles] = useState<File[]>([]);
    return (
        <FileUpload
            value={files}
            onChange={setFiles}
            accept="image/*"
            maxSize={1024}
            multiple
            onReject={onReject as never}
        />
    );
}

describe("FileUpload", () => {
    it("rejects files larger than maxSize", () => {
        const onReject = vi.fn();
        const { container } = render(<Controlled onReject={onReject} />);
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        const big = makeFile("big.png", 4096);
        fireEvent.change(input, { target: { files: [big] } });
        expect(onReject).toHaveBeenCalled();
    });

    it("accepts files matching the filter", () => {
        const { container } = render(<Controlled />);
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        const file = makeFile("ok.png", 100);
        fireEvent.change(input, { target: { files: [file] } });
        expect(screen.getByText("ok.png")).toBeInTheDocument();
    });
});
