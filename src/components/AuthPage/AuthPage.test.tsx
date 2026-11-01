import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import { AuthPage } from "./AuthPage";

type Listener = (event: MediaQueryListEvent) => void;

/**
 * Install a `matchMedia` whose answer follows a mutable viewport width.
 *
 * @param initialWidth - Viewport width the page starts at.
 * @returns A function that resizes the fake viewport and notifies listeners.
 */
function mockViewport(initialWidth: number): (width: number) => void {
    let width = initialWidth;
    const lists: { query: string; listeners: Set<Listener> }[] = [];
    const matches = (query: string): boolean => {
        const min = /min-width:\s*(\d+)px/.exec(query);
        return min ? width >= Number(min[1]) : false;
    };
    vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => {
            const entry = { query, listeners: new Set<Listener>() };
            lists.push(entry);
            return {
                get matches() {
                    return matches(query);
                },
                media: query,
                addEventListener: (_type: string, listener: Listener) =>
                    entry.listeners.add(listener),
                removeEventListener: (_type: string, listener: Listener) =>
                    entry.listeners.delete(listener),
            };
        }),
    );
    return (next: number) => {
        width = next;
        for (const entry of lists) {
            for (const listener of entry.listeners) {
                listener({ matches: matches(entry.query) } as MediaQueryListEvent);
            }
        }
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("AuthPage", () => {
    it("is the page's main landmark with the title as a level-1 heading", () => {
        mockViewport(375);
        render(
            <MemoryRouter>
                <AuthPage title="Bem-vindo!" subtitle="Entre com sua conta">
                    <p>form</p>
                </AuthPage>
            </MemoryRouter>,
        );
        expect(screen.getByRole("main")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Bem-vindo!" })).toBeInTheDocument();
        expect(screen.getByText("Entre com sua conta")).toBeInTheDocument();
        expect(screen.getByText("form")).toBeInTheDocument();
    });

    it("renders as a div and at another heading level when nested in a layout", () => {
        mockViewport(375);
        render(
            <MemoryRouter>
                <AuthPage as="div" headingLevel={2} title="Entrar" />
            </MemoryRouter>,
        );
        expect(screen.queryByRole("main")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "Entrar" })).toBeInTheDocument();
    });

    it("stacks below the default 768px breakpoint and splits at it", () => {
        const resize = mockViewport(767);
        render(
            <MemoryRouter>
                <AuthPage title="Bem-vindo!" />
            </MemoryRouter>,
        );
        const root = screen.getByRole("main");
        expect(root).toHaveAttribute("data-layout", "stacked");
        act(() => resize(768));
        expect(root).toHaveAttribute("data-layout", "split");
        act(() => resize(500));
        expect(root).toHaveAttribute("data-layout", "stacked");
    });

    it("honours a custom breakpoint", () => {
        mockViewport(900);
        render(
            <MemoryRouter>
                <AuthPage breakpoint={1024} title="Bem-vindo!" />
            </MemoryRouter>,
        );
        expect(screen.getByRole("main")).toHaveAttribute("data-layout", "stacked");
        expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
    });

    it("renders one centered card at every width in the card variant", () => {
        const resize = mockViewport(1440);
        render(
            <MemoryRouter>
                <AuthPage variant="card" brand={<span>Painel</span>} title="Entrar" />
            </MemoryRouter>,
        );
        const root = screen.getByRole("main");
        expect(root).toHaveAttribute("data-layout", "card");
        expect(screen.getByText("Painel")).toBeInTheDocument();
        act(() => resize(375));
        expect(root).toHaveAttribute("data-layout", "card");
    });

    it("passes the aside background and color as component-scoped properties", () => {
        mockViewport(1280);
        render(
            <MemoryRouter>
                <AuthPage
                    aside={{
                        background: "linear-gradient(#f00, #00f)",
                        color: "#fff",
                        content: <p>Seu app de viagens</p>,
                    }}
                />
            </MemoryRouter>,
        );
        const root = screen.getByRole("main");
        expect(root.style.getPropertyValue("--tempest-auth-page-aside-bg")).toBe(
            "linear-gradient(#f00, #00f)",
        );
        expect(root.style.getPropertyValue("--tempest-auth-page-aside-fg")).toBe("#fff");
        expect(screen.getByText("Seu app de viagens")).toBeInTheDocument();
    });

    it("navigates back through a router link when `back` is a route", () => {
        mockViewport(375);
        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes>
                    <Route path="/" element={<p>home</p>} />
                    <Route path="/login" element={<AuthPage back="/" title="Entrar" />} />
                </Routes>
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole("link", { name: "Voltar" }));
        expect(screen.getByText("home")).toBeInTheDocument();
    });

    it("renders a labelled button when `back` only has a handler", () => {
        mockViewport(375);
        const onClick = vi.fn();
        render(
            <MemoryRouter>
                <AuthPage back={{ label: "Sair", onClick }} />
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole("button", { name: "Sair" }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("puts the back action above the card in the card variant", () => {
        mockViewport(375);
        render(
            <MemoryRouter>
                <AuthPage variant="card" back="/" footer={<span>v1.0</span>} />
            </MemoryRouter>,
        );
        expect(screen.getByRole("link", { name: "Voltar" })).toHaveAttribute("href", "/");
        expect(screen.getByText("v1.0")).toBeInTheDocument();
    });

    it.each(["split", "stacked", "card"] as const)("has no axe violations (%s)", async (mode) => {
        mockViewport(mode === "split" ? 1280 : 375);
        const { container } = render(
            <MemoryRouter>
                <AuthPage
                    variant={mode === "card" ? "card" : "split"}
                    brand={<span>Acme</span>}
                    back="/"
                    title="Bem-vindo!"
                    subtitle="Entre com sua conta"
                    footer={<span>Termos</span>}
                >
                    <button type="button">Entrar</button>
                </AuthPage>
            </MemoryRouter>,
        );
        const violations = await findA11yViolations(container);
        expect(violations, formatA11yViolations(violations)).toEqual([]);
    });
});
