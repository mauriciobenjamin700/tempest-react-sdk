import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ListTile } from "@/components/ListTile";
import { Select } from "./Select";

const OPTIONS = [
    { value: "pt", label: "Português" },
    { value: "en", label: "English" },
];

/**
 * The variant exists because the field variant cannot be put in a settings row.
 *
 * A row already carries an icon and a label on the left, so the full field
 * stacks a second labelled field inside one list item. The way out apps took was
 * a hand-rolled native `<select>` with `appearance: none` — which duplicates this
 * component's markup and loses the focus ring, the disabled styling and the caret
 * along with it.
 */
describe("Select chip variant", () => {
    it("renders the control alone, with no label, helper or error slot", () => {
        const { container } = render(
            <Select variant="chip" aria-label="Idioma" options={OPTIONS} />,
        );

        expect(screen.getByRole("combobox", { name: "Idioma" })).toBeInTheDocument();
        expect(container.querySelector("label")).toBeNull();
    });

    it("keeps the accessible name the row's visible text cannot give it", () => {
        render(
            <ListTile
                title="Idioma"
                trailing={<Select variant="chip" aria-label="Idioma" options={OPTIONS} />}
            />,
        );

        expect(screen.getByRole("combobox", { name: "Idioma" })).toBeInTheDocument();
    });

    it("still takes the native select props", () => {
        render(
            <Select
                variant="chip"
                aria-label="Idioma"
                options={OPTIONS}
                defaultValue="en"
                disabled
            />,
        );

        const control = screen.getByRole("combobox", { name: "Idioma" });
        expect(control).toBeDisabled();
        expect(control).toHaveValue("en");
    });

    it("does not leak the field-only props onto the DOM node", () => {
        render(<Select variant="chip" aria-label="Idioma" options={OPTIONS} />);

        const control = screen.getByRole("combobox", { name: "Idioma" });
        expect(control).not.toHaveAttribute("helperText");
        expect(control).not.toHaveAttribute("variant");
    });

    it("leaves the field variant exactly as it was", () => {
        render(<Select label="Estado" helperText="Onde você mora" options={OPTIONS} error="" />);

        expect(screen.getByLabelText("Estado")).toBeInTheDocument();
        expect(screen.getByText("Onde você mora")).toBeInTheDocument();
    });

    it("shows the error slot on the field variant and marks the control invalid", () => {
        render(<Select label="Estado" error="Escolha um estado" options={OPTIONS} />);

        expect(screen.getByText("Escolha um estado")).toBeInTheDocument();
        expect(screen.getByLabelText("Estado")).toHaveAttribute("aria-invalid", "true");
    });
});
