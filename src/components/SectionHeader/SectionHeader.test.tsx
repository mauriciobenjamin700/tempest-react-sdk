import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import { Section, SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
    it("renders the title as an h2 by default", () => {
        render(<SectionHeader title="Planos" />);
        expect(screen.getByRole("heading", { level: 2, name: "Planos" })).toBeInTheDocument();
    });

    it.each([1, 3, 6] as const)("lets level %i pick the heading tag", (level) => {
        render(<SectionHeader title="Planos" level={level} />);
        expect(screen.getByRole("heading", { level, name: "Planos" })).toBeInTheDocument();
    });

    it("renders eyebrow, description and actions", () => {
        render(
            <SectionHeader
                eyebrow="Soluções"
                title="O que fazemos"
                description="Do protótipo à produção"
                actions={<button>Falar</button>}
            />,
        );
        expect(screen.getByText("Soluções")).toBeInTheDocument();
        expect(screen.getByText("Do protótipo à produção")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Falar" })).toBeInTheDocument();
    });

    it("puts the given id on the heading, not on the header", () => {
        const { container } = render(<SectionHeader id="planos" title="Planos" />);
        expect(screen.getByRole("heading").id).toBe("planos");
        expect(container.querySelector("header")?.id).toBe("");
    });

    it("generates a heading id when none is given", () => {
        render(<SectionHeader title="Planos" />);
        expect(screen.getByRole("heading").id).not.toBe("");
    });

    it("marks the center alignment with its own class", () => {
        const { container, rerender } = render(<SectionHeader title="A" />);
        const startClass = container.querySelector("header")?.className;
        rerender(<SectionHeader title="A" align="center" />);
        expect(container.querySelector("header")?.className).not.toBe(startClass);
    });

    it("renders nothing when every slot is empty", () => {
        const { container } = render(<SectionHeader />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("Section", () => {
    it("exposes a region landmark named after the SectionHeader title", () => {
        render(
            <Section>
                <SectionHeader eyebrow="Soluções" title="O que podemos desenvolver" />
                <p>conteúdo</p>
            </Section>,
        );
        expect(
            screen.getByRole("region", { name: "O que podemos desenvolver" }),
        ).toBeInTheDocument();
    });

    it("links through wrappers between the section and the header", () => {
        render(
            <Section>
                <div>
                    <div>
                        <SectionHeader id="custom" title="Planos" />
                    </div>
                </div>
            </Section>,
        );
        expect(screen.getByRole("region", { name: "Planos" })).toHaveAttribute(
            "aria-labelledby",
            "custom",
        );
    });

    it("names each nested section after its own header", () => {
        render(
            <Section>
                <SectionHeader title="Externa" />
                <Section>
                    <SectionHeader title="Interna" level={3} />
                </Section>
            </Section>,
        );
        expect(screen.getByRole("region", { name: "Externa" })).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Interna" })).toBeInTheDocument();
    });

    it("leaves aria-labelledby off when there is no titled header", () => {
        const { container } = render(
            <Section>
                <SectionHeader eyebrow="só eyebrow" />
            </Section>,
        );
        expect(container.querySelector("section")).not.toHaveAttribute("aria-labelledby");
    });

    it("keeps an explicit aria-label or aria-labelledby from the caller", () => {
        const { container } = render(
            <>
                <Section aria-label="Manual">
                    <SectionHeader title="Ignorado" />
                </Section>
                <span id="outro">Outro</span>
                <Section aria-labelledby="outro">
                    <SectionHeader title="Também ignorado" />
                </Section>
            </>,
        );
        const [first, second] = container.querySelectorAll("section");
        expect(first).not.toHaveAttribute("aria-labelledby");
        expect(first).toHaveAttribute("aria-label", "Manual");
        expect(second).toHaveAttribute("aria-labelledby", "outro");
    });

    it("hands the name to the next header when the first one unmounts", () => {
        function Toggle() {
            const [first, setFirst] = useState(true);
            return (
                <Section>
                    {first && <SectionHeader title="Primeiro" />}
                    <SectionHeader title="Segundo" />
                    <button onClick={() => setFirst(false)}>tirar</button>
                </Section>
            );
        }
        render(<Toggle />);
        expect(screen.getByRole("region", { name: "Primeiro" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "tirar" }));
        expect(screen.getByRole("region", { name: "Segundo" })).toBeInTheDocument();
    });

    it("has no axe violations", async () => {
        const { container } = render(
            <main>
                <Section>
                    <SectionHeader eyebrow="Soluções" title="Planos" description="desc" />
                    <p>conteúdo</p>
                </Section>
            </main>,
        );
        const violations = await findA11yViolations(container);
        expect(violations, formatA11yViolations(violations)).toEqual([]);
    });
});

describe("Section tone", () => {
    it("writes the inverse tone attribute the token block is scoped to", () => {
        const { container } = render(
            <Section tone="inverse">
                <SectionHeader title="Comece agora" />
            </Section>,
        );
        expect(container.querySelector("section")?.getAttribute("data-tempest-tone")).toBe(
            "inverse",
        );
    });

    it("leaves the attribute off without a tone, so the page tokens apply", () => {
        const { container } = render(
            <Section>
                <SectionHeader title="Planos" />
            </Section>,
        );
        expect(container.querySelector("section")?.hasAttribute("data-tempest-tone")).toBe(false);
    });
});
