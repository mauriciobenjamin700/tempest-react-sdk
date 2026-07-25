export { AppRouter, defineRoutes } from "./AppRouter";
export type { AppRouterProps } from "./AppRouter";
export { RouteGuard } from "./RouteGuard";
export type { RouteGuardProps } from "./RouteGuard";
export type { TempestRouteObject, RouterKind } from "./types";

/**
 * Declarative React Router primitives, re-exported so apps import their whole
 * routing surface from the SDK and never depend on `react-router` directly —
 * the SDK owns the version (v8, declarative mode).
 *
 * Since v8 there is no `react-router-dom` package: the DOM bindings ship in
 * `react-router` itself, so this is the single source for both.
 */
export {
    BrowserRouter,
    HashRouter,
    MemoryRouter,
    Routes,
    Route,
    Outlet,
    Navigate,
    Link,
    NavLink,
    useNavigate,
    useParams,
    useSearchParams,
    useLocation,
    useMatch,
    useRouteError,
    redirect,
} from "react-router";
export type { NavigateOptions, To, Params } from "react-router";
