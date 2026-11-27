/**
 * Token ids → text for Whisper's byte-level BPE.
 */

/** The parts of a Hugging Face `tokenizer.json` this module reads. */
export interface WhisperTokenizerJson {
    model: {
        vocab: Record<string, number>;
        merges?: readonly (string | readonly [string, string])[];
    };
    added_tokens?: readonly { id: number; content: string; special?: boolean }[];
}

/** Decodes generated ids and resolves special tokens by name. */
export interface WhisperTokenizer {
    /**
     * Text of a sequence of ids, skipping special tokens (`<|en|>`,
     * `<|notimestamps|>`, `<|endoftext|>` …).
     *
     * @param ids Generated token ids.
     * @returns The text, UTF-8 decoded across token boundaries.
     */
    decode(ids: readonly number[]): string;
    /**
     * Token ids of plain text (byte-level BPE, as GPT-2 and Whisper encode).
     * Used for the vocabulary prompt; special tokens in the text are not
     * recognised, they are encoded as the characters they are made of.
     *
     * @param text The text.
     * @returns Token ids.
     * @throws Error when the tokenizer JSON carries no merges.
     */
    encode(text: string): number[];
    /**
     * Id of a special token by its text.
     *
     * @param content E.g. `"<|pt|>"`.
     * @returns The id, or `undefined` when the vocabulary has no such token.
     */
    special(content: string): number | undefined;
    /** Ids of every special token. */
    readonly specialIds: ReadonlySet<number>;
}

/** GPT-2's pre-tokenizer: contractions, letter runs, digit runs, symbol runs, whitespace. */
const PRETOKENIZE = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/**
 * GPT-2's byte ↔ printable-character table, which byte-level BPE vocabularies
 * (Whisper's included) are written in: every byte maps to one visible
 * character so a vocabulary entry never holds a raw control byte.
 *
 * @returns Character → byte.
 */
function unicodeToByte(): Map<string, number> {
    const bytes: number[] = [];
    for (let b = 33; b <= 126; b += 1) bytes.push(b);
    for (let b = 161; b <= 172; b += 1) bytes.push(b);
    for (let b = 174; b <= 255; b += 1) bytes.push(b);
    const chars = [...bytes];
    let extra = 0;
    for (let b = 0; b < 256; b += 1) {
        if (!bytes.includes(b)) {
            bytes.push(b);
            chars.push(256 + extra);
            extra += 1;
        }
    }
    return new Map(chars.map((code, index) => [String.fromCharCode(code), bytes[index] as number]));
}

/**
 * Build a decoder from Whisper's `tokenizer.json`.
 *
 * Decoding plus a plain byte-level BPE encode (merges by rank) for the
 * vocabulary prompt; the task prompt itself is special tokens looked up by
 * name. That is all transcription needs, which is why this is a module rather
 * than a dependency. Encoding is pinned against the ids Hugging Face's
 * tokenizer produces for the same text in `tokenizer.test.ts`. Bytes are collected across tokens before UTF-8 decoding,
 * because Whisper often splits one accented character ("ç", "ã") over two
 * tokens — decoding token by token would print replacement characters in the
 * middle of Portuguese words.
 *
 * @param json The parsed `tokenizer.json`.
 * @returns The tokenizer.
 */
export function createWhisperTokenizer(json: WhisperTokenizerJson): WhisperTokenizer {
    const byId: string[] = [];
    for (const [text, id] of Object.entries(json.model.vocab)) byId[id] = text;
    const specials = new Map<string, number>();
    for (const token of json.added_tokens ?? []) {
        byId[token.id] = token.content;
        if (token.special !== false) specials.set(token.content, token.id);
    }
    const specialIds = new Set(specials.values());
    const toByte = unicodeToByte();
    const toChar = new Map([...toByte].map(([char, byte]) => [byte, char]));
    const utf8 = new TextDecoder("utf-8");
    const vocab = new Map(Object.entries(json.model.vocab));
    const ranks = new Map<string, number>();
    for (const [rank, merge] of (json.model.merges ?? []).entries()) {
        ranks.set(typeof merge === "string" ? merge : `${merge[0]} ${merge[1]}`, rank);
    }
    const cache = new Map<string, number[]>();

    const bpe = (word: string): number[] => {
        const cached = cache.get(word);
        if (cached) return cached;
        let parts = [...word];
        for (;;) {
            let best = -1;
            let bestRank = Infinity;
            for (let i = 0; i < parts.length - 1; i += 1) {
                const rank = ranks.get(`${parts[i]} ${parts[i + 1]}`);
                if (rank !== undefined && rank < bestRank) {
                    bestRank = rank;
                    best = i;
                }
            }
            if (best === -1) break;
            const pair = `${parts[best]}${parts[best + 1]}`;
            const merged: string[] = [];
            for (let i = 0; i < parts.length; i += 1) {
                if (
                    i < parts.length - 1 &&
                    `${parts[i]} ${parts[i + 1]}` === `${parts[best]} ${parts[best + 1]}`
                ) {
                    merged.push(pair);
                    i += 1;
                } else {
                    merged.push(parts[i] as string);
                }
            }
            parts = merged;
        }
        const ids = parts.flatMap((part) => {
            const id = vocab.get(part);
            return id === undefined ? [] : [id];
        });
        cache.set(word, ids);
        return ids;
    };

    return {
        decode(ids: readonly number[]): string {
            const bytes: number[] = [];
            for (const id of ids) {
                if (specialIds.has(id)) continue;
                const text = byId[id];
                if (text === undefined) continue;
                for (const char of text) {
                    const byte = toByte.get(char);
                    if (byte !== undefined) bytes.push(byte);
                }
            }
            return utf8.decode(new Uint8Array(bytes));
        },
        encode(text: string): number[] {
            if (ranks.size === 0)
                throw new Error("This tokenizer.json has no BPE merges to encode with.");
            const ids: number[] = [];
            for (const piece of text.match(PRETOKENIZE) ?? []) {
                let word = "";
                for (const byte of new TextEncoder().encode(piece))
                    word += toChar.get(byte) as string;
                ids.push(...bpe(word));
            }
            return ids;
        },
        special: (content: string): number | undefined => specials.get(content),
        specialIds,
    };
}
