import { describe, expect, it } from "vitest";

import { base64ToBytes, bytesToBase64 } from "./base64";

/**
 * The byte-at-a-time loop the other call sites used, kept as the oracle.
 *
 * The shared encoder walks 32 KiB windows instead, which is the whole reason it
 * is the version worth sharing. That makes "the two agree" the property to pin:
 * the fast form is only safe to adopt everywhere if it is byte-identical to the
 * obvious one, including at a window boundary.
 *
 * @param bytes - The bytes to encode.
 * @returns Padded standard base64.
 */
function naive(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

describe("bytesToBase64", () => {
    it("agrees with the byte-at-a-time form, including across a chunk boundary", () => {
        const sizes = [0, 1, 2, 3, 0x7fff, 0x8000, 0x8001, 0x8000 * 2 + 5];

        for (const size of sizes) {
            const buffer = new Uint8Array(size);
            for (let index = 0; index < size; index += 1) buffer[index] = index % 256;

            expect(bytesToBase64(buffer), `size ${size}`).toBe(naive(buffer));
        }
    });

    it("encodes the empty buffer as the empty string", () => {
        expect(bytesToBase64(bytes())).toBe("");
    });

    it("uses the url-safe alphabet and drops padding when asked", () => {
        const value = bytes(0xfb, 0xff, 0xfe);

        expect(bytesToBase64(value)).toBe("+//+");
        expect(bytesToBase64(value, { urlSafe: true })).toBe("-__-");
        expect(bytesToBase64(bytes(1), { urlSafe: true })).toBe("AQ");
        expect(bytesToBase64(bytes(1))).toBe("AQ==");
    });
});

describe("base64ToBytes", () => {
    it("accepts both alphabets, padded or not", () => {
        for (const encoded of ["+//+", "-__-"]) {
            expect([...base64ToBytes(encoded)]).toEqual([0xfb, 0xff, 0xfe]);
        }
        for (const encoded of ["AQ", "AQ=="]) {
            expect([...base64ToBytes(encoded)]).toEqual([1]);
        }
    });

    it("round-trips a buffer larger than one chunk, in both alphabets", () => {
        const buffer = new Uint8Array(0x8000 * 2 + 7);
        for (let index = 0; index < buffer.length; index += 1) buffer[index] = (index * 31) % 256;

        expect(base64ToBytes(bytesToBase64(buffer))).toEqual(buffer);
        expect(base64ToBytes(bytesToBase64(buffer, { urlSafe: true }))).toEqual(buffer);
    });

    it("does not lose the last byte of unpadded base64url", () => {
        const buffer = bytes(1, 2, 3, 4, 5);
        const encoded = bytesToBase64(buffer, { urlSafe: true });

        expect(encoded.endsWith("=")).toBe(false);
        expect([...base64ToBytes(encoded)]).toEqual([1, 2, 3, 4, 5]);
    });

    it("decodes the empty string to an empty buffer", () => {
        expect(base64ToBytes("")).toEqual(new Uint8Array(0));
    });
});
