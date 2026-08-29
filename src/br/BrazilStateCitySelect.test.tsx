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
        expect(onChange).toHaveBeenLastCalledWith({ uf: "SP", city: null, municipalityId: null });

        const cidade = screen.getByLabelText("Cidade") as HTMLSelectElement;
        expect(cidade.disabled).toBe(false);

        await userEvent.selectOptions(cidade, "São Paulo");
        expect(onChange).toHaveBeenLastCalledWith({
            uf: "SP",
            city: "São Paulo",
            municipalityId: "3550308",
        });
    });

    it("resets the city when the state changes", async () => {
        const onChange = vi.fn();
        render(<BrazilStateCitySelect defaultUf="SP" onChange={onChange} />);

        await userEvent.selectOptions(screen.getByLabelText("Cidade"), "Santos");
        expect(onChange).toHaveBeenLastCalledWith({
            uf: "SP",
            city: "Santos",
            municipalityId: "3548500",
        });

        await userEvent.selectOptions(screen.getByLabelText("Estado"), "RJ");
        expect(onChange).toHaveBeenLastCalledWith({ uf: "RJ", city: null, municipalityId: null });
    });
});

describe("BrazilStateCitySelect — layout and cleared city", () => {
    it("lays out in a row when asked", () => {
        const { container } = render(<BrazilStateCitySelect layout="row" />);
        expect((container.firstChild as HTMLElement).style.flexDirection).toBe("row");
    });
});

describe("BrazilStateCitySelect — the Federal District", () => {
    it("lists Brasília and its administrative regions, all resolving to Brasília", async () => {
        const onChange = vi.fn();
        render(<BrazilStateCitySelect defaultUf="DF" onChange={onChange} />);

        const cidade = screen.getByLabelText("Cidade") as HTMLSelectElement;
        const labels = [...cidade.options].map((o) => o.textContent);
        expect(labels).toContain("Brasília");
        expect(labels).toContain("Ceilândia");
        expect(labels).toContain("Taguatinga");

        await userEvent.selectOptions(cidade, "Ceilândia");
        expect(onChange).toHaveBeenLastCalledWith({
            uf: "DF",
            city: "Ceilândia",
            municipalityId: "5300108",
        });
    });
});
