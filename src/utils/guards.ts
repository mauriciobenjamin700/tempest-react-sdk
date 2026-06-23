/**
 * Type guard asserting a value is neither `null` nor `undefined`.
 *
 * Useful for narrowing in `Array.prototype.filter` to drop nullish entries
 * while preserving the element type.
 *
 * @example
 * const xs: (number | null)[] = [1, null, 2];
 * const clean: number[] = xs.filter(isDefined); // [1, 2]
 */
export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}

/**
 * Type guard asserting a value is a string primitive.
 *
 * @example
 * isString("hi"); // true
 * isString(42);   // false
 */
export function isString(value: unknown): value is string {
    return typeof value === "string";
}

/**
 * Type guard asserting a value is a number, excluding `NaN`.
 *
 * @example
 * isNumber(42);       // true
 * isNumber(NaN);      // false
 * isNumber("42");     // false
 */
export function isNumber(value: unknown): value is number {
    return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Type guard asserting a value is a plain object literal.
 *
 * Returns `false` for arrays, `null`, dates, maps, sets, and class instances —
 * only objects created from `{}` / `Object.create(null)` / object literals pass.
 *
 * @example
 * isPlainObject({ a: 1 });     // true
 * isPlainObject([]);           // false
 * isPlainObject(null);         // false
 * isPlainObject(new Date());   // false
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Assert that a code path is unreachable, throwing at runtime if reached.
 *
 * Use in the `default` branch of an exhaustive `switch` so TypeScript flags any
 * unhandled union member at compile time and the runtime fails loudly if an
 * unexpected value slips through.
 *
 * @param value - The value that should be of type `never`.
 * @param message - Optional custom error message.
 * @throws {Error} Always.
 *
 * @example
 * type Shape = "circle" | "square";
 * function area(shape: Shape): number {
 *   switch (shape) {
 *     case "circle": return 1;
 *     case "square": return 2;
 *     default: return assertNever(shape);
 *   }
 * }
 */
export function assertNever(value: never, message?: string): never {
    throw new Error(message ?? `Unexpected value: ${String(value)}`);
}
