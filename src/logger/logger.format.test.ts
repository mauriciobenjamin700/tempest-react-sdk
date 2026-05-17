import { describe, expect, it, vi } from "vitest";
import { consoleSink, createLogger } from "./logger";

describe("logger format / sinks", () => {
    it("consoleSink writes through console.* without context", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        consoleSink({ level: "info", message: "hello", timestamp: Date.now() });
        expect(info).toHaveBeenCalledWith("hello");
        info.mockRestore();
    });

    it("consoleSink writes with context when provided", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        consoleSink({
            level: "warn",
            message: "ctx",
            context: { key: "v" },
            timestamp: Date.now(),
        });
        expect(warn).toHaveBeenCalledWith("ctx", { key: "v" });
        warn.mockRestore();
    });

    it("debug entries use console.log", () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const logger = createLogger({ level: "debug" });
        logger.debug("trace");
        expect(log).toHaveBeenCalled();
        log.mockRestore();
    });
});
