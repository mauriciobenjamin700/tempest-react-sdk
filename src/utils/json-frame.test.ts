import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFrame, resetFrameWarnings } from "@/utils/json-frame";

interface Payload {
    id: string;
}

describe("decodeFrame", () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetFrameWarnings();
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it("parses JSON and delivers it", () => {
        const decoded = decodeFrame<Payload>('{"id":"42"}', undefined, undefined, "test");
        expect(decoded).toEqual({ delivered: true, data: { id: "42" } });
        expect(warn).not.toHaveBeenCalled();
    });

    it("hands the frame to a caller-supplied parser and always delivers its result", () => {
        const parser = vi.fn((raw: string) => ({ id: raw.trim() }));
        const decoded = decodeFrame<Payload>("  not json  ", parser, undefined, "test");
        expect(parser).toHaveBeenCalledWith("  not json  ");
        expect(decoded).toEqual({ delivered: true, data: { id: "not json" } });
        expect(warn).not.toHaveBeenCalled();
    });

    it("drops the frame and reports when onParseError is registered", () => {
        const onParseError = vi.fn();
        const decoded = decodeFrame<Payload>("<html>oops", undefined, onParseError, "test");
        expect(decoded.delivered).toBe(false);
        expect(onParseError).toHaveBeenCalledTimes(1);
        expect(onParseError.mock.calls[0]?.[1]).toBe("<html>oops");
        expect(onParseError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });

    it("keeps the legacy fallback when nothing is registered", () => {
        const decoded = decodeFrame<Payload>("plain text", undefined, undefined, "test");
        expect(decoded.delivered).toBe(true);
        expect(decoded.data).toBe("plain text" as unknown as Payload);
    });

    it("warns once per transport rather than once per frame", () => {
        for (let i = 0; i < 5; i += 1) {
            decodeFrame<Payload>("plain text", undefined, undefined, "createWebSocket");
        }
        decodeFrame<Payload>("plain text", undefined, undefined, "createEventStream");

        expect(warn).toHaveBeenCalledTimes(2);
        expect(String(warn.mock.calls[0]?.[0])).toContain("createWebSocket");
        expect(String(warn.mock.calls[1]?.[0])).toContain("createEventStream");
    });

    it("stays quiet when a failure is handled", () => {
        decodeFrame<Payload>("plain text", undefined, vi.fn(), "createWebSocket");
        expect(warn).not.toHaveBeenCalled();
    });
});
