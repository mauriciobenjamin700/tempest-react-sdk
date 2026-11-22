import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";

/** What {@link useSearchBox} needs from the table. */
export interface SearchBoxInput {
    /** The term the rows are filtered by now: the `search` prop, or the table's own. */
    applied: string;
    /** Milliseconds of quiet before a keystroke is committed. `0` commits each one. */
    debounceMs: number;
    /** Publish a term. Always called with the latest closure, even from a timer. */
    onCommit: (term: string) => void;
}

/** The text in the box and the handler that edits it. */
export interface SearchBox {
    /** What the input shows. Runs ahead of `applied` while a debounce is pending. */
    draft: string;
    /** Edit the box; commits now, or after `debounceMs` of quiet. */
    change: (value: string) => void;
}

/**
 * The search box's own text, kept apart from the term the table is filtered by.
 *
 * The two differ in exactly two situations, and both used to be handled outside
 * the table (the admin recipe carried a component for it):
 *
 * - **Typing under a debounce.** The box shows every keystroke; the term moves
 *   once the user pauses, so a server-mode table sends one request per search
 *   instead of one per letter.
 * - **The term moving from outside.** A controlled `search` that changes because
 *   the URL did (back button, a "clear filters" link) rewrites the box. A change
 *   that is only the echo of the box's own commit does not — otherwise the text
 *   typed after the pause would be overwritten by the term committed before it.
 *
 * The external change is detected during render, by comparing against the last
 * `applied` seen, so the box never paints one frame with the stale text.
 *
 * @param input - The applied term, the debounce and the commit callback.
 * @returns The draft and its change handler.
 */
export function useSearchBox({ applied, debounceMs, onCommit }: SearchBoxInput): SearchBox {
    const [draft, setDraft] = useState<string>(applied);
    const [seen, setSeen] = useState<string>(applied);
    const [committed, setCommitted] = useState<string>(applied);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const commitRef = useLatestRef(onCommit);

    if (applied !== seen) {
        setSeen(applied);
        if (applied !== committed) {
            setCommitted(applied);
            setDraft(applied);
        }
    }

    useEffect(() => () => clearTimeout(timer.current), []);

    const change = useCallback(
        (value: string): void => {
            setDraft(value);
            clearTimeout(timer.current);
            const fire = (): void => {
                setCommitted(value);
                commitRef.current(value);
            };
            if (debounceMs > 0) timer.current = setTimeout(fire, debounceMs);
            else fire();
        },
        [debounceMs, commitRef],
    );

    return { draft, change };
}
