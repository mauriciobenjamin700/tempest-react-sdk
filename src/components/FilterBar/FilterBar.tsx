import { useId, useState, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/utils/cn";

import { VisuallyHidden } from "../VisuallyHidden";
import {
    defaultOperator,
    describeFilter,
    filterStrings,
    isComplete,
    isMulti,
    isValueless,
    operatorLabel,
    operatorsFor,
    type Filter,
    type FilterField,
} from "./filter-model";
import styles from "./FilterBar.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children" | "onChange";

export interface FilterBarProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /** Fields the user may filter by. */
    fields: readonly FilterField[];
    /** Applied filters. Controlled. */
    value: readonly Filter[];
    /** Next filter set. Combined with AND. */
    onChange: (filters: Filter[]) => void;
    /** Locale for the labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Rendered at the end of the bar — a "save this view" button, a counter. */
    actions?: ReactNode;
}

/** The draft filter being built in the editor. */
interface Draft {
    field: string;
    operator: Filter["operator"];
    value: string;
    to: string;
}

/** A fresh draft for a field. */
function draftFor(field: FilterField): Draft {
    return { field: field.name, operator: defaultOperator(field), value: "", to: "" };
}

/** Turn a draft into a filter. */
function toFilter(draft: Draft): Filter {
    if (isValueless(draft.operator)) return { field: draft.field, operator: draft.operator };
    if (draft.operator === "between") {
        return { field: draft.field, operator: draft.operator, value: [draft.value, draft.to] };
    }
    if (isMulti(draft.operator)) {
        return {
            field: draft.field,
            operator: draft.operator,
            value: draft.value
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean),
        };
    }
    return { field: draft.field, operator: draft.operator, value: draft.value };
}

/**
 * A row of applied filters, and a small editor to add another.
 *
 * Filters are combined with **AND**, flat — no nested `(a OR b) AND c` groups. That
 * is the shape of nearly every admin list ("status is paid, created after March,
 * text contains nota"), and it is what serializes into a URL somebody can send to a
 * colleague. Nested groups need a tree UI with per-node operators and a different
 * serialization; a component trying to be both is clumsy at the common case.
 *
 * Controlled, like the rest of the SDK: it holds the half-typed draft in the editor
 * and nothing else. The applied set is the app's, which is what lets it come from —
 * and go back into — the URL.
 *
 * @example
 * const [filters, setFilters] = useState<Filter[]>(() =>
 *     filtersFromSearchParams(new URLSearchParams(location.search), FIELDS),
 * );
 *
 * <FilterBar fields={FIELDS} value={filters} onChange={setFilters} />
 */
export function FilterBar({
    fields,
    value,
    onChange,
    locale = "pt-BR",
    actions,
    className,
    ...rest
}: FilterBarProps) {
    const strings = filterStrings(locale);
    const baseId = useId();
    const [draft, setDraft] = useState<Draft | null>(null);

    const field = draft ? fields.find((candidate) => candidate.name === draft.field) : undefined;
    const pending = draft ? toFilter(draft) : null;
    const ready = pending !== null && isComplete(pending);

    const open = (): void => {
        if (fields.length > 0) setDraft(draftFor(fields[0]));
    };

    const apply = (): void => {
        if (!pending || !ready) return;
        onChange([...value, pending]);
        setDraft(null);
    };

    const removeAt = (index: number): void => {
        onChange(value.filter((_, position) => position !== index));
    };

    return (
        <div className={cn(styles.bar, className)} {...rest}>
            <ul className={styles.chips}>
                {value.length === 0 && !draft && <li className={styles.empty}>{strings.empty}</li>}
                {value.map((filter, index) => {
                    const description = describeFilter(filter, fields, locale);
                    return (
                        <li
                            key={`${filter.field}-${filter.operator}-${index}`}
                            className={styles.chip}
                        >
                            <span>{description}</span>
                            <button
                                type="button"
                                className={styles.remove}
                                aria-label={strings.remove(description)}
                                onClick={() => removeAt(index)}
                            >
                                ×
                            </button>
                        </li>
                    );
                })}
            </ul>

            {draft && field ? (
                <div className={styles.editor} role="group" aria-label={strings.add}>
                    <label className={styles.control}>
                        <VisuallyHidden>{strings.field}</VisuallyHidden>
                        <select
                            className={styles.select}
                            value={draft.field}
                            onChange={(event) => {
                                const next = fields.find(
                                    (candidate) => candidate.name === event.target.value,
                                );
                                if (next) setDraft(draftFor(next));
                            }}
                        >
                            {fields.map((candidate) => (
                                <option key={candidate.name} value={candidate.name}>
                                    {candidate.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className={styles.control}>
                        <VisuallyHidden>{strings.operator}</VisuallyHidden>
                        <select
                            className={styles.select}
                            value={draft.operator}
                            onChange={(event) =>
                                setDraft({
                                    ...draft,
                                    operator: event.target.value as Filter["operator"],
                                    value: "",
                                    to: "",
                                })
                            }
                        >
                            {operatorsFor(field).map((operator) => (
                                <option key={operator} value={operator}>
                                    {operatorLabel(operator, locale)}
                                </option>
                            ))}
                        </select>
                    </label>

                    {!isValueless(draft.operator) && (
                        <ValueInput
                            id={`${baseId}-value`}
                            field={field}
                            draft={draft}
                            strings={strings}
                            onChange={setDraft}
                        />
                    )}

                    <button
                        type="button"
                        className={styles.primary}
                        disabled={!ready}
                        onClick={apply}
                    >
                        {strings.apply}
                    </button>
                    <button type="button" className={styles.ghost} onClick={() => setDraft(null)}>
                        {strings.cancel}
                    </button>
                </div>
            ) : (
                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.secondary}
                        disabled={fields.length === 0}
                        onClick={open}
                    >
                        + {strings.add}
                    </button>
                    {value.length > 0 && (
                        <button type="button" className={styles.ghost} onClick={() => onChange([])}>
                            {strings.clear}
                        </button>
                    )}
                    {actions}
                </div>
            )}

            <VisuallyHidden aria-live="polite" role="status">
                {strings.active(value.length)}
            </VisuallyHidden>
        </div>
    );
}

/**
 * The value input for the draft.
 *
 * The input type follows the **field**, not the operator: a date field gets a date
 * picker even under `between`, where two of them are needed. Typing a date into a
 * text box is the fastest way to produce a filter the backend cannot parse.
 */
function ValueInput({
    id,
    field,
    draft,
    strings,
    onChange,
}: {
    id: string;
    field: FilterField;
    draft: Draft;
    strings: ReturnType<typeof filterStrings>;
    onChange: (draft: Draft) => void;
}) {
    const type = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

    if (field.type === "select" && !isMulti(draft.operator)) {
        return (
            <label className={styles.control}>
                <VisuallyHidden>{strings.value}</VisuallyHidden>
                <select
                    id={id}
                    className={styles.select}
                    value={draft.value}
                    onChange={(event) => onChange({ ...draft, value: event.target.value })}
                >
                    <option value="">—</option>
                    {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
        );
    }

    if (field.type === "boolean") {
        return (
            <label className={styles.control}>
                <VisuallyHidden>{strings.value}</VisuallyHidden>
                <select
                    id={id}
                    className={styles.select}
                    value={draft.value}
                    onChange={(event) => onChange({ ...draft, value: event.target.value })}
                >
                    <option value="">—</option>
                    <option value="true">{strings.yes}</option>
                    <option value="false">{strings.no}</option>
                </select>
            </label>
        );
    }

    if (draft.operator === "between") {
        return (
            <>
                <label className={styles.control}>
                    <VisuallyHidden>{strings.from}</VisuallyHidden>
                    <input
                        id={id}
                        className={styles.input}
                        type={type}
                        value={draft.value}
                        placeholder={strings.from}
                        onChange={(event) => onChange({ ...draft, value: event.target.value })}
                    />
                </label>
                <label className={styles.control}>
                    <VisuallyHidden>{strings.to}</VisuallyHidden>
                    <input
                        className={styles.input}
                        type={type}
                        value={draft.to}
                        placeholder={strings.to}
                        onChange={(event) => onChange({ ...draft, to: event.target.value })}
                    />
                </label>
            </>
        );
    }

    return (
        <label className={styles.control}>
            <VisuallyHidden>{strings.value}</VisuallyHidden>
            <input
                id={id}
                className={styles.input}
                type={type}
                value={draft.value}
                placeholder={field.placeholder ?? strings.value}
                onChange={(event) => onChange({ ...draft, value: event.target.value })}
            />
        </label>
    );
}
