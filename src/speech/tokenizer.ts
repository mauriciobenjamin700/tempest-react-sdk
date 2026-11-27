/**
 * Token ids → text for Whisper's byte-level BPE.
 */

/** The parts of a Hugging Face `tokenizer.json` this module reads. */
export interface WhisperTokenizerJson {
    model: { vocab: Record<string, number> };
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
     * Id of a special token by its text.
     *
     * @param content E.g. `"<|pt|>"`.
     * @returns The id, or `undefined` when the vocabulary has no such token.
     */
    special(content: string): number | undefined;
    /** Ids of every special token. */
    readonly specialIds: ReadonlySet<number>;
}

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
 * Only decoding: transcription never encodes text (the prompt is special
 * tokens looked up by name), which is why this is a few dozen lines rather
 * than a dependency. Bytes are collected across tokens before UTF-8 decoding,
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
    const utf8 = new TextDecoder("utf-8");

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
        special: (content: string): number | undefined => specials.get(content),
        specialIds,
    };
}
