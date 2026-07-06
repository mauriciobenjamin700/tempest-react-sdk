import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrazilStateCitySelect } from "./BrazilStateCitySelect";

describe("BrazilStateCitySelect", () => {
    it("renders both selects; city is disabled until a state is picked", () => {
        render(<BrazilStateCitySelect />);
        const cidade = screen.getByLabelText("Cidade") as HTMLSelectElement;
        expect(cidade.disabled).toBe(true);
    });

    it("populates cities after choosing a state and emits onChange", async () => {
        const onChange = vi.fn();
        render(<BrazilStateCitySelect onChange={onChange} />);

        await userEvent.selectOptions(screen.getByLabelText("Estado"), "SP");
        expect(onChange).toHaveBeenLastCalledWith({ uf: "SP", city: null });

        const cidade = screen.getByLabelText("Cidade") as HTMLSelectElement;
        expect(cidade.disabled).toBe(false);

        await userEvent.selectOptions(cidade, "São Paulo");
        expect(onChange).toHaveBeenLastCalledWith({ uf: "SP", city: "São Paulo" });
    });

    it("resets the city when the state changes", async () => {
        const onChange = vi.fn();
        render(<BrazilStateCitySelect defaultUf="SP" onChange={onChange} />);

        await userEvent.selectOptions(screen.getByLabelText("Cidade"), "Santos");
        expect(onChange).toHaveBeenLastCalledWith({ uf: "SP", city: "Santos" });

        await userEvent.selectOptions(screen.getByLabelText("Estado"), "RJ");
        expect(onChange).toHaveBeenLastCalledWith({ uf: "RJ", city: null });
    });
});
