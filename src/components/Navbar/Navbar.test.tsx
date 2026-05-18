import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Navbar } from "./Navbar";

describe("Navbar", () => {
    it("renders all three slots", () => {
        render(
            <Navbar logo={<span>LOGO</span>} nav={<span>NAV</span>} actions={<span>ACT</span>} />,
        );
        expect(screen.getByText("LOGO")).toBeInTheDocument();
        expect(screen.getByText("NAV")).toBeInTheDocument();
        expect(screen.getByText("ACT")).toBeInTheDocument();
    });

    it("renders a <header> element with role banner", () => {
        const { container } = render(<Navbar logo={<span>x</span>} />);
        expect(container.querySelector("header")).not.toBeNull();
    });

    it("applies sticky class by default", () => {
        const { container } = render(<Navbar />);
        expect((container.firstElementChild as HTMLElement).className).toMatch(/sticky/);
    });

    it("applies tone class", () => {
        const { container } = render(<Navbar tone="primary" />);
        expect((container.firstElementChild as HTMLElement).className).toMatch(/primary/);
    });
});
