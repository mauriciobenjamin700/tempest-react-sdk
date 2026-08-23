import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MunicipalitySearch } from "./MunicipalitySearch";

describe("MunicipalitySearch", () => {
    it("shows debounced results and fires onSelect on pick", async () => {
        const onSelect = vi.fn();
        render(<MunicipalitySearch uf="SP" onSelect={onSelect} debounceMs={0} label="Município" />);

        await userEvent.type(screen.getByLabelText("Município"), "santos");
        const option = await screen.findByRole("option", { name: /Santos/i });
        await userEvent.click(option);

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0]).toMatchObject({ name: "Santos", uf: "SP" });
    });

    it("shows no list for an empty query", async () => {
        render(<MunicipalitySearch onSelect={() => {}} label="Município" debounceMs={0} />);
        await userEvent.type(screen.getByLabelText("Município"), "zzzznotacity");
        await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
    });

    it("closes the list on blur, but not before a click on a result lands", async () => {
        const onSelect = vi.fn();
        render(<MunicipalitySearch uf="SP" onSelect={onSelect} debounceMs={0} label="Município" />);

        const input = screen.getByLabelText("Município");
        await userEvent.type(input, "santos");
        await screen.findByRole("option", { name: /Santos/i });

        await userEvent.tab();
        await waitFor(() => expect(screen.queryByRole("option")).toBeNull());

        await userEvent.click(input);
        const option = await screen.findByRole("option", { name: /Santos/i });
        await userEvent.click(option);

        expect(onSelect).toHaveBeenCalledTimes(1);
    });
});
