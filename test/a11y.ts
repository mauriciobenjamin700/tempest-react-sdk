import axe, { type Result, type RunOptions } from "axe-core";

/**
 * Axe configuration shared by every accessibility test.
 *
 * Two rules are off by design:
 *
 * - `color-contrast` — jsdom does no layout or paint, so axe cannot read
 *   computed colors and would either skip the rule or report noise. Contrast
 *   belongs to the real-browser gallery smoke.
 * - `region` — it asks that all page content sit inside a landmark, which is a
 *   property of the *page*, not of a component rendered on its own into
 *   `document.body`. Auditing it here would flag every component in the sweep
 *   for something the consuming app owns.
 */
const DEFAULT_OPTIONS: RunOptions = {
    rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
    },
};

/**
 * Run axe-core against a rendered container and return the violations found.
 *
 * @param container - Element to audit. Must be attached to `document` — axe
 *   walks the real tree, so a detached node reports nothing.
 * @param options - Extra axe options, merged over the shared defaults.
 * @returns The violation list, empty when the subtree is clean.
 */
export async function findA11yViolations(
    container: Element,
    options: RunOptions = {},
): Promise<Result[]> {
    const results = await axe.run(container, { ...DEFAULT_OPTIONS, ...options });
    return results.violations;
}

/**
 * Format violations as a readable assertion message: one line per rule with
 * the offending selectors, so a failure names the element instead of dumping
 * the whole axe payload.
 *
 * @param violations - Violations returned by {@link findA11yViolations}.
 * @returns A multi-line summary, or an empty string when there are none.
 */
export function formatA11yViolations(violations: Result[]): string {
    return violations
        .map((violation) => {
            const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
            return `[${violation.id}] ${violation.help} → ${targets}`;
        })
        .join("\n");
}
