import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
    it("renders options + placeholder", () => {
        render(
            <Select
                label="País"
                placeholder="Selecione"
                options={[
                    { value: "BR", label: "Brasil" },
                    { value: "US", label: "Estados Unidos" },
                ]}
            />,
        );
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByText("Selecione")).toBeInTheDocument();
        expect(screen.getByText("Brasil")).toBeInTheDocument();
    });
});
