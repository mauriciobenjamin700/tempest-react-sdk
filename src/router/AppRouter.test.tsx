import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppRouter, defineRoutes } from "./AppRouter";
import { Outlet, Link } from "react-router-dom";

function Layout() {
    return (
        <div>
            <nav>
                <Link to="/about">about</Link>
            </nav>
            <Outlet />
        </div>
    );
}

describe("defineRoutes", () => {
    it("returns the route array unchanged", () => {
        const routes = defineRoutes([{ path: "/", element: <span>home</span> }]);
        expect(routes).toHaveLength(1);
        expect(routes[0].path).toBe("/");
    });
});

describe("AppRouter", () => {
    it("renders the matching route for the initial entry", () => {
        const routes = defineRoutes([
            {
                path: "/",
                element: <Layout />,
                children: [
                    { index: true, element: <span>home</span> },
                    { path: "about", element: <span>about-page</span> },
                ],
            },
        ]);

        render(<AppRouter routes={routes} router="memory" initialEntries={["/about"]} />);
        expect(screen.getByText("about-page")).toBeInTheDocument();
    });

    it("renders nested index route through the layout outlet", () => {
        const routes = defineRoutes([
            {
                path: "/",
                element: <Layout />,
                children: [{ index: true, element: <span>home</span> }],
            },
        ]);

        render(<AppRouter routes={routes} router="memory" initialEntries={["/"]} />);
        expect(screen.getByText("home")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "about" })).toBeInTheDocument();
    });

    it("redirects when a route guard is falsy", () => {
        const routes = defineRoutes([
            { path: "/login", element: <span>login-page</span> },
            {
                path: "/secret",
                element: <span>secret</span>,
                guard: false,
                redirectTo: "/login",
            },
        ]);

        render(<AppRouter routes={routes} router="memory" initialEntries={["/secret"]} />);
        expect(screen.getByText("login-page")).toBeInTheDocument();
        expect(screen.queryByText("secret")).not.toBeInTheDocument();
    });

    it("allows access when a guard function returns true", () => {
        const routes = defineRoutes([
            {
                path: "/secret",
                element: <span>secret</span>,
                guard: () => true,
                redirectTo: "/login",
            },
        ]);

        render(<AppRouter routes={routes} router="memory" initialEntries={["/secret"]} />);
        expect(screen.getByText("secret")).toBeInTheDocument();
    });
});
