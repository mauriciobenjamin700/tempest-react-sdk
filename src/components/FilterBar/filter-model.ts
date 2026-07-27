// The filter model behind `FilterBar`: what a field can be compared with, how a
// filter reads in words, and how a filter set survives a page reload.
//
// Flat AND, deliberately. Nested `(a OR b) AND c` groups are a different component
// with a different UI (a tree with per-node operators) and a different serialization
// — trying to be both produces a builder that is clumsy for the 95% case, which is
// "status is paid, created after March, text contains nota".

/** Comparison a filter can make. */
export type FilterOperator =
    | "eq"
    | "ne"
    | "contains"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "between"
    | "in"
    | "empty"
    | "notEmpty";

/** Kind of value a field holds, which decides its operators and its input. */
export type FilterFieldType = "text" | "number" | "date" | "select" | "boolean";

/** One filterable field. */
export interface FilterField {
    /** Key sent to the backend. */
    name: string;
    /** What the user sees. */
    label: string;
    type: FilterFieldType;
    /** Choices for `select`. */
    options?: ReadonlyArray<{ value: string; label: string }>;
    /** Restrict or reorder the operators offered. Defaults per type. */
    operators?: readonly FilterOperator[];
    /** Placeholder for the value input. */
    placeholder?: string;
}

/** One applied filter. */
export interface Filter {
    field: string;
    operator: FilterOperator;
    /** `between` carries a pair; `in` carries a list; `empty`/`notEmpty` carry nothing. */
    value?: string | readonly string[];
}

/** Operators offered per field type, in the order they appear. */
const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
    text: ["contains", "eq", "ne", "empty", "notEmpty"],
    number: ["eq", "ne", "gt", "gte", "lt", "lte", "between"],
    date: ["eq", "gt", "gte", "lt", "lte", "between"],
    select: ["eq", "ne", "in", "empty", "notEmpty"],
    boolean: ["eq"],
};

/** Operators that take no value at all. */
const VALUELESS: ReadonlySet<FilterOperator> = new Set(["empty", "notEmpty"]);

/** Operators that take more than one value. */
const MULTI: ReadonlySet<FilterOperator> = new Set(["between", "in"]);

/** Human labels for the operators, per locale. */
const OPERATOR_LABELS: Record<"pt-BR" | "en", Record<FilterOperator, string>> = {
    "pt-BR": {
        eq: "é",
        ne: "não é",
        contains: "contém",
        gt: "maior que",
        gte: "maior ou igual a",
        lt: "menor que",
        lte: "menor ou igual a",
        between: "entre",
        in: "é um de",
        empty: "está vazio",
        notEmpty: "não está vazio",
    },
    en: {
        eq: "is",
        ne: "is not",
        contains: "contains",
        gt: "greater than",
        gte: "at least",
        lt: "less than",
        lte: "at most",
        between: "between",
        in: "is any of",
        empty: "is empty",
        notEmpty: "is not empty",
    },
};

/** The operators a field offers. */
export function operatorsFor(field: FilterField): FilterOperator[] {
    return [...(field.operators ?? OPERATORS_BY_TYPE[field.type])];
}

/** Label of an operator. */
export function operatorLabel(operator: FilterOperator, locale: "pt-BR" | "en" = "pt-BR"): string {
    return OPERATOR_LABELS[locale][operator] ?? operator;
}

/** True when the operator needs no value input. */
export function isValueless(operator: FilterOperator): boolean {
    return VALUELESS.has(operator);
}

/** True when the operator takes several values. */
export function isMulti(operator: FilterOperator): boolean {
    return MULTI.has(operator);
}

/**
 * Is this filter complete enough to apply?
 *
 * An incomplete filter is not an error to shout about — it is a half-filled form.
 * The component uses this to keep "Add" disabled, which says the same thing without
 * a message nobody asked for.
 */
export function isComplete(filter: Filter): boolean {
    if (isValueless(filter.operator)) return true;
    const { value } = filter;
    if (value === undefined) return false;
    if (Array.isArray(value)) {
        if (filter.operator === "between") return value.length === 2 && value.every(Boolean);
        return value.length > 0 && value.every(Boolean);
    }
    return String(value).trim() !== "";
}

/** Human text for one value, resolving a `select` option to its label. */
function valueLabel(field: FilterField | undefined, raw: string): string {
    const option = field?.options?.find((candidate) => candidate.value === raw);
    return option ? option.label : raw;
}

/**
 * One filter, in words: `"Status é Pago"`.
 *
 * Used for the chip and for the screen-reader announcement, from the same source —
 * a chip that reads `status=eq:paid` to a sighted user and something else to a
 * screen reader would be two different truths.
 */
export function describeFilter(
    filter: Filter,
    fields: readonly FilterField[],
    locale: "pt-BR" | "en" = "pt-BR",
): string {
    const field = fields.find((candidate) => candidate.name === filter.field);
    const name = field?.label ?? filter.field;
    const operator = operatorLabel(filter.operator, locale);
    if (isValueless(filter.operator)) return `${name} ${operator}`;

    const values = Array.isArray(filter.value)
        ? filter.value.map((raw) => valueLabel(field, raw))
        : [valueLabel(field, String(filter.value ?? ""))];

    if (filter.operator === "between" && values.length === 2) {
        const joiner = locale === "en" ? "and" : "e";
        return `${name} ${operator} ${values[0]} ${joiner} ${values[1]}`;
    }
    return `${name} ${operator} ${values.join(", ")}`;
}

/** Default operator for a field — the first one it offers. */
export function defaultOperator(field: FilterField): FilterOperator {
    return operatorsFor(field)[0] ?? "eq";
}

/**
 * Serialize filters into URL search params.
 *
 * One param per filter, `field=operator:value`, with `|` between the values of a
 * multi-value operator. A filter set that cannot survive a reload is a filter set
 * people re-enter every time they open a link somebody sent them, so this is part
 * of the model rather than something each app reinvents.
 *
 * Repeated fields are kept: `status=eq:paid&status=eq:sent` is two filters, and
 * collapsing them would silently drop one.
 *
 * @param filters - Applied filters.
 * @returns Params ready to merge into a location.
 */
export function filtersToSearchParams(filters: readonly Filter[]): URLSearchParams {
    const params = new URLSearchParams();
    for (const filter of filters) {
        if (!isComplete(filter)) continue;
        const value = Array.isArray(filter.value) ? filter.value.join("|") : (filter.value ?? "");
        params.append(
            filter.field,
            isValueless(filter.operator) ? filter.operator : `${filter.operator}:${value}`,
        );
    }
    return params;
}

/**
 * Read filters back from URL search params.
 *
 * Anything that does not parse is dropped rather than guessed at: a hand-edited URL
 * is the normal way this input arrives, and rendering a filter the app cannot
 * evaluate would show a list that does not match what the chips claim.
 *
 * @param params - Params from the location.
 * @param fields - Known fields; a param naming anything else is ignored.
 * @returns The filters that parsed.
 */
export function filtersFromSearchParams(
    params: URLSearchParams,
    fields: readonly FilterField[],
): Filter[] {
    const known = new Map(fields.map((field) => [field.name, field]));
    const filters: Filter[] = [];

    for (const [name, raw] of params.entries()) {
        const field = known.get(name);
        if (!field) continue;

        const separator = raw.indexOf(":");
        const operator = (separator < 0 ? raw : raw.slice(0, separator)) as FilterOperator;
        if (!operatorsFor(field).includes(operator)) continue;

        if (isValueless(operator)) {
            filters.push({ field: name, operator });
            continue;
        }
        if (separator < 0) continue;

        const rest = raw.slice(separator + 1);
        const value = isMulti(operator) ? rest.split("|") : rest;
        const filter: Filter = { field: name, operator, value };
        if (isComplete(filter)) filters.push(filter);
    }

    return filters;
}

/** Labels the bar needs, per locale. */
interface FilterStrings {
    add: string;
    apply: string;
    cancel: string;
    clear: string;
    field: string;
    operator: string;
    value: string;
    from: string;
    to: string;
    yes: string;
    no: string;
    remove: (description: string) => string;
    active: (count: number) => string;
    empty: string;
}

const PT_BR: FilterStrings = {
    add: "Adicionar filtro",
    apply: "Aplicar",
    cancel: "Cancelar",
    clear: "Limpar filtros",
    field: "Campo",
    operator: "Condição",
    value: "Valor",
    from: "De",
    to: "Até",
    yes: "Sim",
    no: "Não",
    remove: (description) => `Remover filtro: ${description}`,
    active: (count) => (count === 1 ? "1 filtro ativo" : `${count} filtros ativos`),
    empty: "Nenhum filtro",
};

const EN: FilterStrings = {
    add: "Add filter",
    apply: "Apply",
    cancel: "Cancel",
    clear: "Clear filters",
    field: "Field",
    operator: "Condition",
    value: "Value",
    from: "From",
    to: "To",
    yes: "Yes",
    no: "No",
    remove: (description) => `Remove filter: ${description}`,
    active: (count) => (count === 1 ? "1 active filter" : `${count} active filters`),
    empty: "No filters",
};

/** Locale strings for the bar. */
export function filterStrings(locale: "pt-BR" | "en"): FilterStrings {
    return locale === "en" ? EN : PT_BR;
}
