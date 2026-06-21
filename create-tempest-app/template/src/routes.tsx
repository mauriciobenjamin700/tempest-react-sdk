import { defineRoutes } from "tempest-react-sdk";
import { useAuth } from "@/stores/auth";
import { RootLayout } from "@/layouts/RootLayout";
import { Home } from "@/pages/Home";
import { Login } from "@/pages/Login";

/**
 * Declarative route tree. `lazy` code-splits a page (with retry on stale
 * chunks); `guard` redirects when the predicate is falsy — here, reading the
 * auth store keeps protected pages behind login.
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
                guard: () => useAuth.getState().isAuthenticated,
                redirectTo: "/login",
            },
        ],
    },
]);
