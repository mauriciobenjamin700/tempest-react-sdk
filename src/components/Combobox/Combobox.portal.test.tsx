import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Combobox } from "./Combobox";

const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
];

function Field({ portal, onPick }: { portal?: boolean; onPick?: (value: string) => void }) {
    const [value, setValue] = useState("");
    return (
        <div style={{ overflow: "auto" }} data-testid="clip">
            <Combobox
                options={options}
                value={value}
                onChange={(next) => {
                    setValue(next);
                    onPick?.(next);
                }}
                label="Combo"
                portal={portal}
            />
        </div>
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Combobox in a portal", () => {
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

    it("selects an option from the portalled list", async () => {
        const onPick = vi.fn();
        render(<Field onPick={onPick} />);
        await userEvent.click(screen.getByRole("combobox"));
        fireEvent.mouseDown(screen.getByRole("option", { name: "Beta" }));
        expect(onPick).toHaveBeenCalledWith("b");
        expect(screen.getByRole("combobox")).toHaveValue("Beta");
    });

    it("stays open on a press inside the list that is not an option", async () => {
        render(<Field />);
        await userEvent.type(screen.getByRole("combobox"), "zzz");
        fireEvent.mouseDown(screen.getByText("Nenhuma opção encontrada"));
        expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("gives the list the field's width", async () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
            top: 100,
            left: 20,
            width: 240,
            height: 36,
            right: 260,
            bottom: 136,
            x: 20,
            y: 100,
            toJSON: () => ({}),
        }));
        render(<Field />);
        await userEvent.click(screen.getByRole("combobox"));
        expect(screen.getByRole("listbox").style.width).toBe("240px");
    });
});
