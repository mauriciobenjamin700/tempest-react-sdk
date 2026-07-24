import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "./Progress";

describe("Progress", () => {
    it("sets aria-valuenow when determinate", () => {
        render(<Progress value={42} />);
        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-valuenow", "42");
    });

    it("omits aria-valuenow when indeterminate", () => {
        render(<Progress indeterminate />);
        const bar = screen.getByRole("progressbar");
        expect(bar).not.toHaveAttribute("aria-valuenow");
    });

    it("renders the percentage label when showLabel", () => {
        render(<Progress value={50} showLabel />);
        expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("names the bar from the visible label", () => {
        render(<Progress value={10} label="Enviando arquivo" />);
        expect(screen.getByRole("progressbar", { name: "Enviando arquivo" })).toBeInTheDocument();
    });

    it("prefers an explicit aria-label over the visible label", () => {
        render(<Progress value={10} label="Enviando" aria-label="Upload do anexo" />);
        expect(screen.getByRole("progressbar", { name: "Upload do anexo" })).toBeInTheDocument();
    });

    it("defers to aria-labelledby when given", () => {
        render(
            <>
                <span id="pg-name">Sincronizando</span>
                <Progress value={10} label="Enviando" aria-labelledby="pg-name" />
            </>,
        );
        const bar = screen.getByRole("progressbar", { name: "Sincronizando" });
        expect(bar).not.toHaveAttribute("aria-label");
    });
});
