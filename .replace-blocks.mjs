import { readFileSync, writeFileSync } from "node:fs";

const FENCE = /```(tsx|ts)\n([\s\S]*?)```/g;

export function replaceBlocks(file, replacements) {
    const src = readFileSync(file, "utf8");
    let index = 0;
    let changed = 0;
    const out = src.replace(FENCE, (whole, lang, code) => {
        index += 1;
        const next = replacements[index];
        if (next === undefined) return whole;
        changed += 1;
        return "```" + lang + "\n" + next.trimEnd() + "\n```";
    });
    writeFileSync(file, out);
    console.log(`${file}: ${changed} bloco(s) reescrito(s)`);
}
