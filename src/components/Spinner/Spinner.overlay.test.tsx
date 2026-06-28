import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner caption / overlay", () => {
    it("renders a visible caption with role=status", () => {
        render(<Spinner caption="Carregando…" label="Loading" />);
        const status = screen.getByRole("status");
        expect(status).toHaveAttribute("aria-label", "Loading");
        expect(screen.getByText("Carregando…")).toBeInTheDocument();
    });

    it("overlay still exposes role=status", () => {
        render(<Spinner overlay caption="Aguarde" />);
        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(screen.getByText("Aguarde")).toBeInTheDocument();
    });

    it("bare spinner (no caption/overlay) stays a single status node", () => {
        render(<Spinner />);
        const status = screen.getByRole("status");
        expect(status.tagName).toBe("SPAN");
        expect(status).toHaveAttribute("aria-label", "Carregando");
    });
});
