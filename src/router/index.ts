export { AppRouter, defineRoutes } from "./AppRouter";
export type { AppRouterProps } from "./AppRouter";
export { RouteGuard } from "./RouteGuard";
export type { RouteGuardProps } from "./RouteGuard";
export type { TempestRouteObject, RouteGuardResult, RouterKind } from "./types";

/**
 * Declarative React Router primitives, re-exported so apps import their whole
 * routing surface from one place instead of mixing SDK and `react-router`
 * import paths.
 *
 * `react-router` is a **required peer dependency** (`^7 || ^8`), not a bundled
 * one: it holds React context, so a copy nested under the SDK would be a second
 * instance and every hook here would throw `useNavigate() may be used only in
 * the context of a <Router>`. The host app owns the version; the SDK adapts.
 * The surface re-exported below is identical across v7 and v8 — both ship the
 * DOM bindings in `react-router` itself, with no separate `react-router-dom`.
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
