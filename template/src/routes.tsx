import { defineRoutes } from "tempest-react-sdk";

import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";
import { useAuth } from "@/stores/auth";

/**
 * Declarative route tree. `lazy` code-splits a page (with retry on stale
 * chunks); `guard` redirects when the predicate is falsy — here, reading the
 * auth store keeps protected pages behind login.
 *
 * The guard runs during the route's render, so it reads the store through a
 * hook: that subscribes the route, and a logout (the button, or a `401` from
 * `@/lib/api`) redirects to `/login` from whatever protected screen is open.
 * `useAuth.getState()` would read the value once and leave the screen up until
 * the next navigation. The function is named `use…` because
 * `react-hooks/rules-of-hooks` only accepts a hook inside one.
 */
export const routes = defineRoutes([
    {
        path: "/",
        element: <RootLayout />,
        children: [
            { index: true, element: <Home /> },
            { path: "login", element: <Login /> },
            {
                path: "dashboard",
                lazy: () => import("@/pages/Dashboard"),
                guard: function useSignedIn() {
                    return useAuth.use.isAuthenticated();
                },
                redirectTo: "/login",
            },
        ],
    },
]);
