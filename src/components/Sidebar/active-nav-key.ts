/**
 * Reduce a path or a key to the form two of them are compared in.
 *
 * The query string and the hash are dropped, because `/users?tab=2` is still the
 * `/users` screen, and trailing slashes are dropped, because `/users/` and
 * `/users` are the same route to every router this SDK pairs with. The root keeps
 * its single slash — stripping it would leave an empty string, which is the
 * "nothing matched" answer, not a path.
 *
 * @param path - A pathname, an `href`, or a key used as a URL.
 * @returns The comparable form of `path`.
 */
function normalizePath(path: string): string {
    const cut = path.search(/[?#]/);
    const bare = cut === -1 ? path : path.slice(0, cut);
    const trimmed = bare.replace(/\/+$/, "");
    return trimmed === "" && bare.startsWith("/") ? "/" : trimmed;
}

/**
 * Whether `candidate` names the screen at `pathname` or one of its ancestors.
 *
 * The match is on **segment boundaries**, not on string prefixes: `/users` covers
 * `/users/3` but not `/users-admin`. The root `/` covers only itself — the same
 * rule react-router's `NavLink` applies — because a root that prefixed every path
 * would light "Home" on every screen the menu does not list.
 *
 * @param pathname - The normalized current path.
 * @param candidate - The normalized key or `href`.
 * @returns `true` when the candidate covers the path.
 */
function covers(pathname: string, candidate: string): boolean {
    if (candidate === "/") {
        return pathname === "/";
    }
    return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

/**
 * Index of the candidate that owns `pathname`: the longest one covering it.
 *
 * Longest wins so that `/dashboard` does not stay highlighted on
 * `/dashboard/tips/42` — with a first-match rule the order of the menu array would
 * decide, and nobody reading the menu knows it carries meaning. On a tie (`/users`
 * and `/users/` both present), the first one wins.
 *
 * @param pathname - The current route, as the router reports it.
 * @param candidates - One string per navigable entry, in menu order.
 * @returns The winning index, or `-1` when nothing covers the path.
 */
export function activeNavIndex(pathname: string, candidates: readonly string[]): number {
    const path = normalizePath(pathname);
    let winner = -1;
    let winnerLength = -1;
    candidates.forEach((raw, index) => {
        const candidate = normalizePath(raw);
        if (candidate !== "" && covers(path, candidate) && candidate.length > winnerLength) {
            winner = index;
            winnerLength = candidate.length;
        }
    });
    return winner;
}

/**
 * Resolve which navigation key is active for the current route.
 *
 * A menu whose keys are URLs almost never has a key equal to the pathname —
 * `/dashboard/tips/42` has to highlight `/dashboard/tips`. This picks the
 * **longest key that covers the path on a segment boundary**, which is what fixes
 * the two ways the one-line `keys.find((k) => pathname.startsWith(k))` goes wrong:
 * `/dashboard` stays lit on every screen of the panel (the array order decides),
 * and `/dashboard/tip` lights `/dashboard/tips`.
 *
 * The rules:
 *
 * - Query string and hash are ignored, on both sides.
 * - A trailing slash, on the route or on the key, changes nothing.
 * - `/` is active only on `/` itself, as with react-router's `NavLink`.
 * - The comparison is case-sensitive, as URL paths are.
 * - No match returns `""` — never `undefined`, never a throw — so the result can
 *   go straight into a `value` prop.
 *
 * The keys and the pathname have to live in the same space: with a router
 * `basename`, pass `useLocation().pathname` (which has the basename stripped) and
 * keys without it.
 *
 * Framework-agnostic on purpose: it takes a string, so it works with
 * react-router, with `window.location.pathname`, and for `BottomNavigation`,
 * `NavigationRail` or a `Drawer` menu just as for `Sidebar` — which does the same
 * resolution itself with `match="route"`.
 *
 * @param pathname - The current route, e.g. `useLocation().pathname`.
 * @param keys - The navigation keys, each one a URL path.
 * @returns The active key exactly as given in `keys`, or `""` when none covers
 *     the route.
 *
 * @example
 * const { pathname } = useLocation();
 * const value = activeNavKey(pathname, ["/dashboard", "/dashboard/tips"]);
 * // "/dashboard/tips/42" → "/dashboard/tips"
 * // "/dashboard/tip"     → "/dashboard"
 */
export function activeNavKey(pathname: string, keys: readonly string[]): string {
    return keys[activeNavIndex(pathname, keys)] ?? "";
}
