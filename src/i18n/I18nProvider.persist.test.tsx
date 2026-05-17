import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./I18nProvider";

const messages = {
    "pt-BR": { hi: "Olá" },
    en: { hi: "Hi" },
};

describe("I18nProvider persistence", () => {
    afterEach(() => window.localStorage.clear());

    it("reads stored locale on mount", () => {
        window.localStorage.setItem("loc", "en");
        const wrapper = ({ children }: { children: ReactNode }) => (
            <I18nProvider locale="pt-BR" messages={messages} storageKey="loc">
                {children}
            </I18nProvider>
        );
        const { result } = renderHook(() => useI18n(), { wrapper });
        expect(result.current.locale).toBe("en");
    });

    it("ignores stored locale not present in messages", () => {
        window.localStorage.setItem("loc", "ru");
        const wrapper = ({ children }: { children: ReactNode }) => (
            <I18nProvider locale="pt-BR" messages={messages} storageKey="loc">
                {children}
            </I18nProvider>
        );
        const { result } = renderHook(() => useI18n(), { wrapper });
        expect(result.current.locale).toBe("pt-BR");
    });

    it("setLocale persists when storageKey is set", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <I18nProvider locale="pt-BR" messages={messages} storageKey="loc2">
                {children}
            </I18nProvider>
        );
        const { result } = renderHook(() => useI18n(), { wrapper });
        act(() => result.current.setLocale("en"));
        expect(window.localStorage.getItem("loc2")).toBe("en");
    });

    it("sets html lang attribute", () => {
        render(
            <I18nProvider locale="en" messages={messages} storageKey={null}>
                <span />
            </I18nProvider>,
        );
        expect(document.documentElement.getAttribute("lang")).toBe("en");
    });
});
