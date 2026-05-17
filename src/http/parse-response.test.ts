import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseResponse } from "./parse-response";

const schema = z.object({ id: z.string(), name: z.string() });

describe("parseResponse", () => {
    it("returns parsed payload on success", () => {
        const result = parseResponse(schema, { id: "1", name: "x" }, "GET /x");
        expect(result.id).toBe("1");
    });

    it("throws a detailed error in dev when contract drifts", () => {
        expect(() => parseResponse(schema, { id: "1" }, "GET /x")).toThrow(/parseResponse/);
    });
});
