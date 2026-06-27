import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { AppProviders } from "./AppProviders";
import { useI18n } from "../i18n/I18nProvider";

function QueryProbe() {
    const client = useQueryClient();
    return <span>query:{client ? "ok" : "no"}</span>;
}

function LocaleProbe() {
    const { locale } = useI18n();
    return <span>locale:{locale}</span>;
}

describe("AppProviders", () => {
    beforeAll(() => {
        // The default-on ThemeProvider reads matchMedia for "system"; jsdom
        // leaves it undefined, so provide a stub.
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: () => undefined,
                removeListener: () => undefined,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
                dispatchEvent: () => false,
            }),
        });
    });

    it("mounts QueryProvider by default", () => {
        render(
            <AppProviders>
                <QueryProbe />
            </AppProviders>,
        );
        expect(screen.getByText("query:ok")).toBeInTheDocument();
    });

    it("mounts i18n when configured", () => {
        render(
            <AppProviders i18n={{ locale: "pt-BR", messages: { "pt-BR": {} } }}>
                <LocaleProbe />
            </AppProviders>,
        );
        expect(screen.getByText("locale:pt-BR")).toBeInTheDocument();
    });

    it("renders children plainly when query and theme are disabled", () => {
        render(
            <AppProviders query={false} theme={false}>
                <span>bare</span>
            </AppProviders>,
        );
        expect(screen.getByText("bare")).toBeInTheDocument();
    });

    it("catches render errors with the configured error boundary", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        function Boom(): never {
            throw new Error("boom");
        }
        render(
            <AppProviders errorBoundary={{ fallback: <span>crashed</span> }}>
                <Boom />
            </AppProviders>,
        );
        expect(screen.getByText("crashed")).toBeInTheDocument();
        spy.mockRestore();
    });
});
