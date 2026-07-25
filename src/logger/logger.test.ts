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

describe("createLogger — namespaces and defaults", () => {
    it("nests child namespaces with a colon", () => {
        const lines: string[] = [];
        const root = createLogger({
            sinks: [(entry) => lines.push(entry.message)],
            namespace: "app",
            level: "debug",
        });

        root.child("db").info("oi");
        expect(lines[0]).toBe("[app:db] oi");
    });

    it("uses the child namespace alone when the parent has none", () => {
        const lines: string[] = [];
        const root = createLogger({
            sinks: [(entry) => lines.push(entry.message)],
            level: "debug",
        });

        root.child("http").info("oi");
        expect(lines[0]).toBe("[http] oi");
    });

    it("defaults the threshold to info, dropping debug lines", () => {
        const levels: string[] = [];
        const logger = createLogger({ sinks: [(entry) => levels.push(entry.level)] });

        logger.debug("invisível");
        logger.info("visível");
        expect(levels).toEqual(["info"]);
    });
});
