type ClassValue =
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined
    | ClassValue[];

/**
 * Tiny classnames helper. Accepts strings, falsy values and nested arrays.
 *
 * @param values - Class entries, conditionally truthy.
 * @returns A single space-joined class string.
 */
export function cn(...values: ClassValue[]): string {
    const out: string[] = [];
    for (const value of values) {
        if (value === null || value === undefined || value === false || value === true) {
            continue;
        }
        if (typeof value === "string") {
            if (value) out.push(value);
        } else if (typeof value === "number" || typeof value === "bigint") {
            out.push(String(value));
        } else if (Array.isArray(value)) {
            const nested = cn(...value);
            if (nested) out.push(nested);
        }
    }
    return out.join(" ");
}
