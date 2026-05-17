import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger";

describe("createLogger", () => {
    it("respects the level threshold", () => {
        const sink = vi.fn();
        const logger = createLogger({ level: "warn", sinks: [sink] });
        logger.debug("d");
        logger.info("i");
        logger.warn("w");
        logger.error("e");
        expect(sink).toHaveBeenCalledTimes(2);
    });

    it("prefixes namespace via child()", () => {
        const sink = vi.fn();
        const logger = createLogger({ level: "debug", sinks: [sink] });
        logger.child("auth").info("login ok");
        expect(sink.mock.calls[0][0].message).toBe("[auth] login ok");
    });

    it("does not break on sink failure", () => {
        const sink = vi.fn(() => {
            throw new Error("sink failed");
        });
        const logger = createLogger({ level: "debug", sinks: [sink] });
        expect(() => logger.info("x")).not.toThrow();
    });
});
