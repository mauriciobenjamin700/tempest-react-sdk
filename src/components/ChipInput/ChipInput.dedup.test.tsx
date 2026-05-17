import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ChipInput } from "./ChipInput";

function Controlled({ initial = [] as string[] }: { initial?: string[] }) {
    const [v, setV] = useState<string[]>(initial);
    return <ChipInput value={v} onChange={setV} />;
}

describe("ChipInput dedup + backspace", () => {
    it("does not add duplicates", async () => {
        const { container } = render(<Controlled initial={["react"]} />);
        const input = container.querySelector("input") as HTMLInputElement;
        await userEvent.type(input, "react{Enter}");
        const chips = screen.getAllByText("react");
        expect(chips).toHaveLength(1);
    });

    it("removes last chip when Backspace pressed on empty input", async () => {
        const { container } = render(<Controlled initial={["react"]} />);
        const input = container.querySelector("input") as HTMLInputElement;
        await userEvent.click(input);
        await userEvent.keyboard("{Backspace}");
        expect(screen.queryByText("react")).not.toBeInTheDocument();
    });

    it("commits on blur", async () => {
        const { container } = render(<Controlled />);
        const input = container.querySelector("input") as HTMLInputElement;
        await userEvent.type(input, "typescript");
        fireEvent.blur(input);
        expect(screen.getByText("typescript")).toBeInTheDocument();
    });
});
