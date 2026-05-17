import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SearchBar } from "./SearchBar";

function Controlled() {
    const [v, setV] = useState("");
    return <SearchBar value={v} onChange={setV} placeholder="search" />;
}

describe("SearchBar", () => {
    it("renders placeholder", () => {
        render(<Controlled />);
        expect(screen.getByPlaceholderText("search")).toBeInTheDocument();
    });

    it("shows clear button when value is non-empty and clears on click", async () => {
        render(<Controlled />);
        const input = screen.getByPlaceholderText("search");
        await userEvent.type(input, "hi");
        const clear = screen.getByLabelText("Limpar busca");
        await userEvent.click(clear);
        expect((input as HTMLInputElement).value).toBe("");
    });
});
