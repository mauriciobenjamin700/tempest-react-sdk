import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrazilStateMap } from "./BrazilStateMap";
import { loadStateMunicipalities } from "./state-geo";

describe("loadStateMunicipalities", () => {
    it("loads a state's municipalities lazily", async () => {
        const ac = await loadStateMunicipalities("AC");
        expect(ac?.uf).toBe("AC");
        expect(ac?.features.length).toBeGreaterThan(0);
        expect(ac?.features[0].properties).toHaveProperty("name");
        expect(ac?.features[0].properties).toHaveProperty("id");
    });
});

describe("BrazilStateMap", () => {
    it("renders one path per municipality after loading", async () => {
        const { container } = render(<BrazilStateMap uf="AC" />);
        await waitFor(() =>
            expect(container.querySelectorAll("path[data-city-id]").length).toBeGreaterThan(0),
        );
        const ac = await loadStateMunicipalities("AC");
        expect(container.querySelectorAll("path[data-city-id]").length).toBe(ac!.features.length);
    });

    it("fires onSelect with the clicked municipality", async () => {
        const onSelect = vi.fn();
        const { container } = render(<BrazilStateMap uf="AC" onSelect={onSelect} />);
        await waitFor(() => expect(container.querySelector("path[data-city-id]")).toBeTruthy());

        const first = container.querySelector("path[data-city-id]")!;
        const name = first.getAttribute("data-city");
        const id = first.getAttribute("data-city-id");
        await userEvent.click(first);
        expect(onSelect).toHaveBeenCalledWith({ id, name });
    });

    it("marks a municipality selected by name", async () => {
        const ac = await loadStateMunicipalities("AC");
        const target = ac!.features[0].properties.name;
        const { container } = render(
            <BrazilStateMap uf="AC" selected={target} onSelect={() => {}} />,
        );
        await waitFor(() => expect(container.querySelector("path[data-city-id]")).toBeTruthy());
        const el = container.querySelector(`path[data-city="${CSS.escape(target)}"]`)!;
        expect(el.getAttribute("aria-pressed")).toBe("true");
    });

    it("shows a hover tooltip with municipality name + IBGE code", async () => {
        const { container } = render(<BrazilStateMap uf="AC" />);
        await waitFor(() => expect(container.querySelector("path[data-city-id]")).toBeTruthy());

        const path = container.querySelector("path[data-city-id]")!;
        const name = path.getAttribute("data-city")!;
        const id = path.getAttribute("data-city-id")!;
        fireEvent.mouseMove(path);

        const tip = await screen.findByTestId("map-tooltip");
        expect(tip).toHaveTextContent(name);
        expect(tip).toHaveTextContent(`IBGE ${id}`);
    });
});
