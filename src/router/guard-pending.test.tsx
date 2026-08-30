import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "react-router";
import { AppRouter, defineRoutes } from "./AppRouter";
import { AccessControlProvider } from "@/access/access-control-context";
import { useCan } from "@/access/use-can";

describe("guard: pending", () => {
    it("renders the route fallback instead of deciding", () => {
        const routes = defineRoutes([
            {
                path: "/finance",
                element: <span>finance</span>,
                guard: () => "pending",
                guardFallback: <span>checking</span>,
                redirectTo: "/",
            },
            { path: "/", element: <span>home</span> },
        ]);

        render(<AppRouter routes={routes} router="memory" initialEntries={["/finance"]} />);

        expect(screen.getByText("checking")).toBeInTheDocument();
        expect(screen.queryByText("home")).not.toBeInTheDocument();
        expect(screen.queryByText("finance")).not.toBeInTheDocument();
    });

    it("falls back to the AppRouter fallback, so one spinner covers lazy and pending", () => {
        const routes = defineRoutes([
            {
                path: "/finance",
                element: <span>finance</span>,
                guard: () => "pending",
                redirectTo: "/",
            },
        ]);

        render(
            <AppRouter
                routes={routes}
                router="memory"
                initialEntries={["/finance"]}
                fallback={<span>loading</span>}
            />,
        );

        expect(screen.getByText("loading")).toBeInTheDocument();
    });

    it("lets the route override the AppRouter fallback", () => {
        const routes = defineRoutes([
            {
                path: "/finance",
                element: <span>finance</span>,
                guard: () => "pending",
                guardFallback: <span>checking permission</span>,
                redirectTo: "/",
            },
        ]);

        render(
            <AppRouter
                routes={routes}
                router="memory"
                initialEntries={["/finance"]}
                fallback={<span>loading</span>}
            />,
        );

        expect(screen.getByText("checking permission")).toBeInTheDocument();
        expect(screen.queryByText("loading")).not.toBeInTheDocument();
    });

    it("still redirects on false and still renders on true", () => {
        const routes = defineRoutes([
            { path: "/", element: <span>home</span> },
            { path: "/open", element: <span>open</span>, guard: true },
            { path: "/shut", element: <span>shut</span>, guard: false, redirectTo: "/" },
        ]);

        const { unmount } = render(
            <AppRouter routes={routes} router="memory" initialEntries={["/open"]} />,
        );
        expect(screen.getByText("open")).toBeInTheDocument();
        unmount();

        render(<AppRouter routes={routes} router="memory" initialEntries={["/shut"]} />);
        expect(screen.getByText("home")).toBeInTheDocument();
    });
});

describe("guard: hooks", () => {
    it("resolves a useCan permission without flashing a redirect at someone who has it", async () => {
        let grant: (allowed: boolean) => void = () => {};
        const pendingCheck = new Promise<boolean>((resolve) => {
            grant = resolve;
        });

        const routes = defineRoutes([
            { path: "/", element: <span>home</span> },
            {
                path: "/finance",
                element: <span>finance</span>,
                redirectTo: "/",
                guardFallback: <span>checking</span>,
                guard: function useFinanceGuard() {
                    const { allowed, isLoading } = useCan({ action: "read", resource: "finance" });
                    return isLoading ? "pending" : allowed;
                },
            },
        ]);

        render(
            <AccessControlProvider control={{ can: () => pendingCheck }}>
                <AppRouter routes={routes} router="memory" initialEntries={["/finance"]} />
            </AccessControlProvider>,
        );

        expect(screen.getByText("checking")).toBeInTheDocument();
        expect(screen.queryByText("home")).not.toBeInTheDocument();

        grant(true);
        expect(await screen.findByText("finance")).toBeInTheDocument();
    });

    it("redirects once the check comes back denied", async () => {
        const routes = defineRoutes([
            { path: "/", element: <span>home</span> },
            {
                path: "/finance",
                element: <span>finance</span>,
                redirectTo: "/",
                guardFallback: <span>checking</span>,
                guard: function useFinanceGuard() {
                    const { allowed, isLoading } = useCan({ action: "read", resource: "finance" });
                    return isLoading ? "pending" : allowed;
                },
            },
        ]);

        render(
            <AccessControlProvider control={{ can: () => Promise.resolve(false) }}>
                <AppRouter routes={routes} router="memory" initialEntries={["/finance"]} />
            </AccessControlProvider>,
        );

        expect(await screen.findByText("home")).toBeInTheDocument();
        expect(screen.queryByText("finance")).not.toBeInTheDocument();
    });

    it("remounts the guard across routes, so one route's hook state never leaks into the next", async () => {
        const seen: string[] = [];
        const routes = defineRoutes([
            {
                path: "/a",
                element: <Link to="/b">to b</Link>,
                guard: function useAGuard() {
                    const [tag] = useState("from-a");
                    seen.push(tag);
                    return true;
                },
            },
            {
                path: "/b",
                element: <span>b</span>,
                guard: function useBGuard() {
                    const [tag] = useState("from-b");
                    seen.push(tag);
                    return true;
                },
            },
        ]);

        render(<AppRouter routes={routes} router="memory" initialEntries={["/a"]} />);
        await userEvent.click(screen.getByText("to b"));

        expect(screen.getByText("b")).toBeInTheDocument();
        expect(seen.at(-1)).toBe("from-b");
    });
});
