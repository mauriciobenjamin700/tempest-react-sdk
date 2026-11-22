import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Alert } from "@/components/Alert";
import { BottomNavigation } from "@/components/BottomNavigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { Pagination } from "@/components/Pagination";
import { SearchBar } from "@/components/SearchBar";
import { Sidebar } from "@/components/Sidebar";
import { Spinner } from "@/components/Spinner";
import { Tag } from "@/components/Tag";
import { I18nProvider } from "./I18nProvider";
import { TEMPEST_MESSAGES } from "./tempest-messages";
import type { Catalog } from "./create-i18n";

/**
 * Render under an `I18nProvider` with nothing persisted.
 *
 * @param locale - Active locale.
 * @param ui - What to render.
 * @param messages - The app's catalog.
 * @returns The render result.
 */
function inLocale(locale: string, ui: ReactNode, messages: Catalog = { [locale]: {} }) {
    return render(
        <I18nProvider locale={locale} messages={messages} storageKey={null}>
            {ui}
        </I18nProvider>,
    );
}

describe("TEMPEST_MESSAGES", () => {
    it("ships the same keys in pt-BR and en", () => {
        expect(Object.keys(TEMPEST_MESSAGES.en).sort()).toEqual(
            Object.keys(TEMPEST_MESSAGES["pt-BR"]).sort(),
        );
    });
});

describe("component default texts (#746)", () => {
    it("keeps the pt-BR defaults with no provider", () => {
        render(<ErrorState onRetry={() => undefined} />);
        expect(screen.getByText("Algo deu errado")).toBeInTheDocument();
        expect(
            screen.getByText("Não foi possível carregar essas informações."),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    });

    it("speaks English under an en provider with no SDK keys in the catalog", () => {
        inLocale("en", <ErrorState onRetry={() => undefined} />, { en: { hello: "Hello" } });
        expect(screen.getByText("Something went wrong")).toBeInTheDocument();
        expect(screen.getByText("We couldn't load this information.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("treats a regional en locale as English", () => {
        inLocale("en-US", <Spinner />);
        expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
    });

    it("lets the app catalog override a default under the same key", () => {
        inLocale("es", <ErrorState onRetry={() => undefined} />, {
            es: { "tempest.errorState.retry": "Reintentar" },
        });
        expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
        expect(screen.getByText("Algo deu errado")).toBeInTheDocument();
    });

    it("keeps an explicit prop over every catalog", () => {
        inLocale(
            "en",
            <ErrorState title="Falhou" retryLabel="De novo" onRetry={() => undefined} />,
        );
        expect(screen.getByText("Falhou")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "De novo" })).toBeInTheDocument();
    });

    it("keeps description={null} as no description", () => {
        const { container } = inLocale("en", <ErrorState description={null} />);
        expect(container.querySelector("p")).toBeNull();
    });

    it("translates the confirm dialog buttons", () => {
        inLocale(
            "en",
            <ConfirmDialog
                open
                title="Excluir?"
                onConfirm={() => undefined}
                onCancel={() => undefined}
            />,
        );
        expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("translates the pagination summary, plural and controls", () => {
        const { rerender } = inLocale(
            "en",
            <Pagination
                page={2}
                totalPages={5}
                onPageChange={() => undefined}
                pageSize={10}
                onPageSizeChange={() => undefined}
            />,
        );
        expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Previous page" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next page" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Items per page" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "10 / page" })).toBeInTheDocument();
        rerender(
            <I18nProvider locale="en" messages={{ en: {} }} storageKey={null}>
                <Pagination page={1} totalPages={5} totalItems={1} onPageChange={() => undefined} />
            </I18nProvider>,
        );
        expect(screen.getByText("1 result")).toBeInTheDocument();
    });

    it("keeps the pt-BR pagination plural with no provider", () => {
        render(
            <Pagination page={1} totalPages={3} totalItems={42} onPageChange={() => undefined} />,
        );
        expect(screen.getByText("42 resultados")).toBeInTheDocument();
    });

    it("names the navigation landmarks in the active language", () => {
        inLocale(
            "en",
            <>
                <BottomNavigation items={[{ key: "a", label: "A" }]} value="a" />
                <Sidebar items={[{ key: "b", label: "B" }]} value="b" />
            </>,
        );
        expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "Side navigation" })).toBeInTheDocument();
    });

    it("lets aria-label replace the bottom navigation's landmark name", () => {
        inLocale(
            "en",
            <BottomNavigation aria-label="Abas" items={[{ key: "a", label: "A" }]} value="a" />,
        );
        expect(screen.getByRole("navigation", { name: "Abas" })).toBeInTheDocument();
    });

    it("translates the close, remove and clear buttons", () => {
        inLocale(
            "en",
            <>
                <Alert onClose={() => undefined}>Aviso</Alert>
                <Tag onRemove={() => undefined}>Tag</Tag>
                <SearchBar value="x" onChange={() => undefined} />
            </>,
        );
        expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
    });
});
