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

describe("FileUpload — accept filter, size labels and interaction", () => {
    function fileList(...files: File[]): FileList {
        return {
            ...files,
            length: files.length,
            item: (index: number) => files[index] ?? null,
        } as unknown as FileList;
    }

    it("keeps files matching an extension, a wildcard type or an exact type", () => {
        const onChange = vi.fn();
        render(
            <FileUpload value={[]} onChange={onChange} accept=".pdf,image/*,text/csv" multiple />,
        );
        const input = document.querySelector("input[type=file]") as HTMLInputElement;
        Object.defineProperty(input, "files", {
            configurable: true,
            value: fileList(
                makeFile("doc.pdf", 10, "application/pdf"),
                makeFile("pic.png", 10, "image/png"),
                makeFile("table.csv", 10, "text/csv"),
                makeFile("app.bin", 10, "application/octet-stream"),
            ),
        });
        fireEvent.change(input);

        const accepted = onChange.mock.calls[0][0] as File[];
        expect(accepted.map((f) => f.name)).toEqual(["doc.pdf", "pic.png", "table.csv"]);
    });

    it("formats sizes in B, KB and MB", () => {
        render(
            <FileUpload
                value={[
                    makeFile("tiny.txt", 500, "text/plain"),
                    makeFile("mid.txt", 2048, "text/plain"),
                    makeFile("big.txt", 3 * 1024 * 1024, "text/plain"),
                ]}
                onChange={vi.fn()}
                multiple
            />,
        );
        expect(screen.getByText(/500 B/)).toBeInTheDocument();
        expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
        expect(screen.getByText(/3\.0 MB/)).toBeInTheDocument();
    });

    it("toggles the dragging state and honours the disabled guard", () => {
        const { container, unmount } = render(<FileUpload value={[]} onChange={vi.fn()} />);
        const zone = container.querySelector("[role=button]") as HTMLElement;

        fireEvent.dragEnter(zone);
        expect(zone.className).toContain("active");
        fireEvent.dragLeave(zone);
        expect(zone.className).not.toContain("active");
        unmount();

        const { container: off } = render(<FileUpload value={[]} onChange={vi.fn()} disabled />);
        const disabledZone = off.querySelector("[role=button]") as HTMLElement;
        fireEvent.dragEnter(disabledZone);
        expect(disabledZone.className).not.toContain("active");
        expect(disabledZone).toHaveAttribute("tabindex", "-1");
    });

    it("opens the dialog with Enter and Space, but not with other keys", () => {
        const { container } = render(<FileUpload value={[]} onChange={vi.fn()} />);
        const zone = container.querySelector("[role=button]") as HTMLElement;
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        const click = vi.spyOn(input, "click").mockImplementation(() => undefined);

        fireEvent.keyDown(zone, { key: "Enter" });
        fireEvent.keyDown(zone, { key: " " });
        expect(click).toHaveBeenCalledTimes(2);

        fireEvent.keyDown(zone, { key: "a" });
        expect(click).toHaveBeenCalledTimes(2);
    });

    it("does not open the dialog when disabled", () => {
        const { container } = render(<FileUpload value={[]} onChange={vi.fn()} disabled />);
        const zone = container.querySelector("[role=button]") as HTMLElement;
        const input = container.querySelector("input[type=file]") as HTMLInputElement;
        const click = vi.spyOn(input, "click").mockImplementation(() => undefined);

        fireEvent.click(zone);
        expect(click).not.toHaveBeenCalled();
    });

    it("renders label, custom title and subtitle", () => {
        render(
            <FileUpload
                value={[]}
                onChange={vi.fn()}
                label="Anexos"
                title="Solte aqui"
                subtitle="até 5 MB"
            />,
        );
        expect(screen.getByText("Anexos")).toBeInTheDocument();
        expect(screen.getByText("Solte aqui")).toBeInTheDocument();
        expect(screen.getByText("até 5 MB")).toBeInTheDocument();
    });
});
