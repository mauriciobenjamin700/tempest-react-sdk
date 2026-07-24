import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChipInput } from "./ChipInput";

function Controlled() {
    const [v, setV] = useState<string[]>([]);
    return <ChipInput value={v} onChange={setV} label="Tags" placeholder="add" />;
}

describe("ChipInput", () => {
    it("adds a chip on Enter", async () => {
        render(<Controlled />);
        const input = screen.getByPlaceholderText("add");
        await userEvent.type(input, "react{Enter}");
        expect(screen.getByText("react")).toBeInTheDocument();
    });

    it("removes a chip when × is clicked", async () => {
        render(<Controlled />);
        const input = screen.getByPlaceholderText("add");
        await userEvent.type(input, "react{Enter}");
        await userEvent.click(screen.getByLabelText("Remover react"));
        expect(screen.queryByText("react")).not.toBeInTheDocument();
    });

    it("associates the label with the inner input", () => {
        render(<ChipInput value={[]} onChange={() => undefined} label="Tags" />);
        expect(screen.getByLabelText("Tags")).toBeInTheDocument();
    });

    it("falls back to aria-label when there is no visible label", () => {
        render(<ChipInput value={[]} onChange={() => undefined} aria-label="Etiquetas" />);
        expect(screen.getByLabelText("Etiquetas")).toBeInTheDocument();
    });
});
