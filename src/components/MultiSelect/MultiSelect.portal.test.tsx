import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MultiSelect } from "./MultiSelect";

const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
];

function Field({ portal }: { portal?: boolean }) {
    const [value, setValue] = useState<string[]>([]);
    return (
        <div style={{ overflow: "auto" }} data-testid="clip">
            <MultiSelect
                options={options}
                value={value}
                onChange={setValue}
                label="Multi"
                portal={portal}
            />
        </div>
    );
}

describe("MultiSelect in a portal", () => {
    it("renders the list outside the field, so an overflow ancestor cannot clip it", async () => {
        render(<Field />);
        await userEvent.click(screen.getByRole("combobox"));
        const list = screen.getByRole("listbox");
        expect(screen.getByTestId("clip").contains(list)).toBe(false);
        expect(list.style.position).toBe("fixed");
    });

    it("keeps the list in flow when portal is false", async () => {
        render(<Field portal={false} />);
        await userEvent.click(screen.getByRole("combobox"));
        expect(screen.getByTestId("clip").contains(screen.getByRole("listbox"))).toBe(true);
    });

    it("toggles options from the portalled list and keeps it open", async () => {
        render(<Field />);
        await userEvent.click(screen.getByRole("combobox"));
        fireEvent.mouseDown(screen.getByRole("option", { name: "Alpha" }));
        fireEvent.mouseDown(screen.getByRole("option", { name: "Beta" }));
        expect(screen.getByRole("button", { name: "Remover Alpha" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remover Beta" })).toBeInTheDocument();
        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
});
