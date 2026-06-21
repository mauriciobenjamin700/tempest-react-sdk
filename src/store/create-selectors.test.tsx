import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { createStore } from "./create-store";
import { createSelectors } from "./create-selectors";

interface State {
    name: string;
    count: number;
    setName: (n: string) => void;
}

describe("createSelectors", () => {
    it("exposes one selector hook per state key", () => {
        const store = createSelectors(
            createStore<State>((set) => ({
                name: "ada",
                count: 0,
                setName: (n) => set({ name: n }),
            })),
        );
        expect(typeof store.use.name).toBe("function");
        expect(typeof store.use.count).toBe("function");
        expect(typeof store.use.setName).toBe("function");
    });

    it("selector hook returns the live field value", () => {
        const store = createSelectors(
            createStore<State>((set) => ({
                name: "ada",
                count: 0,
                setName: (n) => set({ name: n }),
            })),
        );

        function View() {
            const name = store.use.name();
            return <span>{name}</span>;
        }

        render(<View />);
        expect(screen.getByText("ada")).toBeInTheDocument();

        act(() => store.getState().setName("grace"));
        expect(screen.getByText("grace")).toBeInTheDocument();
    });
});
