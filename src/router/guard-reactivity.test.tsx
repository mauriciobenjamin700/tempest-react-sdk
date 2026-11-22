import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet } from "react-router";
import { AppRouter, defineRoutes } from "./AppRouter";
import type { TempestRouteObject } from "./types";
import { createAuthStore } from "@/auth/create-auth-store";
import { createSelectors } from "@/store/create-selectors";

interface User {
    id: string;
}

const useAuth = createSelectors(createAuthStore<User>({ name: "guard-reactivity-test" }));

/**
 * The scaffold's shell: a layout that subscribes to the store (so it does
 * re-render on logout) and a guarded child below its `<Outlet />`.
 *
 * Re-rendering the layout is not enough to re-run the child's guard: React
 * Router hands `<Outlet />` the same element it built when the location last
 * changed, so React bails out of the guarded subtree unless something inside
 * it subscribes. That is the whole of #738.
 */
function Shell() {
    const isAuthenticated = useAuth.use.isAuthenticated();
    const logout = useAuth.use.logout();
    return (
        <div>
            {isAuthenticated ? <button onClick={logout}>Logout</button> : null}
            <Outlet />
        </div>
    );
}

function treeWith(guard: TempestRouteObject["guard"]): TempestRouteObject[] {
    return defineRoutes([
        {
            path: "/",
            element: <Shell />,
            children: [
                { path: "login", element: <h1>login</h1> },
                {
                    path: "dashboard",
                    element: <h1>dashboard</h1>,
                    guard,
                    redirectTo: "/login",
                },
            ],
        },
    ]);
}

beforeEach(() => {
    localStorage.clear();
    useAuth.getState().setSession({ user: { id: "1" }, token: "t" });
});

describe("guard reactivity to logout (#738)", () => {
    it("a guard that reads the store through a hook redirects as soon as the session ends", async () => {
        const routes = treeWith(function useSignedIn() {
            return useAuth.use.isAuthenticated();
        });
        render(<AppRouter routes={routes} router="memory" initialEntries={["/dashboard"]} />);
        expect(screen.getByRole("heading", { name: "dashboard" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Logout" }));

        expect(await screen.findByRole("heading", { name: "login" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "dashboard" })).not.toBeInTheDocument();
    });

    it("a guard that reads getState() keeps the protected screen open after logout, which is why the docs no longer offer it", async () => {
        const routes = treeWith(() => useAuth.getState().isAuthenticated);
        render(<AppRouter routes={routes} router="memory" initialEntries={["/dashboard"]} />);

        await userEvent.click(screen.getByRole("button", { name: "Logout" }));

        expect(useAuth.getState().isAuthenticated).toBe(false);
        expect(screen.getByRole("heading", { name: "dashboard" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "login" })).not.toBeInTheDocument();
    });
});
