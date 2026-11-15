import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useHref, useLocation } from "react-router";
import { AppRouter, defineRoutes } from "./AppRouter";
import { RouteGuard } from "./RouteGuard";
import { safeReturnPath, useReturnTo } from "./return-to";

function Login({ fallback }: { fallback?: string }) {
    const returnTo = useReturnTo(fallback);
    return <span data-testid="return-to">{returnTo}</span>;
}

function StateProbe() {
    const state: unknown = useLocation().state;
    return <span data-testid="state">{JSON.stringify(state)}</span>;
}

function renderLoginWithState(state: unknown, fallback?: string) {
    return render(
        <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
            <Routes>
                <Route path="/login" element={<Login fallback={fallback} />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe("RouteGuard preserveFrom", () => {
    it("hands the blocked path, query and hash to the login screen", () => {
        render(
            <MemoryRouter initialEntries={["/secret/42?tab=billing#invoices"]}>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/secret/:id"
                        element={
                            <RouteGuard when={false} redirectTo="/login" preserveFrom>
                                <span>secret</span>
                            </RouteGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );
        expect(screen.getByTestId("return-to")).toHaveTextContent(
            "/secret/42?tab=billing#invoices",
        );
    });

    it("sends no state when preserveFrom is not set, as before", () => {
        render(
            <MemoryRouter initialEntries={["/secret"]}>
                <Routes>
                    <Route path="/login" element={<StateProbe />} />
                    <Route
                        path="/secret"
                        element={
                            <RouteGuard when={false} redirectTo="/login">
                                <span>secret</span>
                            </RouteGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );
        expect(screen.getByTestId("state")).toHaveTextContent("null");
    });

    it("renders allowed children outside any router, so preserveFrom costs nothing when not redirecting", () => {
        render(
            <RouteGuard when preserveFrom>
                <span>secret</span>
            </RouteGuard>,
        );
        expect(screen.getByText("secret")).toBeInTheDocument();
    });

    it("works from the route tree too, so guarded routes and RouteGuard behave alike", () => {
        const routes = defineRoutes([
            { path: "login", element: <Login /> },
            {
                path: "reports",
                element: <span>reports</span>,
                guard: false,
                redirectTo: "/login",
                preserveFrom: true,
            },
        ]);
        render(<AppRouter routes={routes} router="memory" initialEntries={["/reports?y=2026"]} />);
        expect(screen.getByTestId("return-to")).toHaveTextContent("/reports?y=2026");
    });
});

describe("useReturnTo", () => {
    it("falls back when the login page is opened without state", () => {
        renderLoginWithState(null, "/home");
        expect(screen.getByTestId("return-to")).toHaveTextContent("/home");
    });

    it("defaults the fallback to the root", () => {
        renderLoginWithState(undefined);
        expect(screen.getByTestId("return-to")).toHaveTextContent(/^\/$/);
    });

    it("falls back when state has no from", () => {
        renderLoginWithState({ other: 1 }, "/home");
        expect(screen.getByTestId("return-to")).toHaveTextContent("/home");
    });

    it("refuses an absolute URL to another site instead of becoming an open redirect", () => {
        renderLoginWithState({ from: "https://evil.example/phish" }, "/home");
        expect(screen.getByTestId("return-to")).toHaveTextContent("/home");
    });

    it("returns a basename-relative path, which the router resolves under the basename and location.assign would not", () => {
        function LoginThenBack() {
            const returnTo = useReturnTo("/");
            const href = useHref(returnTo);
            return (
                <>
                    <span data-testid="return-to">{returnTo}</span>
                    <span data-testid="href">{href}</span>
                </>
            );
        }
        render(
            <MemoryRouter basename="/app" initialEntries={["/app/secret/42"]}>
                <Routes>
                    <Route path="/login" element={<LoginThenBack />} />
                    <Route
                        path="/secret/:id"
                        element={
                            <RouteGuard when={false} redirectTo="/login" preserveFrom>
                                <span>secret</span>
                            </RouteGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );
        expect(screen.getByTestId("return-to")).toHaveTextContent(/^\/secret\/42$/);
        expect(screen.getByTestId("href")).toHaveTextContent(/^\/app\/secret\/42$/);
    });
});

describe("safeReturnPath", () => {
    it.each([
        "/",
        "/dashboard",
        "/a/b?c=d#e",
        "/arquivos/relatório final",
        "/search?q=https://example.com",
    ])("keeps the same-origin path %s as given", (path) => {
        expect(safeReturnPath(path)).toBe(path);
    });

    it.each([
        ["absolute http URL", "https://evil.example/x"],
        ["protocol-relative URL", "//evil.example/x"],
        ["backslash that parses as protocol-relative", "/\\evil.example/x"],
        ["tab smuggled into the authority", "/\t/evil.example/x"],
        ["newline smuggled into the authority", "/\n/evil.example"],
        ["javascript: scheme", "javascript:alert(1)"],
        ["relative path without leading slash", "dashboard"],
        ["empty string", ""],
    ])("refuses %s", (_label, value) => {
        expect(safeReturnPath(value)).toBeNull();
    });

    it.each([[undefined], [null], [42], [{ pathname: "/x" }]])(
        "refuses the non-string %j",
        (value) => {
            expect(safeReturnPath(value)).toBeNull();
        },
    );
});
