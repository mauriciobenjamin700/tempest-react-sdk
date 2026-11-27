/**
 * Encoding parity with Hugging Face's `tokenizers` on Whisper's real
 * vocabulary (`onnx-community/whisper-base`, vocab and merges only, gzipped).
 * Expected ids were produced with:
 *
 *     uv run --with tokenizers python -c "from tokenizers import Tokenizer; \
 *       t = Tokenizer.from_file('tokenizer.json'); \
 *       print(t.encode(TEXT, add_special_tokens=False).ids)"
 *
 * @vitest-environment node
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { createWhisperTokenizer, type WhisperTokenizerJson } from "./tokenizer";

const json = JSON.parse(
    strFromU8(
        gunzipSync(
            readFileSync(
                fileURLToPath(new URL("./__fixtures__/whisper-tokenizer.json.gz", import.meta.url)),
            ),
        ),
    ),
) as WhisperTokenizerJson;
const tokenizer = createWhisperTokenizer(json);

describe("Whisper tokenizer on the real vocabulary", () => {
    it("encodes Brazilian place names exactly as Hugging Face's tokenizer", () => {
        expect(tokenizer.encode(" Picos, Sobral, Teresina, Juazeiro do Norte, São Luís.")).toEqual([
            430, 9940, 11, 407, 32728, 11, 6564, 279, 1426, 11, 13582, 13660, 5182, 360, 426, 12752,
            11, 22401, 5047, 5113, 13,
        ]);
    });

    it("encodes accented Portuguese exactly as Hugging Face's tokenizer", () => {
        expect(tokenizer.encode(" passagem de ônibus amanhã à noite")).toEqual([
            11497, 76, 368, 24107, 77, 897, 301, 42943, 36320, 1531, 34429,
        ]);
    });

    it("decodes what it encodes", () => {
        const text = " Picos, Sobral, Teresina, Juazeiro do Norte, São Luís.";
        expect(tokenizer.decode(tokenizer.encode(text))).toBe(text);
    });

    it("refuses to encode without merges", () => {
        expect(() => createWhisperTokenizer({ model: { vocab: {} } }).encode("x")).toThrow(
            /merges/,
        );
    });
});
