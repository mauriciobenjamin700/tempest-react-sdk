/**
 * Reduce text to what a PT-BR search compares: no diacritics, lowercase.
 *
 * `toLowerCase` alone leaves "joao" unable to find "João" and "usuarios" unable
 * to find "Usuários" (#730) — and typing without accents is how most people type
 * into a search box on a phone. NFD splits each accented letter into the base
 * letter plus a combining mark, and the marks are dropped. `ç` folds to `c`
 * the same way, which is what a reader expects ("acao" finds "Ação").
 *
 * Internal on purpose: `Command`, `DataTable` and `useClientFilter` share it so
 * the three searches agree on what matches.
 *
 * @param text - Any text.
 * @returns The text with combining marks removed, lowercased.
 */
export function foldText(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
}
