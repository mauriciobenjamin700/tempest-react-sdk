import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { decodeFrame, resetFrameWarnings } from "@/utils/json-frame";
import type { SchemaLike } from "@/utils/schema-like";

interface Payload {
    id: string;
}

const payloadSchema = z.object({ id: z.string() });

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
        const decoded = decodeFrame<Payload>('{"id":"42"}', "test", {});
        expect(decoded).toEqual({ delivered: true, data: { id: "42" } });
        expect(warn).not.toHaveBeenCalled();
    });

    it("hands the frame to a caller-supplied parser and always delivers its result", () => {
        const parser = vi.fn((raw: string) => ({ id: raw.trim() }));
        const decoded = decodeFrame<Payload>("  not json  ", "test", { parser });
        expect(parser).toHaveBeenCalledWith("  not json  ");
        expect(decoded).toEqual({ delivered: true, data: { id: "not json" } });
        expect(warn).not.toHaveBeenCalled();
    });

    it("drops the frame and reports when onParseError is registered", () => {
        const onParseError = vi.fn();
        const decoded = decodeFrame<Payload>("<html>oops", "test", { onParseError });
        expect(decoded.delivered).toBe(false);
        expect(onParseError).toHaveBeenCalledTimes(1);
        expect(onParseError.mock.calls[0]?.[1]).toBe("<html>oops");
        expect(onParseError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });

    it("keeps the legacy fallback when nothing is registered", () => {
        const decoded = decodeFrame<Payload>("plain text", "test", {});
        expect(decoded.delivered).toBe(true);
        expect(decoded.data).toBe("plain text" as unknown as Payload);
    });

    it("warns once per transport rather than once per frame", () => {
        for (let i = 0; i < 5; i += 1) {
            decodeFrame<Payload>("plain text", "createWebSocket", {});
        }
        decodeFrame<Payload>("plain text", "createEventStream", {});

        expect(warn).toHaveBeenCalledTimes(2);
        expect(String(warn.mock.calls[0]?.[0])).toContain("createWebSocket");
        expect(String(warn.mock.calls[1]?.[0])).toContain("createEventStream");
    });

    it("stays quiet when a failure is handled", () => {
        decodeFrame<Payload>("plain text", "createWebSocket", { onParseError: vi.fn() });
        expect(warn).not.toHaveBeenCalled();
    });

    describe("with a schema", () => {
        it("delivers a payload that matches", () => {
            const decoded = decodeFrame<Payload>('{"id":"42"}', "test", {
                schema: payloadSchema,
            });
            expect(decoded).toEqual({ delivered: true, data: { id: "42" } });
        });

        it("drops a payload that does not match and reports the issues", () => {
            const onValidationError = vi.fn();
            const decoded = decodeFrame<Payload>('{"id":7}', "test", {
                schema: payloadSchema,
                onValidationError,
            });

            expect(decoded.delivered).toBe(false);
            expect(onValidationError).toHaveBeenCalledTimes(1);
            expect(onValidationError.mock.calls[0]?.[1]).toBe('{"id":7}');
            const issues = onValidationError.mock.calls[0]?.[0] as { path: string }[];
            expect(issues[0]?.path).toBe("id");
        });

        it("refuses the empty frame that used to arrive as an empty string", () => {
            const onValidationError = vi.fn();
            const decoded = decodeFrame<Payload>("", "test", {
                schema: payloadSchema,
                onValidationError,
            });

            expect(decoded.delivered).toBe(false);
            expect(onValidationError).toHaveBeenCalledTimes(1);
            expect(warn).not.toHaveBeenCalled();
        });

        it("lets onParseError keep the frame that is not JSON at all", () => {
            const onParseError = vi.fn();
            const onValidationError = vi.fn();
            const decoded = decodeFrame<Payload>("<html>oops", "test", {
                schema: payloadSchema,
                onParseError,
                onValidationError,
            });

            expect(decoded.delivered).toBe(false);
            expect(onParseError).toHaveBeenCalledTimes(1);
            expect(onValidationError).not.toHaveBeenCalled();
        });

        it("validates what the parser returned, not the raw frame", () => {
            const decoded = decodeFrame<Payload>("42", "test", {
                parser: (raw) => ({ id: raw }),
                schema: payloadSchema,
            });
            expect(decoded).toEqual({ delivered: true, data: { id: "42" } });

            const onValidationError = vi.fn();
            const dropped = decodeFrame<Payload>("42", "test", {
                parser: (raw) => ({ id: Number(raw) }) as unknown as Payload,
                schema: payloadSchema,
                onValidationError,
            });
            expect(dropped.delivered).toBe(false);
            expect(onValidationError).toHaveBeenCalledTimes(1);
        });

        it("delivers the schema's output, so a coercion or default is honoured", () => {
            const coercing = z.object({ id: z.coerce.string(), seen: z.boolean().default(false) });
            const decoded = decodeFrame<{ id: string; seen: boolean }>('{"id":7}', "test", {
                schema: coercing,
            });
            expect(decoded).toEqual({ delivered: true, data: { id: "7", seen: false } });
        });

        it("warns once when a frame is dropped with nobody listening", () => {
            for (let i = 0; i < 3; i += 1) {
                decodeFrame<Payload>('{"id":7}', "createEventStream", { schema: payloadSchema });
            }

            expect(warn).toHaveBeenCalledTimes(1);
            const message = String(warn.mock.calls[0]?.[0]);
            expect(message).toContain("createEventStream");
            expect(message).toContain("id:");
            expect(message).toContain("onValidationError");
        });

        it("accepts a Standard Schema from any vendor, not only zod", () => {
            const standard: SchemaLike<Payload> = {
                "~standard": {
                    validate: (value: unknown) =>
                        typeof (value as Payload | null)?.id === "string"
                            ? { value: value as Payload }
                            : { issues: [{ message: "expected id", path: [{ key: "id" }] }] },
                },
            };

            expect(decodeFrame<Payload>('{"id":"7"}', "test", { schema: standard })).toEqual({
                delivered: true,
                data: { id: "7" },
            });

            const onValidationError = vi.fn();
            decodeFrame<Payload>("{}", "test", { schema: standard, onValidationError });
            expect(onValidationError.mock.calls[0]?.[0]).toEqual([
                { path: "id", message: "expected id" },
            ]);
        });

        it("reports an async schema instead of awaiting it", () => {
            const asyncSchema: SchemaLike<Payload> = {
                "~standard": {
                    validate: () => Promise.resolve({ value: { id: "42" } }),
                },
            };
            const onValidationError = vi.fn();

            const decoded = decodeFrame<Payload>('{"id":"42"}', "test", {
                schema: asyncSchema,
                onValidationError,
            });

            expect(decoded.delivered).toBe(false);
            const issues = onValidationError.mock.calls[0]?.[0] as { message: string }[];
            expect(issues[0]?.message).toContain("asynchronously");
        });

        it("accepts a .safeParse schema older than `~standard`", () => {
            const legacy: SchemaLike<Payload> = {
                safeParse: (value: unknown) =>
                    typeof (value as Payload | null)?.id === "string"
                        ? { success: true, data: value as Payload }
                        : { success: false, error: { issues: [{ message: "bad", path: ["id"] }] } },
            };

            expect(decodeFrame<Payload>('{"id":"7"}', "test", { schema: legacy }).data).toEqual({
                id: "7",
            });

            const onValidationError = vi.fn();
            decodeFrame<Payload>("{}", "test", { schema: legacy, onValidationError });
            expect(onValidationError.mock.calls[0]?.[0]).toEqual([{ path: "id", message: "bad" }]);
        });

        it("names the root when the issue has no path", () => {
            const rootOnly: SchemaLike<Payload> = {
                "~standard": {
                    validate: () => ({ issues: [{ message: "expected an object" }] }),
                },
            };
            const onValidationError = vi.fn();

            decodeFrame<Payload>('"a string"', "test", { schema: rootOnly, onValidationError });
            expect(onValidationError.mock.calls[0]?.[0]).toEqual([
                { path: "<root>", message: "expected an object" },
            ]);
        });
    });
});
