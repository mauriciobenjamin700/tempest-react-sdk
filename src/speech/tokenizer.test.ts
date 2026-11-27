import { describe, expect, it } from "vitest";

import { createWhisperTokenizer } from "./tokenizer";

const JSON_FIXTURE = {
    model: {
        vocab: {
            "ĠolÃ¡": 1,
            Ġmund: 2,
            o: 3,
            Ã: 4,
            "§": 5,
            Ġa: 6,
        },
    },
    added_tokens: [
        { id: 50257, content: "<|endoftext|>", special: true },
        { id: 50267, content: "<|pt|>", special: true },
        { id: 50363, content: "<|notimestamps|>", special: true },
    ],
};

describe("createWhisperTokenizer", () => {
    it("maps byte-level BPE back to text, spaces included", () => {
        const tokenizer = createWhisperTokenizer(JSON_FIXTURE);
        expect(tokenizer.decode([1, 2, 3])).toBe(" olá mundo");
    });

    it("joins an accented character split across two tokens", () => {
        const tokenizer = createWhisperTokenizer(JSON_FIXTURE);
        expect(tokenizer.decode([6, 4, 5])).toBe(" aç");
    });

    it("skips special tokens and unknown ids", () => {
        const tokenizer = createWhisperTokenizer(JSON_FIXTURE);
        expect(tokenizer.decode([50267, 50363, 1, 99_999, 50257])).toBe(" olá");
    });

    it("looks special tokens up by text", () => {
        const tokenizer = createWhisperTokenizer(JSON_FIXTURE);
        expect(tokenizer.special("<|pt|>")).toBe(50267);
        expect(tokenizer.special("<|xx|>")).toBeUndefined();
        expect(tokenizer.specialIds.has(50257)).toBe(true);
    });

    it("treats added tokens marked non-special as text", () => {
        const tokenizer = createWhisperTokenizer({
            model: { vocab: {} },
            added_tokens: [{ id: 7, content: "ok", special: false }],
        });
        expect(tokenizer.decode([7])).toBe("ok");
        expect(tokenizer.specialIds.size).toBe(0);
    });
});
