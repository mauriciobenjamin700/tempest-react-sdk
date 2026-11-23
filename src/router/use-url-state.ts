import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";

/** A value one URL parameter can hold. Its type is taken from the default. */
export type UrlStateValue = string | number | boolean;

/** The parameters a screen keeps in the URL, each with its default value. */
export type UrlStateDefaults = Record<string, UrlStateValue>;

/**
 * An edit to the URL state. `null`, or the key's default, removes the parameter,
 * so the URL of a screen with nothing chosen is the bare path.
 */
export type UrlStatePatch<T extends UrlStateDefaults> = {
    [K in keyof T]?: T[K] | null;
};

/** Options of {@link useUrlState} and of each write. */
export interface UrlStateWriteOptions {
    /**
     * Replace the current history entry instead of pushing one. Default `false`.
     * Use it for typing in a search box, where every pause is not a page the back
     * button should stop at.
     */
    replace?: boolean;
}

/** What {@link useUrlState} returns. */
export interface UseUrlStateResult<T extends UrlStateDefaults> {
    /** The parsed values, defaults filled in. Stable until the URL changes. */
    state: T;
    /**
     * Merge a patch into the URL. Writes made in the same tick are accumulated and
     * land as **one** navigation — one history entry, nothing lost.
     */
    set: (patch: UrlStatePatch<T>, options?: UrlStateWriteOptions) => void;
    /** Remove the given keys from the URL (all of them when omitted). */
    reset: (keys?: (keyof T)[], options?: UrlStateWriteOptions) => void;
}

/** A batch of writes from one tick, waiting for its microtask. */
interface PendingWrite {
    base: string;
    next: URLSearchParams;
    replace: boolean;
}

/**
 * Parse one raw parameter by the type of its default.
 *
 * A value that does not parse falls back to the default instead of throwing:
 * `?pagina=abc` is a URL somebody typed or truncated, and the screen has to open.
 *
 * @param raw - The parameter as found in the URL, or `null` when absent.
 * @param fallback - The default, which also decides the type.
 * @returns The parsed value.
 */
function parseValue(raw: string | null, fallback: UrlStateValue): UrlStateValue {
    if (raw === null) return fallback;
    if (typeof fallback === "number") {
        const value = Number(raw);
        return raw.trim() !== "" && Number.isFinite(value) ? value : fallback;
    }
    if (typeof fallback === "boolean") {
        if (raw === "true") return true;
        if (raw === "false") return false;
        return fallback;
    }
    return raw;
}

/**
 * Screen state that lives in the URL — page, page size, filters, sort — typed by
 * its defaults, with writes that do not overwrite each other.
 *
 * React Router's `setSearchParams` builds the next URL from the search params of
 * **the last render**, even in its functional form. Two writes in one event
 * therefore race, and the second wins: `DataTable` calls `onPageSizeChange(50)`
 * and then `onPageChange(1)` in the same click, and on `?page=3` the result was
 * `?page=1` — the size was lost (measured with react-router 8.5.2, #714). Every
 * admin screen worked around it with a ref holding the last URL written.
 *
 * Here the writes of one tick are accumulated on a pending copy and flushed in a
 * microtask as a single navigation, which also means one history entry for one
 * gesture. A batch pushes unless **every** write in it asked to replace.
 * Parameters this hook does not know are left untouched, so two hooks (or a hook
 * and a plain link) can share one URL.
 *
 * Values are parsed by the type of their default; a value equal to its default is
 * removed from the URL.
 *
 * @typeParam T - The parameters and their defaults.
 * @param defaults - Every parameter the screen reads, with its default.
 * @param options - `replace` for every write that does not say otherwise.
 * @returns The parsed state, `set` and `reset`.
 *
 * @example
 * const { state, set } = useUrlState({ busca: "", pagina: 1, por_pagina: 20 });
 *
 * <DataTable
 *   page={state.pagina}
 *   onPageChange={(pagina) => set({ pagina })}
 *   pageSize={state.por_pagina}
 *   onPageSizeChange={(por_pagina) => set({ por_pagina })}
 *   ...
 * />
 */
export function useUrlState<T extends UrlStateDefaults>(
    defaults: T,
    options: UrlStateWriteOptions = {},
): UseUrlStateResult<T> {
    const [searchParams, setSearchParams] = useSearchParams();
    const defaultsKey = JSON.stringify(defaults);
    const pending = useRef<PendingWrite | null>(null);
    const written = useRef<{ base: string; next: URLSearchParams } | null>(null);
    const defaultReplace = options.replace ?? false;

    const state = useMemo<T>(() => {
        const parsed = JSON.parse(defaultsKey) as T;
        const result = {} as Record<string, UrlStateValue>;
        for (const [name, fallback] of Object.entries(parsed)) {
            result[name] = parseValue(searchParams.get(name), fallback);
        }
        return result as T;
    }, [searchParams, defaultsKey]);

    const set = useCallback(
        (patch: UrlStatePatch<T>, writeOptions: UrlStateWriteOptions = {}): void => {
            const replace = writeOptions.replace ?? defaultReplace;
            const parsedDefaults = JSON.parse(defaultsKey) as T;
            if (pending.current === null) {
                const base = searchParams.toString();
                const from = written.current?.base === base ? written.current.next : searchParams;
                const batch: PendingWrite = { base, next: new URLSearchParams(from), replace };
                pending.current = batch;
                queueMicrotask(() => {
                    pending.current = null;
                    if (batch.next.toString() === base) return;
                    written.current = { base, next: batch.next };
                    setSearchParams(batch.next, { replace: batch.replace });
                });
            } else {
                pending.current.replace = pending.current.replace && replace;
            }
            const next = pending.current.next;
            for (const [name, value] of Object.entries(patch)) {
                if (value === undefined) continue;
                if (value === null || value === parsedDefaults[name]) next.delete(name);
                else next.set(name, String(value));
            }
        },
        [searchParams, setSearchParams, defaultsKey, defaultReplace],
    );

    const reset = useCallback(
        (keys?: (keyof T)[], writeOptions?: UrlStateWriteOptions): void => {
            const names = keys ?? (Object.keys(JSON.parse(defaultsKey)) as (keyof T)[]);
            const patch = {} as UrlStatePatch<T>;
            for (const name of names) patch[name] = null;
            set(patch, writeOptions);
        },
        [set, defaultsKey],
    );

    return { state, set, reset };
}
