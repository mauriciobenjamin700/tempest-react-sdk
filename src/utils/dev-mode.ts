/**
 * {@link isDevBuild} stays internal, imported by path (`../utils/dev-mode`)
 * rather than through the `utils` barrel: re-exporting it would make a one-line
 * env read part of the package's public API, with the semver weight that
 * carries, for something no consumer asked for. Every dev-only diagnostic in
 * the SDK routes through it — `grep -rn "dev-mode" src/` for the current list,
 * which an enumeration written here would only drift away from.
 *
 * {@link setDevBuild} is public, because a context nothing compiles cannot be
 * detected from the inside. See its doc for when that is.
 */

/**
 * Whether the consuming app was built for development.
 *
 * Reads `process.env.NODE_ENV`, which every supported bundler replaces with a
 * literal **while building the app** — Vite included. That last word is a
 * correction: this doc used to claim Vite substitutes neither half, so every
 * dev-only diagnostic in the SDK was unreachable under `vite dev`. Measured on
 * 2026-09-07 with 0.61.0 installed into a probe app, both from a packed tarball
 * (a real copy under `node_modules`, which Vite pre-bundles) and from a `file:`
 * link (a symlink it does not), reading back the module the dev server actually
 * served:
 *
 * | Vite | `vite dev` | `vite build` |
 * | --- | --- | --- |
 * | 5.4.21, 6.4.3, 7.3.6 | folded to `true` | folded to `false` |
 * | 8.2.2 | `"development" !== "production"` | folded to `false` |
 *
 * So this answers correctly in a Vite app on its own, in development and in
 * production, pre-bundled or served through the dev server's transform. The
 * wrong belief survived releases because nobody read the served module — the
 * expression is not substituted in a *browser console*, which is where it is
 * natural to go looking.
 *
 * `import.meta.env.DEV` still cannot be used here: Vite would replace it while
 * building *this package*, so the published artifact would carry the constant
 * and every guard behind it would be dead code no app could switch back on.
 *
 * The expression is written out in full, and the failure is caught rather than
 * guarded against. A `typeof process === "undefined"` check would read as the
 * careful version and quietly break the environments that work: substitution
 * replaces the member expression `process.env.NODE_ENV` and nothing else, so
 * the guard would return early in front of a literal that had already been
 * swapped in. The identifier itself never exists at runtime — `typeof process`
 * is `"undefined"` in the page, measured in the same probe — which is exactly
 * why the read is wrapped in `try` instead.
 *
 * Returns `false` when the read throws, which is the context nothing
 * transformed: a raw service-worker script, a plain `<script type="module">`, a
 * bundler substituting nothing. Staying quiet there is deliberate — a dev-only
 * warning that cannot prove it is in development is better silent than shouting
 * in someone's production console.
 *
 * {@link setDevBuild} overrides all of it and is checked first.
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
 * Call it once, at bootstrap, from a context {@link isDevBuild} cannot read:
 *
 * ```ts
 * import { setDevBuild } from "tempest-react-sdk";
 *
 * setDevBuild(import.meta.env.DEV);
 * ```
 *
 * **When you need it.** Not for an ordinary Vite, webpack, Rspack or Parcel
 * app: all of them substitute `process.env.NODE_ENV` while building the app, so
 * the automatic read already answers correctly there — measured for Vite 5
 * through 8 in {@link isDevBuild}, whose doc carries the table. What is left is
 * the context nothing compiles or nothing configures:
 *
 * - code no bundler transformed — a raw service-worker script registered as a
 *   file of its own, a plain `<script type="module">`;
 * - a staging or QA build that never sets `NODE_ENV=production`, where the
 *   automatic answer is `true` and `parseResponse` would put the raw response
 *   payload in an error string seen by real users. `setDevBuild(false)` closes
 *   that;
 * - a test that wants the other branch, and puts it back on the way out.
 *
 * `import.meta.env.DEV` cannot be read by the SDK on your behalf, which is why
 * the signal is a parameter: Vite would replace it while building *this
 * package*, and the published artifact would ship the constant.
 *
 * The default stays `false` when the read throws. `parseResponse` puts the raw
 * response payload in its message when this is on, so guessing `true` in a
 * context that cannot prove it leaks a payload into a production error string.
 * Silence is the safe default; the report is one line away for anyone who wants
 * it.
 *
 * Passing `undefined` clears the override and returns to automatic detection,
 * which is what a test that set it should do on the way out.
 *
 * @param value - `true` for a development build, `false` for production,
 *     `undefined` to go back to detecting it.
 *
 * @example
 * // A service worker, or any context no bundler transformed
 * setDevBuild(false);
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
