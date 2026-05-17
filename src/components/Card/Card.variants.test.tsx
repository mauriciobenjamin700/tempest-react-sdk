import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card — elevation + interactive + footer", () => {
    const elevations = ["flat", "default", "raised", "elevated"] as const;

    it.each(elevations)("renders elevation=%s", (elevation) => {
        const { container } = render(<Card elevation={elevation}>x</Card>);
        const el = container.firstChild as HTMLElement;
        if (elevation === "flat") expect(el.className).toContain("flat");
        if (elevation === "raised") expect(el.className).toContain("raised");
        if (elevation === "elevated") expect(el.className).toContain("elevated");
    });

    it("interactive adds class and tabIndex=0", () => {
        const { container } = render(<Card interactive>x</Card>);
        const el = container.firstChild as HTMLElement;
        expect(el.className).toContain("interactive");
        expect(el.tabIndex).toBe(0);
    });

    it("renders footer slot", () => {
        render(<Card footer={<span>actions</span>}>body</Card>);
        expect(screen.getByText("actions")).toBeInTheDocument();
        expect(screen.getByText("body")).toBeInTheDocument();
    });
});
