// The escape hatch. A limit you can never exceed stops being a default and
// becomes a reason to silence the tool, so exceeding one is allowed — out loud.
//
//   /**
//    * Interactive image cropper.
//    *
//    * @tempest-limits file-lines — pointer drag, wheel zoom, aspect clamping and
//    * canvas export share one piece of geometry state.
//    */
//
// The rule id (or `*`) says what is waived; the text after it says why. A marker
// with no reason is itself reported: an unexplained waiver is the thing this is
// meant to prevent.

/** Minimum characters of prose that count as an actual reason. */
const MIN_REASON = 12;

/**
 * Parse every `@tempest-limits` marker out of a file's comment text.
 *
 * @param {string} commentText - Comment text from `maskSource`.
 * @returns {{ waived: Set<string>, reasons: Map<string, string>, unexplained: string[] }}
 *   `waived` holds the rule ids (possibly `*`); `reasons` maps id → reason;
 *   `unexplained` lists ids whose marker carried no usable reason.
 */
export function parseMarkers(commentText) {
    const waived = new Set();
    const reasons = new Map();
    const unexplained = [];

    const re = /@tempest-limits\s+([\w-]+(?:\s*,\s*[\w-]+)*|\*)([^\n]*(?:\n\s*\*(?!\/)[^\n]*)*)/g;
    let match;
    while ((match = re.exec(commentText))) {
        const ids = match[1]
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        const reason = cleanReason(match[2] ?? "");
        for (const id of ids) {
            waived.add(id);
            if (reason.length >= MIN_REASON) reasons.set(id, reason);
            else unexplained.push(id);
        }
    }

    return { waived, reasons, unexplained };
}

/**
 * Strip the JSDoc furniture from the text trailing a marker: leading dashes or
 * colon, and the `*` that opens each continuation line.
 *
 * @param {string} raw
 * @returns {string}
 */
function cleanReason(raw) {
    return raw
        .split("\n")
        .map((line) => line.replace(/^\s*\*\s?/, ""))
        .join(" ")
        .replace(/^\s*[—–\-:]+\s*/, "")
        .replace(/\*\/\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Whether a rule is waived for a file.
 *
 * @param {{ waived: Set<string> }} markers
 * @param {string} code
 * @returns {boolean}
 */
export function isWaived(markers, code) {
    return markers.waived.has("*") || markers.waived.has(code);
}
