import { describe, expect, it } from "vitest";
import { createQueryKeys } from "./create-query-keys";

describe("createQueryKeys", () => {
    it("scopes static entries", () => {
        const keys = createQueryKeys("user", {
            list: ["list"] as const,
        });
        expect(keys.all).toEqual(["user"]);
        expect(keys.list).toEqual(["user", "list"]);
    });

    it("scopes function entries", () => {
        const keys = createQueryKeys("user", {
            byId: (id: string) => [id] as const,
        });
        expect(keys.byId("42")).toEqual(["user", "42"]);
    });
});
