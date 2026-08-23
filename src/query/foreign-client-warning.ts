/**
 * Internal, in its own file for the reason the AppBar warning is: a module that
 * exports a component may export nothing else without breaking Fast Refresh
 * (`react-refresh/only-export-components`), and the warn-once latch needs a
 * reset for tests to assert the warning more than once.
 */
import { QueryClient } from "@tanstack/react-query";

import { isDevBuild } from "../utils/dev-mode";
import { DUPLICATE_COPY_REMEDY } from "../utils/duplicate-instance";

/** Set once the warning has printed, so a re-render does not bury the console. */
let warnedForeignClient = false;

/**
 * Reset the warn-once latch. Test-only: the latch is module state, so a suite
 * asserting the warning more than once would otherwise see it only the first time.
 */
export function resetForeignClientWarning(): void {
    warnedForeignClient = false;
}

/**
 * Warn when the `client` handed in was built by a different copy of
 * `@tanstack/react-query`.
 *
 * This prop is the one place the app's copy and the SDK's copy touch: the app
 * constructs a `QueryClient` and passes it in, and `QueryClientProvider` —
 * resolved from the SDK's copy — publishes it on *that* copy's context. Every
 * `useQuery` in the app then reads the app copy's context, finds nothing, and
 * throws `No QueryClient set, use QueryClientProvider to set one` while a
 * provider is plainly mounted three lines up. Nothing in that message points at
 * the duplicate, which is why it costs an afternoon.
 *
 * `instanceof` is the discriminator, and it is exactly the right one: two copies
 * define two distinct `QueryClient` classes, so a client from the other copy
 * duck-types perfectly and fails the identity check. The duck-type guard runs
 * first so the warning fires only on the shape that is actually a client —
 * without it, every hand-rolled test double would trip it.
 *
 * @param client - The client the caller passed, if any.
 */
export function warnOnForeignClient(client: QueryClient | undefined): void {
    if (warnedForeignClient || client === undefined || !isDevBuild()) return;
    if (client instanceof QueryClient) return;
    const looksLikeClient =
        typeof (client as Partial<QueryClient>).getQueryCache === "function" &&
        typeof (client as Partial<QueryClient>).mount === "function";
    if (!looksLikeClient) return;
    warnedForeignClient = true;
    console.warn(
        "[tempest-react-sdk] <QueryProvider client={...} /> received a QueryClient " +
            "built by a different copy of @tanstack/react-query. The SDK publishes it on " +
            "its own copy's context, so the app's `useQuery` calls will throw " +
            '"No QueryClient set" even though this provider is mounted. ' +
            DUPLICATE_COPY_REMEDY,
    );
}
