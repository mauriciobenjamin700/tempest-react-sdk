/**
 * Internal, and imported by path rather than through the `utils` barrel: it is
 * diagnostic copy, not API, and re-exporting it would give a sentence the
 * semver weight of a public export. The call sites are `<QueryProvider>` and
 * `<FormField>` — the two places where a second copy of a context-carrying
 * dependency surfaces as a failure the app cannot read.
 */

/**
 * What to do about a second copy, worded once so the two call sites cannot
 * drift apart.
 *
 * `npm dedupe` comes first because it fixes the common case outright: npm
 * nested the copy only because the app's range and the SDK's range did not
 * overlap at install time, and deduping collapses them whenever a single
 * version satisfies both. `tempest doctor` comes second as the way to *see*
 * the problem — it walks `node_modules/tempest-react-sdk` for nested copies of
 * every context-carrying dependency and names the ones it finds, which is the
 * confirmation the app needs before touching versions by hand.
 */
export const DUPLICATE_COPY_REMEDY =
    "Two copies of a package that carries React context cannot see each other's " +
    "providers. Run `npm dedupe`, or `npx tempest doctor` to list every duplicated " +
    "dependency, then align the versions so a single copy satisfies both the app " +
    "and the SDK.";
