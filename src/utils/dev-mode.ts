/**
 * Internal, and imported by path (`../utils/dev-mode`) rather than through the
 * `utils` barrel: re-exporting it would make a one-line env read part of the
 * package's public API, with the semver weight that carries, for something no
 * consumer asked for. The three call sites are `<Icon>`, `useStickyBodyWarning`
 * and the `DataTable` dev warnings.
 */

/**
 * Whether the consuming app was built for development.
 *
 * Reads `process.env.NODE_ENV`, which every supported bundler (Vite, webpack,
 * Rspack, Parcel) replaces with a literal **while building the app**. That
 * timing is the whole point: `import.meta.env.DEV` looks equivalent and is not,
 * because Vite replaces it while building *this package*, so a published
 * artifact carries the constant `false` and every guard behind it becomes dead
 * code the app's own dev server can no longer switch on.
 *
 * The expression is written out in full, and the failure is caught rather than
 * guarded against. A `typeof process === "undefined"` check would read as the
 * careful version and quietly reintroduce the bug: bundlers substitute the
 * member expression `process.env.NODE_ENV` and nothing else, so in a browser —
 * where the identifier `process` does not exist — the guard would return early
 * while the literal right after it had already been replaced with
 * `"development"`.
 *
 * Returns `false` when the read throws, which is the environment that defines
 * neither symbol: a raw service-worker context, a plain
 * `<script type="module">`, a bundler substituting nothing. Staying quiet there
 * is deliberate — a dev-only warning that cannot prove it is in development is
 * better silent than shouting in someone's production console.
 *
 * @returns Whether development-only diagnostics should run.
 *
 * @example
 * if (isDevBuild()) console.warn("[my-app] this prop combination does nothing");
 *
 * @tempest-limits empty-catch — the only thing the read can throw is the
 * environment answering "not defined", which is the return value, not an error
 * worth reporting. Logging it would print on every call in exactly the context
 * that has nowhere to print.
 */
export function isDevBuild(): boolean {
    try {
        return process.env.NODE_ENV !== "production";
    } catch {
        return false;
    }
}
