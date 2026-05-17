// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KeyBuilder = (...args: any[]) => readonly unknown[];

/**
 * Build a typed query-key factory for a domain. Each entry can be a static
 * tuple or a function returning a tuple. The returned object is `as const`
 * so TanStack Query infers literal keys.
 *
 * @example
 * const userKeys = createQueryKeys("user", {
 *     me: () => ["me"] as const,
 *     byId: (id: string) => [id] as const,
 *     list: (filters: { page: number }) => ["list", filters] as const,
 * });
 * // userKeys.byId("42") === ["user", "42"]
 */
export function createQueryKeys<
    TKey extends string,
    TEntries extends Record<string, KeyBuilder | readonly unknown[]>,
>(scope: TKey, entries: TEntries) {
    const output = { all: [scope] as const } as { all: readonly [TKey] } & {
        [K in keyof TEntries]: TEntries[K] extends KeyBuilder
            ? (...args: Parameters<TEntries[K]>) => readonly [TKey, ...ReturnType<TEntries[K]>]
            : TEntries[K] extends readonly unknown[]
              ? readonly [TKey, ...TEntries[K]]
              : never;
    };

    for (const [name, entry] of Object.entries(entries) as [keyof TEntries, KeyBuilder | readonly unknown[]][]) {
        if (typeof entry === "function") {
            (output as Record<string, unknown>)[name as string] = (...args: unknown[]) =>
                [scope, ...entry(...args)] as const;
        } else {
            (output as Record<string, unknown>)[name as string] = [scope, ...entry] as const;
        }
    }

    return output;
}
