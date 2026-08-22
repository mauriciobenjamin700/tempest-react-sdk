// Server-side half of the filter model: the same `Filter[]` the bar produces,
// encoded the way a paginated backend expects to read it. Kept apart from
// `filtersToSearchParams` (filter-model.ts) because the two answer different
// questions — that one round-trips the UI state through the URL, this one talks
// to an API and its shape is the API's, not ours.

import type { Filter, FilterOperator } from "./filter-model";
import { isComplete } from "./filter-model";
import { orderRange } from "./filter-apply";

/**
 * Operator suffix per filter operator, following the `<column>__<op>` convention
 * of `tempest-fastapi-sdk`.
 *
 * Ported from `build_filter_condition` in
 * `tempest_fastapi_sdk/db/expressions.py`, which is what `BaseRepository`
 * dict filters and `Q` both resolve through. An empty suffix means the bare
 * column name, which that function resolves to plain equality.
 *
 * `contains` maps to `icontains` (case-insensitive, and the backend escapes the
 * `LIKE` wildcards) and both emptiness operators map to `isnull`, whose value
 * carries the direction.
 */
const DEFAULT_OPERATOR_SUFFIX: Record<FilterOperator, string> = {
    eq: "",
    ne: "__ne",
    contains: "__icontains",
    gt: "__gt",
    gte: "__gte",
    lt: "__lt",
    lte: "__lte",
    between: "__between",
    in: "__in",
    empty: "__isnull",
    notEmpty: "__isnull",
};

/**
 * Columns the backend treats as a substring search when they carry no operator
 * suffix.
 *
 * Ported from `build_filter_condition`, which special-cases a string `name` into
 * `ILIKE %value%`. Sending a bare `name=` for an `eq` filter would therefore ask
 * for "contains" while the chip says "is", so `eq` on such a column is emitted as
 * `name__iexact` instead.
 */
const DEFAULT_SUBSTRING_COLUMNS: ReadonlySet<string> = new Set(["name"]);

/** Overrides for the backend dialect {@link filtersToQueryParams} encodes into. */
export interface FiltersToQueryParamsOptions {
    /**
     * Columns whose `eq` is emitted as `<column>__iexact` rather than as the bare
     * column name. Default `["name"]`, which is what `build_filter_condition`
     * special-cases.
     *
     * Pass the columns **your** backend treats that way — `nome`, `titulo`,
     * `razao_social` — or `[]` when it treats none of them specially and a bare
     * `eq` should stay bare.
     */
    substringColumns?: readonly string[];
    /**
     * Operator suffixes, merged over the `tempest-fastapi-sdk` dialect, so an
     * override names only the operators that differ.
     *
     * @example
     * // A DRF-style backend
     * filtersToQueryParams(filters, {
     *     substringColumns: [],
     *     operatorSuffix: { contains: "__icontains", ne: "__exclude" },
     * });
     */
    operatorSuffix?: Partial<Record<FilterOperator, string>>;
}

/**
 * Encode filters as query params for a paginated backend.
 *
 * The counterpart of {@link applyFilters}: same filter set, evaluated by the
 * database instead of by the browser, which is the only option once the list is
 * paginated on the server and the page in memory is not the whole result.
 *
 * The encoding is the `<column>__<op>` convention `tempest-fastapi-sdk` already
 * reads (`BaseRepository._apply_filters` → `build_filter_condition`):
 *
 * | Operator | Param |
 * | --- | --- |
 * | `eq` | `field` (or `field__iexact` for the `name` column) |
 * | `ne` | `field__ne` |
 * | `contains` | `field__icontains` |
 * | `gt` `gte` `lt` `lte` | `field__gt` … `field__lte` |
 * | `between` | `field__between` twice, low value first |
 * | `in` | `field__in` once per value |
 * | `empty` / `notEmpty` | `field__isnull=true` / `=false` |
 *
 * Returns `URLSearchParams` rather than a plain object because `between` carries
 * a pair and `in` carries a list: an object would keep only the last value of
 * each, silently narrowing the filter. Repeated params are also how FastAPI
 * receives a `list[str]` declared with `Query`.
 *
 * Two things the backend has to hold up its end of, or the filter fails quietly:
 *
 * - **Every key must be declared.** `BasePaginationFilterSchema.get_conditions()`
 *   only forwards fields the subclass declares, so a `status__ne` the schema
 *   never mentions is dropped by FastAPI before the repository sees it — no
 *   error, no filtering.
 * - **`isnull` matches `NULL` only.** A column that stores `""` for "no value"
 *   will not answer an `empty` filter, while {@link applyFilters} treats blank
 *   text as empty.
 *
 * The defaults are that dialect, not a universal truth. A backend that names its
 * substring column something other than `name`, or that spells its operators
 * differently, passes `options` — the alternative was an encoder whose special
 * cases were a wall for anyone not on the Tempest stack.
 *
 * @example
 * const params = filtersToQueryParams(filters);
 * params.set("page", String(page));
 * const data = await api.get(`/orders?${params}`);
 *
 * @example
 * // A backend whose searchable column is `razao_social` and that spells `ne`
 * // the Django way.
 * const params = filtersToQueryParams(filters, {
 *     substringColumns: ["razao_social"],
 *     operatorSuffix: { ne: "__exclude" },
 * });
 *
 * @param filters - Applied filters; incomplete ones are ignored.
 * @param options - Dialect overrides. Defaults to the `tempest-fastapi-sdk` one.
 * @returns Params ready to append to a request URL.
 */
export function filtersToQueryParams(
    filters: readonly Filter[],
    options: FiltersToQueryParamsOptions = {},
): URLSearchParams {
    const suffixes = options.operatorSuffix
        ? { ...DEFAULT_OPERATOR_SUFFIX, ...options.operatorSuffix }
        : DEFAULT_OPERATOR_SUFFIX;
    const substringColumns = options.substringColumns
        ? new Set(options.substringColumns)
        : DEFAULT_SUBSTRING_COLUMNS;

    const params = new URLSearchParams();

    for (const filter of filters) {
        if (!isComplete(filter)) continue;

        const suffix = suffixes[filter.operator];
        const key =
            filter.operator === "eq" && substringColumns.has(filter.field)
                ? `${filter.field}__iexact`
                : `${filter.field}${suffix}`;

        if (filter.operator === "empty" || filter.operator === "notEmpty") {
            params.append(key, filter.operator === "empty" ? "true" : "false");
            continue;
        }

        const values = Array.isArray(filter.value)
            ? [...filter.value]
            : [String(filter.value ?? "")];

        if (filter.operator === "between") {
            for (const value of orderRange(values)) params.append(key, value);
            continue;
        }

        for (const value of values) params.append(key, value);
    }

    return params;
}
