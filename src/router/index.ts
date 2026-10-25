export { AppRouter, defineRoutes } from "./AppRouter";
export type { AppRouterProps } from "./AppRouter";
export { RouteGuard } from "./RouteGuard";
export type { RouteGuardProps } from "./RouteGuard";
export type { TempestRouteObject, RouteGuardResult, RouterKind } from "./types";

/**
 * React Router's client-side surface, re-exported so apps import their whole
 * routing surface from one place instead of mixing SDK and `react-router`
 * import paths.
 *
 * `react-router` is a **required peer dependency** (`^7 || ^8`), not a bundled
 * one: it holds React context, so a copy nested under the SDK would be a second
 * instance and every hook here would throw `useNavigate() may be used only in
 * the context of a <Router>`. The host app owns the version; the SDK adapts.
 * Every name below exists, with the same value, in both v7 and v8 — both ship
 * the DOM bindings in `react-router` itself, with no separate
 * `react-router-dom`.
 *
 * What is left out is decided, not forgotten: framework-mode and server
 * rendering (`Links`, `Meta`, `Scripts`, `ServerRouter`, `StaticRouter`,
 * cookies and sessions, `href`), route middleware (`createContext`,
 * `RouterContextProvider`), the test stub and `UNSAFE_`/`unstable_` names. The
 * SDK is client-side only. `Form` is re-exported as `RouterForm`, because the
 * root already exports the SDK's own `Form`; the `Path` type is not
 * re-exported, because the root's `Path` is the form-field path from `forms`.
 * `test/router-reexports.test.ts`
 * fails when a new `react-router` export appears without one of the two
 * decisions.
 */
export {
    Await,
    BrowserRouter,
    Form as RouterForm,
    HashRouter,
    IDLE_BLOCKER,
    IDLE_FETCHER,
    IDLE_NAVIGATION,
    Link,
    MemoryRouter,
    NavLink,
    Navigate,
    NavigationType,
    Outlet,
    Route,
    Router,
    RouterProvider,
    Routes,
    ScrollRestoration,
    createBrowserRouter,
    createHashRouter,
    createMemoryRouter,
    createPath,
    createRoutesFromChildren,
    createRoutesFromElements,
    createSearchParams,
    data,
    generatePath,
    isRouteErrorResponse,
    matchPath,
    matchRoutes,
    parsePath,
    redirect,
    redirectDocument,
    renderMatches,
    replace,
    resolvePath,
    useActionData,
    useAsyncError,
    useAsyncValue,
    useBeforeUnload,
    useBlocker,
    useFetcher,
    useFetchers,
    useFormAction,
    useHref,
    useInRouterContext,
    useLinkClickHandler,
    useLoaderData,
    useLocation,
    useMatch,
    useMatches,
    useNavigate,
    useNavigation,
    useNavigationType,
    useOutlet,
    useOutletContext,
    useParams,
    useResolvedPath,
    useRevalidator,
    useRouteError,
    useRouteLoaderData,
    useRoutes,
    useSearchParams,
    useSubmit,
    useViewTransitionState,
} from "react-router";
export type {
    ActionFunction,
    ActionFunctionArgs,
    Blocker,
    BlockerFunction,
    Fetcher,
    FetcherWithComponents,
    FormProps as RouterFormProps,
    IndexRouteObject,
    LinkProps,
    LoaderFunction,
    LoaderFunctionArgs,
    Location,
    NavLinkProps,
    NavLinkRenderProps,
    NavigateFunction,
    NavigateOptions,
    NavigateProps,
    Navigation,
    NonIndexRouteObject,
    OutletProps,
    Params,
    PathMatch,
    PathPattern,
    RouteObject,
    RouteProps,
    RouterProviderProps,
    SetURLSearchParams,
    ShouldRevalidateFunction,
    To,
    UIMatch,
    URLSearchParamsInit,
} from "react-router";
