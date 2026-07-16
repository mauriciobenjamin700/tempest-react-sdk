import { describe, expect, it } from "vitest";
import { removeById, upsertById } from "./optimistic";

interface Note {
    id: string;
    text: string;
}

describe("upsertById", () => {
    it("appends a new item", () => {
        const patch = upsertById<Note>();
        expect(patch([{ id: "a", text: "A" }], { id: "b", text: "B" })).toEqual([
            { id: "a", text: "A" },
            { id: "b", text: "B" },
        ]);
    });

    it("merges into an existing item", () => {
        const patch = upsertById<Note>();
        expect(patch([{ id: "a", text: "A" }], { id: "a", text: "A2" })).toEqual([
            { id: "a", text: "A2" },
        ]);
    });

    it("defaults an undefined cache to a single-item list", () => {
        const patch = upsertById<Note>();
        expect(patch(undefined, { id: "a", text: "A" })).toEqual([{ id: "a", text: "A" }]);
    });

    it("honors a custom id field", () => {
        interface Row {
            uuid: string;
            n: number;
        }
        const patch = upsertById<Row>("uuid");
        expect(patch([{ uuid: "x", n: 1 }], { uuid: "x", n: 2 })).toEqual([{ uuid: "x", n: 2 }]);
    });
});

describe("removeById", () => {
    it("removes the matching entry", () => {
        const patch = removeById<Note>();
        expect(
            patch(
                [
                    { id: "a", text: "A" },
                    { id: "b", text: "B" },
                ],
                { id: "a", text: "A" },
            ),
        ).toEqual([{ id: "b", text: "B" }]);
    });

    it("accepts variables carrying only the id", () => {
        const patch = removeById<Note, { id: string }>();
        expect(patch([{ id: "a", text: "A" }], { id: "a" })).toEqual([]);
    });

    it("is a no-op on an undefined cache", () => {
        const patch = removeById<Note>();
        expect(patch(undefined, { id: "a", text: "A" })).toEqual([]);
    });
});
