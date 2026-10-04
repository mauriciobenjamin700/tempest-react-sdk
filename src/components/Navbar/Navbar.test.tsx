import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("Navbar — inverse tone", () => {
    const css = readFileSync(join(__dirname, "Navbar.module.css"), "utf8");

    function rule(selector: string): string {
        const start = css.indexOf(`${selector} {`);
        return css.slice(start, css.indexOf("}", start));
    }

    it("writes the inverse tone attribute, so the slots read the inverted tokens", () => {
        const { container } = render(<Navbar tone="inverse" />);
        expect(container.querySelector("header")?.getAttribute("data-tempest-tone")).toBe(
            "inverse",
        );
    });

    it("leaves the attribute off the primary tone, which keeps painting the brand 500", () => {
        const { container } = render(<Navbar tone="primary" />);
        expect(container.querySelector("header")?.hasAttribute("data-tempest-tone")).toBe(false);
    });

    it("keeps the primary fill on --tempest-primary, byte-identical to 0.74.0", () => {
        expect(rule(".navbar.primary")).toContain("background: var(--tempest-primary);");
        expect(rule(".navbar.primary")).toContain("color: var(--tempest-primary-foreground);");
    });

    it("paints the inverse fill from --tempest-bg: inside the scope --tempest-primary is the action color, and the bar measured #ffffff on it", () => {
        const inverse = rule(".navbar.inverse");
        expect(inverse).toContain("background: var(--tempest-bg);");
        expect(inverse).toContain("color: var(--tempest-text);");
        expect(inverse).not.toContain("--tempest-primary");
    });
});
