import { render, screen } from "@testing-library/react";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "./QueryProvider";
import { resetForeignClientWarning } from "./foreign-client-warning";

function Sample() {
    const query = useQuery({ queryKey: ["x"], queryFn: () => Promise.resolve("ok") });
    return <span>{query.data ?? "loading"}</span>;
}

describe("QueryProvider", () => {
    it("wraps children with QueryClient", async () => {
        render(
            <QueryProvider>
                <Sample />
            </QueryProvider>,
        );
        await screen.findByText("ok");
    });
});

/**
 * The `client` prop is where the app's copy of react-query and the SDK's copy
 * touch, and a client from the other copy duck-types perfectly while failing
 * `instanceof`. Without the warning the app sees `No QueryClient set` thrown by
 * a `useQuery` sitting under a provider it can see mounted.
 */
describe("QueryProvider — a client from another copy of react-query", () => {
    afterEach(() => {
        resetForeignClientWarning();
        vi.restoreAllMocks();
    });

    /** Everything the check duck-types on, none of the real class identity. */
    const foreignClient = () =>
        ({
            getQueryCache: () => ({}),
            mount: () => {},
            unmount: () => {},
            getDefaultOptions: () => ({}),
            setDefaultOptions: () => {},
        }) as unknown as QueryClient;

    it("warns, naming the error the app would otherwise chase", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        render(
            <QueryProvider client={foreignClient()}>
                <span>child</span>
            </QueryProvider>,
        );
        expect(warn).toHaveBeenCalledTimes(1);
        const [message] = warn.mock.calls[0] as [string];
        expect(message).toMatch(/different copy of @tanstack\/react-query/);
        expect(message).toMatch(/No QueryClient set/);
        expect(message).toMatch(/npm dedupe/);
    });

    it("warns once, so a re-render does not bury the console", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const client = foreignClient();
        const { rerender } = render(
            <QueryProvider client={client}>
                <span>a</span>
            </QueryProvider>,
        );
        rerender(
            <QueryProvider client={client}>
                <span>b</span>
            </QueryProvider>,
        );
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("stays quiet for a real client, which is the whole point of instanceof", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        render(
            <QueryProvider client={new QueryClient()}>
                <span>child</span>
            </QueryProvider>,
        );
        expect(warn).not.toHaveBeenCalled();
    });

    it("stays quiet when no client is passed at all", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        render(
            <QueryProvider>
                <span>child</span>
            </QueryProvider>,
        );
        expect(warn).not.toHaveBeenCalled();
    });

    /**
     * The duck-type guard runs before the warning for exactly this: an object that
     * is not a client at all is not a second copy, and blaming `node_modules` for
     * it would send the reader somewhere there is nothing to find.
     *
     * The render itself throws — `QueryClientProvider` calls `client.mount()` and a
     * bare object has none — which is the correct outcome and not what is under
     * test here. What is under test is that the SDK stayed quiet and let
     * react-query's own error stand.
     */
    it("stays quiet for an object that is not a client at all", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() =>
            render(
                <QueryProvider client={{} as unknown as QueryClient}>
                    <span>child</span>
                </QueryProvider>,
            ),
        ).toThrow();
        expect(warn).not.toHaveBeenCalled();
    });
});
