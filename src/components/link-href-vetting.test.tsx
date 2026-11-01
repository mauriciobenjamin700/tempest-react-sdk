import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vettedHref } from "@/utils/safe-url";
import { AuthPage } from "./AuthPage";
import { ForgotPasswordForm, LoginForm } from "./AuthForm";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "./Button";
import { NavigationMenu } from "./NavigationMenu";
import { Sidebar } from "./Sidebar";

/** Every scheme form the browser would run, as an app could receive it from an API. */
const SCRIPT_URLS = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
];

/**
 * Every `href` currently in the document.
 *
 * React 19 replaces a `javascript:` href with its own `javascript:throw …` stub and
 * React 18 writes it verbatim, so the assertion is on the attribute, not on what
 * clicking would do: neither form may reach the DOM.
 *
 * @param container - The rendered tree.
 * @returns The `href` attribute of each element that has one.
 */
function hrefsIn(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("[href]")).map(
        (element) => element.getAttribute("href") ?? "",
    );
}

describe("vettedHref", () => {
    it("returns the URL exactly as given when its scheme is allowed, spaces included", () => {
        expect(vettedHref("/arquivos/relatório final")).toBe("/arquivos/relatório final");
        expect(vettedHref("https://x.dev/a")).toBe("https://x.dev/a");
        expect(vettedHref("mailto:a@b.c")).toBe("mailto:a@b.c");
    });

    it("drops every smuggled javascript: form and a data: URL", () => {
        for (const url of [...SCRIPT_URLS, "data:text/html,<script>1</script>"]) {
            expect(vettedHref(url)).toBeUndefined();
        }
        expect(vettedHref(undefined)).toBeUndefined();
    });
});

describe("navigation props never put a script URL in an href", () => {
    beforeEach(() => {
        vi.stubGlobal("matchMedia", (query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each(SCRIPT_URLS)("Button renders %j as an inert, aria-disabled link", (url) => {
        const onClick = vi.fn();
        const { container } = render(
            <Button href={url} onClick={onClick}>
                Abrir
            </Button>,
        );
        const link = screen.getByText("Abrir").closest("a");
        expect(hrefsIn(container)).toEqual([]);
        expect(link).toHaveAttribute("aria-disabled", "true");
        link?.click();
        expect(onClick).not.toHaveBeenCalled();
    });

    it("Button keeps a safe href untouched", () => {
        render(<Button href="/planos?x=1 2">Planos</Button>);
        expect(screen.getByRole("link", { name: "Planos" })).toHaveAttribute(
            "href",
            "/planos?x=1 2",
        );
    });

    it.each(SCRIPT_URLS)("Breadcrumbs renders an item with %j as text", (url) => {
        const { container } = render(
            <Breadcrumbs items={[{ label: "Pasta", href: url }, { label: "Atual" }]} />,
        );
        expect(hrefsIn(container)).toEqual([]);
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("Breadcrumbs keeps the onClick of an item whose href was dropped", () => {
        const onClick = vi.fn();
        render(
            <Breadcrumbs
                items={[
                    { label: "Pasta", href: "javascript:alert(1)", onClick },
                    { label: "Atual" },
                ]}
            />,
        );
        screen.getByText("Pasta").click();
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it.each(SCRIPT_URLS)("NavigationMenu renders a leaf with %j as a button", (url) => {
        const { container } = render(<NavigationMenu items={[{ label: "Início", href: url }]} />);
        expect(hrefsIn(container)).toEqual([]);
        expect(screen.getByText("Início").tagName).toBe("BUTTON");
    });

    it.each(SCRIPT_URLS)("Sidebar renders an entry with %j as a button", (url) => {
        const { container } = render(
            <Sidebar items={[{ key: "home", label: "Início", href: url }]} />,
        );
        expect(hrefsIn(container)).toEqual([]);
        expect(screen.getByText("Início").closest("button")).not.toBeNull();
    });

    it.each(SCRIPT_URLS)(
        "LoginForm drops the forgot-password and sign-up links set to %j",
        (url) => {
            const { container } = render(
                <MemoryRouter>
                    <LoginForm onSubmit={vi.fn()} links={{ forgotPassword: url, signUp: url }} />
                </MemoryRouter>,
            );
            expect(hrefsIn(container)).toEqual([]);
            expect(screen.queryByText("Esqueceu a senha?")).toBeNull();
            expect(screen.queryByText("Não tem uma conta?")).toBeNull();
        },
    );

    it("ForgotPasswordForm still renders a safe sign-in link", () => {
        render(
            <MemoryRouter>
                <ForgotPasswordForm onSubmit={vi.fn()} links={{ signIn: "/login" }} />
            </MemoryRouter>,
        );
        expect(screen.getByRole("link")).toHaveAttribute("href", "/login");
    });

    it.each(SCRIPT_URLS)("AuthPage hides a back action whose only destination is %j", (url) => {
        const { container } = render(
            <MemoryRouter>
                <AuthPage variant="card" back={url} title="Entrar" />
            </MemoryRouter>,
        );
        expect(hrefsIn(container)).toEqual([]);
        expect(screen.queryByText("Voltar")).toBeNull();
    });

    it("AuthPage falls back to the button when the route is dropped but onClick is set", () => {
        const onClick = vi.fn();
        render(
            <MemoryRouter>
                <AuthPage
                    variant="card"
                    back={{ to: "javascript:alert(1)", onClick }}
                    title="Entrar"
                />
            </MemoryRouter>,
        );
        const back = screen.getByRole("button", { name: "Voltar" });
        back.click();
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
