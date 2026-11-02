/**
 * The session a credential belongs to, as `createTempestAuth` knows it.
 *
 * `current()` is a key that changes when the signed-in session is replaced —
 * a `login()`, another tab's sign-in, a `logout()` — and stays the same while
 * that session's tokens rotate. `null` means nobody is signed in.
 */
export interface SessionIdentity {
    /** The key of the session signed in now, or `null` for none. */
    current: () => string | null;
    /**
     * Call `listener` after every change of the auth state the key is read
     * from. Fires more often than the key changes: compare `current()`.
     *
     * @returns A function that removes the listener.
     */
    subscribe: (listener: () => void) => () => void;
}

/**
 * The objects `createTempestAuth` handed out — its `api` client and its
 * `getToken` getter — mapped to the session they act for.
 *
 * A `WeakMap` and not a property on the client: nothing is added to the
 * `ApiClient` shape, a preset that is dropped is collected with its client,
 * and an object the preset did not build — a hand-made client, a wrapper, a
 * spread copy — has no entry and keeps the behaviour it had before.
 */
const identities = new WeakMap<object, SessionIdentity>();

/**
 * Record that `target` acts for the session `identity` describes.
 *
 * @param target - An object `createTempestAuth` returns.
 * @param identity - The session it belongs to.
 */
export function bindSessionIdentity(target: object, identity: SessionIdentity): void {
    identities.set(target, identity);
}

/**
 * The session `target` acts for, when `createTempestAuth` built it.
 *
 * @param target - A client or getter received from the app.
 * @returns The session identity, or `undefined` for anything else.
 */
export function sessionIdentityOf(target: unknown): SessionIdentity | undefined {
    if ((typeof target !== "object" && typeof target !== "function") || target === null) {
        return undefined;
    }
    return identities.get(target);
}
