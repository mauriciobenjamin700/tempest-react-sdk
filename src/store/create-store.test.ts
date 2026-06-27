import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "./create-store";

interface CounterState {
    count: number;
    inc: () => void;
    set: (n: number) => void;
}

const initializer = (set: (fn: (s: CounterState) => Partial<CounterState>) => void) => ({
    count: 0,
    inc: () => set((s) => ({ count: s.count + 1 })),
    set: (n: number) => set(() => ({ count: n })),
});

describe("createStore", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it("creates a working store without persistence", () => {
        const useStore = createStore<CounterState>(initializer);
        expect(useStore.getState().count).toBe(0);
        useStore.getState().inc();
        expect(useStore.getState().count).toBe(1);
    });

    it("persists state to localStorage when configured", () => {
        const useStore = createStore<CounterState>(initializer, {
            persist: { name: "counter", partialize: (s) => ({ count: s.count }) },
        });
        useStore.getState().set(42);
        const raw = localStorage.getItem("counter");
        expect(raw).toContain("42");
    });

    it("uses sessionStorage when storage is 'session'", () => {
        const useStore = createStore<CounterState>(initializer, {
            persist: { name: "counter-session", storage: "session" },
        });
        useStore.getState().set(7);
        expect(sessionStorage.getItem("counter-session")).toContain("7");
        expect(localStorage.getItem("counter-session")).toBeNull();
    });

    it("rehydrates persisted state into a new store instance", () => {
        const first = createStore<CounterState>(initializer, {
            persist: { name: "shared", partialize: (s) => ({ count: s.count }) },
        });
        first.getState().set(99);

        const second = createStore<CounterState>(initializer, {
            persist: { name: "shared", partialize: (s) => ({ count: s.count }) },
        });
        expect(second.getState().count).toBe(99);
    });
});
