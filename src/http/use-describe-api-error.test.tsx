import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { I18nProvider } from "../i18n/I18nProvider";
import { DEFAULT_API_ERROR_STRINGS } from "./describe-api-error";
import { TempestApiError } from "./errors";
import { useDescribeApiError } from "./use-describe-api-error";

const OFFLINE = new TempestApiError({ status: 0, detail: "Network request failed" });

const withCatalog =
    (messages: Record<string, Record<string, string>>, locale = "en") =>
    ({ children }: { children: ReactNode }) => (
        <I18nProvider locale={locale} messages={messages} storageKey={null}>
            {children}
        </I18nProvider>
    );

describe("useDescribeApiError", () => {
    it("works with no provider at all, since i18n is opt-in", () => {
        const { result } = renderHook(() => useDescribeApiError());
        expect(result.current(OFFLINE, "fallback")).toBe(DEFAULT_API_ERROR_STRINGS.offline);
    });

    it("uses the catalog sentence when the key is defined", () => {
        const { result } = renderHook(() => useDescribeApiError(), {
            wrapper: withCatalog({
                en: { "tempest.error.offline": "You appear to be offline." },
            }),
        });
        expect(result.current(OFFLINE, "fallback")).toBe("You appear to be offline.");
    });

    it("falls back to the default instead of printing the raw key", () => {
        const { result } = renderHook(() => useDescribeApiError(), {
            wrapper: withCatalog({ en: { "other.key": "x" } }),
        });
        expect(result.current(OFFLINE, "fallback")).toBe(DEFAULT_API_ERROR_STRINGS.offline);
    });

    it("runs the same funnel as the pure function for everything else", () => {
        const { result } = renderHook(() => useDescribeApiError(), {
            wrapper: withCatalog({ en: { "tempest.error.offline": "Offline." } }),
        });
        const error = new TempestApiError({ status: 422, detail: "CPF já cadastrado" });
        expect(result.current(error, "fallback")).toBe("CPF já cadastrado");
        expect(result.current(new TempestApiError({ status: 500, detail: "Erro 500" }), "F")).toBe(
            "F (HTTP 500)",
        );
    });

    it("keeps the same function identity across renders", () => {
        const { result, rerender } = renderHook(() => useDescribeApiError());
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });
});
