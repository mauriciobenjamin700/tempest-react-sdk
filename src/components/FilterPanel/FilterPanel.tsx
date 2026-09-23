import {
    useId,
    type CSSProperties,
    type FormEvent,
    type HTMLAttributes,
    type ReactNode,
} from "react";

import { cn } from "@/utils/cn";

import { Button } from "../Button";
import { Card } from "../Card";
import { Grid, type ResponsiveValue } from "../Layout";
import styles from "./FilterPanel.module.css";

/** Labels the panel writes itself. */
export interface FilterPanelLabels {
    /** Default title. `"Filtros"` / `"Filters"`. */
    title: string;
    /** The clear button. `"Limpar filtros"` / `"Clear filters"`. */
    clear: string;
    /** The apply button. `"Filtrar"` / `"Apply filters"`. */
    apply: string;
}

/** Built-in labels per locale. */
const LABELS: Record<"pt-BR" | "en", FilterPanelLabels> = {
    "pt-BR": { title: "Filtros", clear: "Limpar filtros", apply: "Filtrar" },
    en: { title: "Filters", clear: "Clear filters", apply: "Apply filters" },
};

/** DOM attributes this component redefines. */
type OverriddenDomProps = "title" | "children" | "onSubmit";

export interface FilterPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /** The filter controls the screen declares — `Input`, `Select`, a date picker. One grid cell each. */
    children: ReactNode;
    /** Heading. Default from `locale`. A string renders as an `h3`; a node renders as given. */
    title?: ReactNode;
    /** Header actions that are not fields — "Atualizar a cada 30s", "Exportar CSV". */
    actions?: ReactNode;
    /** Return the screen to its initial filters. Renders the clear button only when set. */
    onClear?: () => void;
    /**
     * Publish the draft. When set, the fields sit in a `<form>`: the apply button
     * submits it and Enter in any text field applies.
     */
    onApply?: () => void;
    /**
     * Disable the apply button — pass `!filters.isDirty`. Enter follows the button:
     * it is the form's default button, so a disabled one blocks implicit submission
     * too, and nothing is re-applied when nothing changed.
     */
    applyDisabled?: boolean;
    /** Locale for the default title and button labels. Default `"pt-BR"`. */
    locale?: "pt-BR" | "en";
    /** Override any of the labels. */
    labels?: Partial<FilterPanelLabels>;
    /**
     * Narrowest a field may get before the grid drops a column. Default `"12rem"`.
     * The count follows the **panel's** width, so the same panel fits a page and a
     * sidebar.
     */
    minFieldWidth?: string;
    /**
     * Fixed columns per viewport, as in `Grid` — `{ mobile: 1, tablet: 2, desktop: 4 }`.
     * Replaces `minFieldWidth`, and follows the **viewport**, not the panel.
     */
    columns?: ResponsiveValue<number | string>;
}

/**
 * The frame around a fixed set of filters: a card with a title, a grid of the
 * fields the screen declares, and the actions that belong to no field — clear,
 * apply, export.
 *
 * It holds no state and has no opinion on the fields. `FilterBar` is for ad hoc
 * querying (the user picks field, operator and value); this is for the set a
 * screen already knows — município, UF, situação, a search box. Pair it with
 * `useDraftFilters`: the fields edit `draft`, `onApply` and `onClear` are the
 * hook's `apply` and `clear`.
 *
 * What it settles, each measured in Chromium against the `Card` + `Grid`
 * composition it replaces:
 *
 * - **The grid follows the panel, not the viewport.** `Grid` switches columns on
 *   viewport breakpoints, so the same filters in a 360 px column of a 1280 px
 *   screen got four 57.5 px fields. The default here is
 *   `repeat(auto-fill, minmax(min(100%, minFieldWidth), 1fr))`: the column count
 *   comes from the room the panel has, and `min(100%, …)` keeps a floor wider than
 *   the phone from overflowing it.
 * - **Cells align to the top.** A field showing an error is taller; with the grid
 *   default (`stretch`), its row-mates' boxes grew to match.
 * - **The header wraps.** Three actions next to the title measured 527 px in a
 *   308 px header at 390 px wide, and scrolled the whole page sideways. `Card`'s
 *   header now wraps, and so do the actions inside it.
 * - **Clear and apply have a fixed place**, at the end of the header, apply last.
 *
 * @example
 * const filters = useDraftFilters({ search: "", uf: "" });
 * <FilterPanel
 *     onApply={() => filters.apply()}
 *     onClear={filters.clear}
 *     applyDisabled={!filters.isDirty}
 * >
 *     <Input label="Busca" value={filters.draft.search}
 *         onChange={(e) => filters.set({ search: e.target.value })} />
 *     <Select label="UF" options={UFS} value={filters.draft.uf}
 *         onChange={(e) => filters.set({ uf: e.target.value })} />
 * </FilterPanel>
 */
export function FilterPanel({
    children,
    title,
    actions,
    onClear,
    onApply,
    applyDisabled = false,
    locale = "pt-BR",
    labels,
    minFieldWidth = "12rem",
    columns,
    className,
    style,
    ...props
}: FilterPanelProps) {
    const formId = useId();
    const text: FilterPanelLabels = { ...LABELS[locale], ...labels };
    const heading = title ?? text.title;

    const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        onApply?.();
    };

    const hasActions = actions !== undefined || onClear !== undefined || onApply !== undefined;
    const headerActions = hasActions ? (
        <div className={styles.actions}>
            {actions}
            {onClear && (
                <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                    {text.clear}
                </Button>
            )}
            {onApply && (
                <Button type="submit" size="sm" form={formId} disabled={applyDisabled}>
                    {text.apply}
                </Button>
            )}
        </div>
    ) : undefined;

    const fields = (
        <Grid
            className={styles.fields}
            columns={
                columns ??
                "repeat(auto-fill, minmax(min(100%, var(--tempest-filter-panel-min)), 1fr))"
            }
        >
            {children}
        </Grid>
    );

    return (
        <Card
            flush
            role="search"
            aria-label={typeof heading === "string" ? heading : undefined}
            title={heading}
            actions={headerActions}
            className={cn(styles.panel, className)}
            style={{ "--tempest-filter-panel-min": minFieldWidth, ...style } as CSSProperties}
            {...props}
        >
            {onApply ? (
                <form id={formId} className={styles.form} onSubmit={handleSubmit} noValidate>
                    {fields}
                </form>
            ) : (
                fields
            )}
        </Card>
    );
}
