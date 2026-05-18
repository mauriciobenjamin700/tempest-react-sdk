import { describe, expect, it } from "vitest";
import { createMockHandlers } from "./create-mock-handlers";

describe("createMockHandlers", () => {
    it("applies defaults for status, body, headers and delayMs", () => {
        const [h] = createMockHandlers([{ method: "GET", path: "/x" }]);
        expect(h.status).toBe(200);
        expect(h.body).toBeNull();
        expect(h.headers).toEqual({ "Content-Type": "application/json" });
        expect(h.delayMs).toBe(0);
    });

    it("preserves explicit values", () => {
        const [h] = createMockHandlers([
            {
                method: "POST",
                path: "/orders",
                status: 201,
                body: { id: "o1" },
                headers: { "X-Trace": "abc" },
                delayMs: 50,
            },
        ]);
        expect(h.method).toBe("POST");
        expect(h.path).toBe("/orders");
        expect(h.status).toBe(201);
        expect(h.body).toEqual({ id: "o1" });
        expect(h.headers).toEqual({ "X-Trace": "abc" });
        expect(h.delayMs).toBe(50);
    });

    it("handles an empty list", () => {
        expect(createMockHandlers([])).toEqual([]);
    });
});
