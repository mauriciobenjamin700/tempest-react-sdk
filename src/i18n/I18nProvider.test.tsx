import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n, useTranslate } from "./I18nProvider";

const messages = {
    en: { hello: "Hi, {name}" },
    "pt-BR": { hello: "Olá, {name}" },
};

function wrapper({ children }: { children: ReactNode }) {
    return (
        <I18nProvider locale="pt-BR" fallbackLocale="en" messages={messages} storageKey={null}>
            {children}
        </I18nProvider>
    );
}

describe("I18nProvider + useI18n", () => {
    it("provides translation helpers", () => {
        const { result } = renderHook(() => useI18n(), { wrapper });
        expect(result.current.t("hello", { name: "Mau" })).toBe("Olá, Mau");
    });

    it("switches locale", () => {
        const { result } = renderHook(() => useI18n(), { wrapper });
        act(() => result.current.setLocale("en"));
        expect(result.current.t("hello", { name: "Mau" })).toBe("Hi, Mau");
    });

    it("useTranslate returns the t function", () => {
        function Sample() {
            const t = useTranslate();
            return <span>{t("hello", { name: "Tempest" })}</span>;
        }
        render(
            <I18nProvider locale="pt-BR" messages={messages} storageKey={null}>
                <Sample />
            </I18nProvider>,
        );
        expect(screen.getByText("Olá, Tempest")).toBeInTheDocument();
    });

    it("throws outside provider", () => {
        expect(() => renderHook(() => useI18n())).toThrow();
    });
});
