import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import type { ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    it("writes the default tone attribute the restore rules are scoped to", () => {
        const { container } = render(
            <Section tone="inverse">
                <Section tone="default" aria-label="Contato" />
            </Section>,
        );
        const inner = container.querySelectorAll("section")[1];
        expect(inner?.getAttribute("data-tempest-tone")).toBe("default");
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

/**
 * Renders `element` to HTML the way a server would, mounts that HTML and
 * hydrates it, returning the section attributes before and after the effects
 * plus every `console.error` React raised on the way (a hydration mismatch is
 * reported there).
 */
async function serverThenHydrate(element: ReactElement): Promise<{
    html: string;
    container: HTMLDivElement;
    errors: unknown[][];
    unmount: () => void;
}> {
    const html = renderToString(element);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
        root = hydrateRoot(container, element, {
            onRecoverableError: (error) => console.error(error),
        });
    });
    const errors = spy.mock.calls.map((call) => [...call]);
    spy.mockRestore();
    return {
        html,
        container,
        errors,
        unmount: () => {
            act(() => root?.unmount());
            container.remove();
        },
    };
}

function sectionTags(html: string): string[] {
    return html.match(/<section[^>]*>/g) ?? [];
}

describe("Section rendered on the server", () => {
    const cleanups: (() => void)[] = [];
    afterEach(() => {
        cleanups.splice(0).forEach((cleanup) => cleanup());
    });

    it("writes aria-labelledby in the server HTML, pointing at the heading id", () => {
        const html = renderToString(
            <Section tone="inverse">
                <SectionHeader title="T" eyebrow="E" />
            </Section>,
        );
        const labelledBy = /<section[^>]*aria-labelledby="([^"]+)"/.exec(html)?.[1];
        expect(labelledBy).toBeDefined();
        expect(html).toContain(`<h2 id="${labelledBy}"`);
    });

    it("hydrates without a warning and without touching the attribute", async () => {
        const element = (
            <main>
                <Section>
                    <SectionHeader eyebrow="Soluções" title="Planos" />
                    <p>conteúdo</p>
                </Section>
            </main>
        );
        const run = await serverThenHydrate(element);
        cleanups.push(run.unmount);
        const serverAttr = /aria-labelledby="([^"]+)"/.exec(run.html)?.[1];
        expect(serverAttr).toBeDefined();
        const section = run.container.querySelector("section");
        expect(run.errors).toEqual([]);
        expect(section).toHaveAttribute("aria-labelledby", serverAttr);
        expect(screen.getByRole("region", { name: "Planos" })).toBe(section);
    });

    it("gives the section id to the first titled header in render order, not to the second", () => {
        const html = renderToString(
            <Section>
                <SectionHeader eyebrow="sem título" />
                <div>
                    <SectionHeader title="Primeiro" />
                </div>
                <SectionHeader title="Segundo" />
            </Section>,
        );
        const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
        expect(labelledBy).toBeDefined();
        expect(html).toMatch(new RegExp(`<h2 id="${labelledBy}"[^>]*>Primeiro</h2>`));
        expect(html.match(new RegExp(`id="${labelledBy}"`, "g"))).toHaveLength(1);
    });

    it("keeps the same name through hydration when two headers share a section", async () => {
        const run = await serverThenHydrate(
            <Section>
                <SectionHeader title="Primeiro" />
                <SectionHeader title="Segundo" />
            </Section>,
        );
        cleanups.push(run.unmount);
        const serverAttr = /aria-labelledby="([^"]+)"/.exec(run.html)?.[1];
        expect(serverAttr).toBeDefined();
        expect(run.errors).toEqual([]);
        expect(screen.getByRole("region", { name: "Primeiro" })).toHaveAttribute(
            "aria-labelledby",
            serverAttr,
        );
    });

    it("names each nested section after its own header in the server HTML", () => {
        const html = renderToString(
            <Section>
                <SectionHeader title="Externa" />
                <Section>
                    <SectionHeader title="Interna" level={3} />
                </Section>
            </Section>,
        );
        const [outer, inner] = sectionTags(html).map(
            (tag) => /aria-labelledby="([^"]+)"/.exec(tag)?.[1],
        );
        expect(outer).toBeDefined();
        expect(outer).not.toBe(inner);
        expect(html).toMatch(new RegExp(`<h2 id="${outer}"[^>]*>Externa</h2>`));
        expect(html).toMatch(new RegExp(`<h3 id="${inner}"[^>]*>Interna</h3>`));
    });

    it("keeps the caller's aria-label in the server HTML", () => {
        const [tag] = sectionTags(
            renderToString(
                <Section aria-label="Manual">
                    <SectionHeader title="Ignorado" />
                </Section>,
            ),
        );
        expect(tag).toContain('aria-label="Manual"');
        expect(tag).not.toContain("aria-labelledby");
    });

    it("drops the server attribute on hydration when no header has a title", async () => {
        const run = await serverThenHydrate(
            <Section>
                <SectionHeader eyebrow="só eyebrow" />
            </Section>,
        );
        cleanups.push(run.unmount);
        expect(run.errors).toEqual([]);
        expect(run.container.querySelector("section")).not.toHaveAttribute("aria-labelledby");
    });

    it("moves to the explicit heading id on hydration, without a warning", async () => {
        const run = await serverThenHydrate(
            <Section>
                <SectionHeader id="planos" title="Planos" />
            </Section>,
        );
        cleanups.push(run.unmount);
        expect(run.errors).toEqual([]);
        expect(screen.getByRole("region", { name: "Planos" })).toHaveAttribute(
            "aria-labelledby",
            "planos",
        );
    });
});

describe("Section under StrictMode", () => {
    it("names the section after the first header and keeps the ids unique", () => {
        const { container } = render(
            <StrictMode>
                <Section>
                    <SectionHeader title="Primeiro" />
                    <SectionHeader title="Segundo" />
                </Section>
            </StrictMode>,
        );
        expect(screen.getByRole("region", { name: "Primeiro" })).toBeInTheDocument();
        const [first, second] = container.querySelectorAll("h2");
        expect(first?.id).not.toBe(second?.id);
    });
});
