import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
    it("has role=status with default label", () => {
        render(<Spinner />);
        expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Carregando");
    });
});
