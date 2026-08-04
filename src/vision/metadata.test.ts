import { describe, expect, it } from "vitest";

import {
    classificationNumClasses,
    detectionNumClasses,
    modelNames,
    readModelMetadata,
} from "./index";

/** Field number of `metadata_props` in `ModelProto`. */
const METADATA_PROPS_FIELD = 14;

/**
 * Encode a base-128 varint.
 *
 * @param value Non-negative integer to encode.
 * @returns Its varint bytes.
 */
function varint(value: number): number[] {
    const out: number[] = [];
    let remaining = value;
    while (remaining > 0x7f) {
        out.push((remaining & 0x7f) | 0x80);
        remaining = Math.floor(remaining / 128);
    }
    out.push(remaining);
    return out;
}

/**
 * Encode a length-delimited protobuf field.
 *
 * @param field Field number.
 * @param payload Bytes of the field's value.
 * @returns The encoded field.
 */
function lengthDelimited(field: number, payload: readonly number[]): number[] {
    return [...varint((field << 3) | 2), ...varint(payload.length), ...payload];
}

/**
 * Build a minimal `ModelProto` carrying only a metadata map.
 *
 * Real wire format rather than a stand-in, so the reader is exercised against
 * what an exporter actually writes.
 *
 * @param entries Metadata key/value pairs.
 * @returns The encoded model bytes.
 */
function modelProto(entries: Readonly<Record<string, string>>): Uint8Array {
    const encoder = new TextEncoder();
    const bytes: number[] = [];
    for (const [key, value] of Object.entries(entries)) {
        const entry = [
            ...lengthDelimited(1, [...encoder.encode(key)]),
            ...lengthDelimited(2, [...encoder.encode(value)]),
        ];
        bytes.push(...lengthDelimited(METADATA_PROPS_FIELD, entry));
    }
    return new Uint8Array(bytes);
}

describe("vision · readModelMetadata", () => {
    it("reads the metadata map an exporter wrote", () => {
        const model = modelProto({
            task: "classify",
            imgsz: "[224, 224]",
            names: "{0: 'deworm', 1: 'not_deworm'}",
        });

        expect(readModelMetadata(model)).toEqual({
            task: "classify",
            imgsz: "[224, 224]",
            names: "{0: 'deworm', 1: 'not_deworm'}",
        });
    });

    it("returns an empty map for junk instead of throwing", () => {
        expect(readModelMetadata(new Uint8Array([0xff, 0xff, 0xff]))).toEqual({});
        expect(readModelMetadata(new Uint8Array())).toEqual({});
    });
});

describe("vision · modelNames", () => {
    it("parses the dict repr Ultralytics writes", () => {
        expect(modelNames({ names: "{0: 'deworm', 1: 'not_deworm'}" })).toEqual([
            "deworm",
            "not_deworm",
        ]);
        expect(modelNames({ names: "{0: 'ocular-mucosa'}" })).toEqual(["ocular-mucosa"]);
    });

    it("rejects anything it cannot use whole", () => {
        expect(modelNames({ names: "{1: 'a', 2: 'b'}" })).toBeNull();
        expect(modelNames({ names: "['a']" })).toBeNull();
        expect(modelNames(undefined)).toBeNull();
    });
});

describe("vision · numClasses inference", () => {
    it("reads nc off a YOLO head declaring (B, 4 + nc, N)", () => {
        expect(detectionNumClasses([1, 84, 8400])).toBe(80);
        expect(detectionNumClasses([1, 5, 8400])).toBe(1);
        expect(detectionNumClasses([1, null, null])).toBeNull();
    });

    it("reads nc off a classifier head declaring (B, nc)", () => {
        expect(classificationNumClasses([1, 2])).toBe(2);
        expect(classificationNumClasses([1, null])).toBeNull();
    });
});
