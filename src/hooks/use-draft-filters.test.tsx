import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useDraftFilters } from "./use-draft-filters";

interface LogFilter {
    code: string;
    level: string;
    tags: string[];
}

const EMPTY: LogFilter = { code: "", level: "all", tags: [] };

describe("useDraftFilters — the draft never reaches the query by itself", () => {
    it("starts with draft and applied both equal to the initial value", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));

        expect(result.current.draft).toBe(EMPTY);
        expect(result.current.applied).toBe(EMPTY);
        expect(result.current.isDirty).toBe(false);
    });

    it("edits only the draft, and marks it dirty", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));

        act(() => result.current.set({ code: "AUTH" }));

        expect(result.current.draft).toEqual({ ...EMPTY, code: "AUTH" });
        expect(result.current.applied).toBe(EMPTY);
        expect(result.current.isDirty).toBe(true);
    });

    it("accepts an updater for edits that depend on the current draft", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));

        act(() => result.current.set((draft) => ({ ...draft, tags: [...draft.tags, "a"] })));
        act(() => result.current.set((draft) => ({ ...draft, tags: [...draft.tags, "b"] })));

        expect(result.current.draft.tags).toEqual(["a", "b"]);
    });

    it("keeps every consecutive edit made in one event", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));

        act(() => {
            result.current.set({ code: "AUTH" });
            result.current.set({ level: "error" });
        });

        expect(result.current.draft).toEqual({ code: "AUTH", level: "error", tags: [] });
    });
});

describe("useDraftFilters — apply publishes in the event that asked for it", () => {
    it("publishes the current draft and is clean right after", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));
        act(() => result.current.set({ code: "AUTH" }));

        act(() => result.current.apply());

        expect(result.current.applied).toEqual({ ...EMPTY, code: "AUTH" });
        expect(result.current.isDirty).toBe(false);
    });

    it("writes and publishes a patch in the same call, without reading stale state", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));

        act(() => {
            result.current.set({ level: "error" });
            result.current.apply({ code: "AUTH" });
        });

        expect(result.current.draft).toEqual({ code: "AUTH", level: "error", tags: [] });
        expect(result.current.applied).toEqual({ code: "AUTH", level: "error", tags: [] });
        expect(result.current.isDirty).toBe(false);
    });

    it("accepts an updater as the patch to apply", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));

        act(() => result.current.apply((draft) => ({ ...draft, level: "warn" })));

        expect(result.current.applied.level).toBe("warn");
    });

    it("hands onApply the value that was applied", () => {
        const onApply = vi.fn();
        const { result } = renderHook(() => useDraftFilters(EMPTY, { onApply }));

        act(() => result.current.apply({ code: "AUTH" }));

        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onApply).toHaveBeenCalledWith({ ...EMPTY, code: "AUTH" });
    });

    it("calls the latest onApply, not the one from the first render", () => {
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender } = renderHook(
            ({ onApply }: { onApply: () => void }) => useDraftFilters(EMPTY, { onApply }),
            { initialProps: { onApply: first } },
        );
        rerender({ onApply: second });

        act(() => result.current.apply());

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });
});

describe("useDraftFilters — applied is stable enough to be a queryKey", () => {
    it("keeps the applied reference across draft edits", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));
        act(() => result.current.apply({ code: "AUTH" }));
        const applied = result.current.applied;

        act(() => result.current.set({ code: "AUTHX" }));

        expect(result.current.applied).toBe(applied);
    });

    it("keeps the applied reference when an equal value is applied again", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));
        act(() => result.current.apply({ code: "AUTH", tags: ["a"] }));
        const applied = result.current.applied;

        act(() => result.current.set({ tags: ["a"] }));
        act(() => result.current.apply());

        expect(result.current.applied).toBe(applied);
    });

    it("uses a custom isEqual for dirtiness and stability", () => {
        const byCode = (a: LogFilter, b: LogFilter): boolean => a.code === b.code;
        const { result } = renderHook(() => useDraftFilters(EMPTY, { isEqual: byCode }));

        act(() => result.current.set({ level: "error" }));
        expect(result.current.isDirty).toBe(false);

        act(() => result.current.apply());
        expect(result.current.applied).toBe(EMPTY);
    });
});

describe("useDraftFilters — clear moves both halves together", () => {
    it("returns draft and applied to the initial value and is clean", () => {
        const onApply = vi.fn();
        const { result } = renderHook(() => useDraftFilters(EMPTY, { onApply }));
        act(() => result.current.apply({ code: "AUTH" }));
        act(() => result.current.set({ level: "error" }));

        act(() => result.current.clear());

        expect(result.current.draft).toBe(EMPTY);
        expect(result.current.applied).toBe(EMPTY);
        expect(result.current.isDirty).toBe(false);
        expect(onApply).toHaveBeenLastCalledWith(EMPTY);
    });

    it("clears to the first initial value, not to a later one", () => {
        const { result, rerender } = renderHook(
            ({ initial }: { initial: LogFilter }) => useDraftFilters(initial),
            { initialProps: { initial: EMPTY } },
        );
        rerender({ initial: { ...EMPTY, code: "LATER" } });
        act(() => result.current.apply({ code: "AUTH" }));

        act(() => result.current.clear());

        expect(result.current.applied).toBe(EMPTY);
    });
});

interface SpeciesFilter {
    species: Set<string>;
}

describe("useDraftFilters — a Set in the filter is compared by its members", () => {
    it("marks the draft dirty when a Set member changes, and apply publishes it", () => {
        const initial: SpeciesFilter = { species: new Set(["ovino"]) };
        const { result } = renderHook(() => useDraftFilters(initial));

        act(() => result.current.set({ species: new Set(["caprino"]) }));
        expect(result.current.isDirty).toBe(true);

        act(() => result.current.apply());
        expect(result.current.applied).not.toBe(initial);
        expect([...result.current.applied.species]).toEqual(["caprino"]);
    });
});

describe("useDraftFilters — discard drops the draft without publishing", () => {
    it("returns the draft to the applied value and never calls onApply", () => {
        const onApply = vi.fn();
        const { result } = renderHook(() => useDraftFilters(EMPTY, { onApply }));
        act(() => result.current.apply({ code: "AUTH" }));
        const applied = result.current.applied;
        onApply.mockClear();
        act(() => result.current.set({ level: "error" }));

        act(() => result.current.discard());

        expect(result.current.draft).toBe(applied);
        expect(result.current.applied).toBe(applied);
        expect(result.current.isDirty).toBe(false);
        expect(onApply).not.toHaveBeenCalled();
    });

    it("lets a bottom sheet clear only the draft with an updater, and still cancel it", () => {
        const onApply = vi.fn();
        const { result } = renderHook(() => useDraftFilters(EMPTY, { onApply }));
        act(() => result.current.apply({ code: "AUTH" }));
        const applied = result.current.applied;
        onApply.mockClear();

        act(() => result.current.set(() => EMPTY));
        expect(result.current.draft).toBe(EMPTY);
        expect(result.current.applied).toBe(applied);
        expect(result.current.isDirty).toBe(true);

        act(() => result.current.discard());
        expect(result.current.draft).toBe(applied);
        expect(onApply).not.toHaveBeenCalled();
    });

    it("keeps the state untouched when there is nothing to discard", () => {
        const { result } = renderHook(() => useDraftFilters(EMPTY));
        const before = result.current;

        act(() => result.current.discard());

        expect(result.current.draft).toBe(before.draft);
        expect(result.current.discard).toBe(before.discard);
    });
});

describe("useDraftFilters — dirty by key set, not key count", () => {
    it("is dirty when the draft swaps an optional key for another, both undefined", () => {
        type Optional = Partial<Record<"from" | "until", string>>;
        const initial: Optional = { from: undefined };
        const { result } = renderHook(() => useDraftFilters(initial));

        act(() => result.current.set(() => ({ until: undefined })));

        expect(result.current.isDirty).toBe(true);
    });
});
