/**
 * {@link isDevBuild} stays internal, imported by path (`../utils/dev-mode`)
 * rather than through the `utils` barrel: re-exporting it would make a one-line
 * env read part of the package's public API, with the semver weight that
 * carries, for something no consumer asked for. Every dev-only diagnostic in
 * the SDK routes through it — `grep -rn "dev-mode" src/` for the current list,
 * which an enumeration written here would only drift away from.
 *
 * {@link setDevBuild} is public, because the environment the SDK cannot read is
 * the one it most needs to: a Vite app. See its doc for why.
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
 * `<script type="module">`, a bundler substituting nothing. **A Vite app is in
 * that set**, `vite dev` included — Vite replaces neither `process` nor
 * `process.env.NODE_ENV` in the app it builds, so the read throws there like
 * anywhere else. Staying quiet is deliberate — a dev-only warning that cannot
 * prove it is in development is better silent than shouting in someone's
 * production console.
 *
 * {@link setDevBuild} is how that app says so, and it is checked first. The
 * automatic read stays exactly as written underneath, bare member expression
 * and all: a `typeof process === "undefined"` guard in front of it would return
 * early in a webpack build whose literal had already been substituted, which is
 * the one environment this currently gets right.
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
let configuredDevBuild: boolean | undefined;

/**
 * Tell the SDK whether the app around it was built for development.
 *
 * Call it once, at bootstrap, from a build the SDK cannot inspect:
 *
 * ```ts
 * import { setDevBuild } from "tempest-react-sdk";
 *
 * setDevBuild(import.meta.env.DEV);
 * ```
 *
 * **Why the SDK cannot work this out on its own in a Vite app.** The automatic
 * detection reads `process.env.NODE_ENV`, which webpack, Rspack and Parcel
 * replace with a literal while building the *app*. Vite replaces neither half:
 * `process` is not defined in a browser bundle, so the read throws and the
 * answer is `false` — including under `vite dev`. Its own signal,
 * `import.meta.env.DEV`, cannot be used here either, because Vite would replace
 * it while building *this package* and the published artifact would ship the
 * constant. Only the app is compiled at the moment the answer is knowable, so
 * only the app can supply it.
 *
 * The default stays `false` on purpose. `parseResponse` puts the raw response
 * payload in its message when this is on, so a wrong guess in the other
 * direction leaks a payload into a production error string. Silence is the safe
 * default; the report is one line away for anyone who wants it.
 *
 * Passing `undefined` clears the override and returns to automatic detection,
 * which is what a test that set it should do on the way out.
 *
 * @param value - `true` for a development build, `false` for production,
 *     `undefined` to go back to detecting it.
 *
 * @example
 * // Vite — the case this exists for
 * setDevBuild(import.meta.env.DEV);
 *
 * @example
 * // A test that flips it, and puts it back
 * afterEach(() => setDevBuild(undefined));
 */
export function setDevBuild(value: boolean | undefined): void {
    configuredDevBuild = value;
}

export function isDevBuild(): boolean {
    if (configuredDevBuild !== undefined) return configuredDevBuild;
    try {
        return process.env.NODE_ENV !== "production";
    } catch {
        return false;
    }
}
