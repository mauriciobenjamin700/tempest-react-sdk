import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

const OPTIONS = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
];

describe("Select placeholder", () => {
    it("an uncontrolled select with a placeholder starts empty instead of on the first option", () => {
        render(<Select label="Sala" placeholder="Selecione" options={OPTIONS} />);
        expect(screen.getByLabelText("Sala")).toHaveValue("");
    });

    it("an explicit defaultValue still wins over the empty start", () => {
        render(<Select label="Sala" placeholder="Selecione" options={OPTIONS} defaultValue="b" />);
        expect(screen.getByLabelText("Sala")).toHaveValue("b");
    });

    it("without clearable the placeholder entry cannot be picked again", () => {
        const { container } = render(
            <Select label="Sala" placeholder="Selecione" options={OPTIONS} />,
        );
        const entry = container.querySelector("option[value='']");
        expect(entry).toBeDisabled();
        expect(entry).toHaveAttribute("hidden");
    });

    it("clearable keeps the placeholder selectable, so an optional field goes back to empty", () => {
        function Optional() {
            const [value, setValue] = useState("b");
            return (
                <>
                    <Select
                        label="Convênio"
                        placeholder="Nenhum"
                        clearable
                        options={OPTIONS}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                    />
                    <output>{JSON.stringify(value)}</output>
                </>
            );
        }
        render(<Optional />);
        const entry = screen.getByRole("option", { name: "Nenhum" });
        expect(entry).toBeEnabled();
        expect(entry).not.toHaveAttribute("hidden");
        fireEvent.change(screen.getByLabelText("Convênio"), { target: { value: "" } });
        expect(screen.getByLabelText("Convênio")).toHaveValue("");
        expect(screen.getByRole("status")).toHaveTextContent('""');
    });

    it("clearable renders exactly one empty entry, first in the list", () => {
        render(<Select label="Sala" placeholder="Nenhuma" clearable options={OPTIONS} />);
        const values = screen.getAllByRole("option").map((option) => option.getAttribute("value"));
        expect(values).toEqual(["", "a", "b"]);
        expect(screen.getByLabelText("Sala")).toHaveValue("");
    });
});
