/** How a {@link createJsonStorage} store turns values into text and back. */
export interface StorageCodec {
    /** Encode a value for storage. */
    serialize: <T>(value: T) => string;
    /** Decode a stored string. */
    deserialize: <T>(raw: string) => T;
}

/** The surface every store built by {@link createJsonStorage} exposes. */
export interface JsonStorage {
    /**
     * Read and decode a key.
     *
     * The value is decoded by the store's codec — JSON for {@link storage} —
     * which is what makes a key written as a bare string unreadable here: it is
     * not the shape this method writes. {@link JsonStorage.getRaw} reads those.
     *
     * @typeParam T - The expected value shape.
     * @param key - Storage key.
     * @param fallback - Returned when the key is absent, unreadable, or corrupt.
     * @returns The stored value, or `fallback`.
     */
    get<T>(key: string, fallback: T): T;
    /**
     * Encode and write a key.
     *
     * The value is **encoded** — `set("theme", "dark")` stores `"dark"` with the
     * quotes, not `dark`. That matters when an existing key is being adopted:
     * whatever read it before will no longer recognise what this writes, and the
     * old value will no longer parse here. {@link JsonStorage.setRaw} is the
     * passthrough.
     *
     * @typeParam T - The value being stored.
     * @param key - Storage key.
     * @param value - Any value the codec can represent.
     */
    set<T>(key: string, value: T): void;
    /**
     * Read a key exactly as `localStorage` holds it, with no decoding.
     *
     * The escape hatch {@link JsonStorage.get} cannot be: `get` runs the codec,
     * so a key holding a bare `dark` — written by another library, by the app
     * before it adopted this wrapper, or by the SDK's own `ThemeProvider` —
     * fails to parse and comes back as the fallback. Reading that key is a
     * different operation, not a variant of the same one.
     *
     * @param key - Storage key.
     * @returns The stored string, or `null` when the key is absent or storage is
     *   unavailable.
     */
    getRaw(key: string): string | null;
    /**
     * Write a string exactly as given, with no encoding.
     *
     * The counterpart of {@link JsonStorage.getRaw}, and what keeps adoption from
     * being a silent migration: `set("theme", "dark")` stores `"dark"` **with the
     * quotes**, which the app's previous reader no longer recognises.
     *
     * @param key - Storage key.
     * @param value - The exact string to store.
     */
    setRaw(key: string, value: string): void;
    /**
     * Delete a key.
     *
     * @param key - Storage key.
     */
    remove(key: string): void;
}

const jsonCodec: StorageCodec = {
    serialize: (value) => JSON.stringify(value),
    deserialize: (raw) => JSON.parse(raw),
};

/**
 * Encode with the codec, degrading to plain JSON when the codec itself fails.
 *
 * A codec that throws — a compressor running out of room on a huge value —
 * should cost size, not the record: a slightly larger row still loads, an absent
 * one does not. `null` means not even JSON could represent the value, which is
 * the one case where dropping the write is the only option left.
 *
 * @param codec - The store's codec.
 * @param value - The value to encode.
 * @returns The encoded string, or `null` when the value cannot be represented.
 */
function encode<T>(codec: StorageCodec, value: T): string | null {
    try {
        return codec.serialize(value);
    } catch {
        try {
            return JSON.stringify(value);
        } catch {
            return null;
        }
    }
}

/**
 * Build a typed `localStorage` wrapper around a codec.
 *
 * One implementation behind every store the SDK ships, so they cannot drift in
 * surface. {@link storage} and {@link compressedStorage} are both this function —
 * before it, the compressed one was a hand-written copy of the same guards and
 * had no `remove`, while its own docstring promised the two were interchangeable
 * at the call site. They were not, and the promise failed exactly where somebody
 * followed it.
 *
 * @example
 * const session = createJsonStorage();
 * session.set("draft", { title: "Sem título" });
 *
 * @example
 * const packed = createJsonStorage(compressedStorageCodec);
 *
 * @param codec - Encoder pair. Defaults to plain JSON.
 * @returns A store with `get` / `set` / `getRaw` / `setRaw` / `remove`.
 *
 * @tempest-limits empty-catch — every method is best-effort by contract:
 * `localStorage` throws on quota exhaustion, in Safari private mode, and when a
 * cross-origin frame has storage blocked. A caller persisting a preference has no
 * recovery to run and no user-facing message to show, so the write is dropped and
 * the app keeps the value in memory for the session.
 */
export function createJsonStorage(codec: StorageCodec = jsonCodec): JsonStorage {
    return {
        get<T>(key: string, fallback: T): T {
            if (typeof window === "undefined") return fallback;
            try {
                const raw = window.localStorage.getItem(key);
                return raw === null ? fallback : codec.deserialize<T>(raw);
            } catch {
                return fallback;
            }
        },

        set<T>(key: string, value: T): void {
            if (typeof window === "undefined") return;
            const encoded = encode(codec, value);
            if (encoded === null) return;
            try {
                window.localStorage.setItem(key, encoded);
            } catch {
                /* empty */
            }
        },

        getRaw(key: string): string | null {
            if (typeof window === "undefined") return null;
            try {
                return window.localStorage.getItem(key);
            } catch {
                return null;
            }
        },

        setRaw(key: string, value: string): void {
            if (typeof window === "undefined") return;
            try {
                window.localStorage.setItem(key, value);
            } catch {
                /* empty */
            }
        },

        remove(key: string): void {
            if (typeof window === "undefined") return;
            try {
                window.localStorage.removeItem(key);
            } catch {
                /* empty */
            }
        },
    };
}

/**
 * Typed wrapper around `localStorage` that JSON-encodes values and silently
 * handles environments where storage is unavailable (SSR, private mode).
 *
 * `get`/`set` encode; `getRaw`/`setRaw` do not. Reach for the raw pair when the
 * key is shared with something that does not speak JSON — an existing key in an
 * app adopting this wrapper, a key another library owns, or the theme
 * preference the SDK's own `ThemeProvider` stores as a bare string.
 */
export const storage: JsonStorage = createJsonStorage();
