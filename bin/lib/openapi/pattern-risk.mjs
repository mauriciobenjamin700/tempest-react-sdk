/**
 * Static check for the regular expressions a spec's `pattern` keywords become.
 *
 * The generated Zod schema compiles each `pattern` with `new RegExp(...)` and
 * runs it on every value the app validates. V8 backtracks, so a pattern with a
 * repeated group whose body can itself match a variable amount — `^(a+)+$` — is
 * exponential on a near-miss input: 28 characters took 873 ms and every extra
 * one doubles it (Node 24.15, `/^(a+)+$/.test("a".repeat(28) + "!")`). The app
 * tab freezes on its own data. A spec is input the developer does not control,
 * so `tempest gen api` flags such a pattern when it generates the schema (#533).
 */

/**
 * Parse the quantifier starting at `pattern[i]`, if any.
 *
 * @param {string} pattern - The regex source.
 * @param {number} i - Index right after an atom.
 * @returns {{ min: number, max: number, length: number } | null} The bounds
 *   (`max` is `Infinity` when unbounded) and how many characters the quantifier
 *   spans, its lazy `?` included; `null` when no quantifier starts there.
 */
function quantifierAt(pattern, i) {
    const ch = pattern[i];
    let q = null;
    if (ch === "*") q = { min: 0, max: Infinity, length: 1 };
    else if (ch === "+") q = { min: 1, max: Infinity, length: 1 };
    else if (ch === "?") q = { min: 0, max: 1, length: 1 };
    else if (ch === "{") {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
        if (m) {
            const min = Number(m[1]);
            const max = m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]);
            q = { min, max, length: m[0].length };
        }
    }
    if (q && pattern[i + q.length] === "?") q.length += 1;
    return q;
}

/**
 * Index right after the character class that opens at `pattern[i]` (`[`).
 *
 * @param {string} pattern - The regex source.
 * @param {number} i - Index of the `[`.
 * @returns {number} Index after the closing `]`, or the pattern's length.
 */
function classEnd(pattern, i) {
    let j = i + 1;
    while (j < pattern.length && pattern[j] !== "]") j += pattern[j] === "\\" ? 2 : 1;
    return j + 1;
}

/**
 * Length of a group's opening syntax at `pattern[i]` (`(`, `(?:`, `(?=`,
 * `(?<name>`, ...), so its `?` is not read as a quantifier.
 *
 * @param {string} pattern - The regex source.
 * @param {number} i - Index of the `(`.
 * @returns {number} Characters to skip.
 */
function groupOpenLength(pattern, i) {
    if (pattern[i + 1] !== "?") return 1;
    if (pattern[i + 2] === "<" && pattern[i + 3] !== "=" && pattern[i + 3] !== "!") {
        const close = pattern.indexOf(">", i);
        return close === -1 ? 1 : close - i + 1;
    }
    return pattern[i + 2] === "<" ? 4 : 3;
}

/**
 * Whether a regex source has a repeated group whose body ends in a
 * variable-length repetition — the nested-quantifier shape behind most
 * catastrophic backtracking (`(a+)+`, `(\w+\s?)*`, `((x*))+`).
 *
 * "Ends in" is what keeps the common safe patterns quiet: in
 * `^([a-z0-9]+-)*[a-z0-9]+$` every iteration must end on the mandatory `-`, so
 * the inner `+` cannot trade characters with the next iteration and the group is
 * not flagged; only optional atoms (`?`, `*`, `{0,n}`) may follow the inner
 * repetition for the group to count. Fixed counts (`(\d{3})+`) are not variable
 * and do not count.
 *
 * This is a heuristic for one shape, not a proof of safety: overlapping
 * alternation (`(a|aa)+`) and backreferences are not analysed. A flag is a
 * warning to read the pattern, not a verdict.
 *
 * @param {string} pattern - The regex source from the spec.
 * @returns {boolean} `true` when the nested-quantifier shape is present.
 */
export function hasNestedQuantifier(pattern) {
    const frames = [{ tail: false, anyAlternative: false }];
    let i = 0;
    while (i < pattern.length) {
        const ch = pattern[i];
        const frame = frames[frames.length - 1];
        if (ch === "|") {
            frame.anyAlternative ||= frame.tail;
            frame.tail = false;
            i += 1;
            continue;
        }
        if (ch === "(") {
            frames.push({ tail: false, anyAlternative: false });
            i += groupOpenLength(pattern, i);
            continue;
        }
        let groupTail = false;
        let isGroup = false;
        if (ch === ")") {
            if (frames.length === 1) {
                i += 1;
                continue;
            }
            const closed = frames.pop();
            groupTail = closed.anyAlternative || closed.tail;
            isGroup = true;
            i += 1;
        } else if (ch === "[") {
            i = classEnd(pattern, i);
        } else if (ch === "\\") {
            i += 2;
        } else {
            i += 1;
        }
        const outer = frames[frames.length - 1];
        const q = quantifierAt(pattern, i);
        if (q) i += q.length;
        const repeats = q !== null && q.max > 1;
        if (isGroup && groupTail && repeats) return true;
        const variable = repeats && q.max > q.min;
        if (variable || (isGroup && groupTail && !repeats)) outer.tail = true;
        else if (!q || q.min > 0) outer.tail = false;
    }
    return false;
}
