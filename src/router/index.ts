export { AppRouter, defineRoutes } from "./AppRouter";
export type { AppRouterProps } from "./AppRouter";
export { RouteGuard } from "./RouteGuard";
export type { RouteGuardProps } from "./RouteGuard";
export type { TempestRouteObject, RouterKind } from "./types";

// Re-export the declarative React Router primitives so apps can import their
// whole routing surface from the SDK and never depend on react-router-dom
// directly. The SDK owns the version (v7, declarative mode).
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
} from "react-router-dom";
export type { NavigateOptions, To, Params } from "react-router-dom";
