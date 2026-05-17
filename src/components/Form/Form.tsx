import { forwardRef } from "react";
import type { CSSProperties, FormHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Form.module.css";

export type FormLayout = "stack" | "inline" | "grid";
export type FormActionsAlign = "start" | "center" | "end" | "between";

interface LayoutProps {
    /** Field arrangement. `stack` stacks fields vertically, `inline` lines them up in a wrapping row, `grid` arranges them in `columns` equal-width tracks. Default `stack`. */
    layout?: FormLayout;
    /** Number of columns when `layout="grid"`, or a custom `grid-template-columns` value. Default `2`. */
    columns?: number | string;
    /** Gap between fields. Numbers map to a multiple of the 4px scale (default `4` → 16px). */
    gap?: number | string;
}

function resolveGap(gap: number | string | undefined, fallback: number): string {
    if (gap === undefined) return `${fallback * 4}px`;
    return typeof gap === "number" ? `${gap * 4}px` : gap;
}

function resolveColumns(columns: number | string | undefined): string {
    if (columns === undefined) return "repeat(2, minmax(0, 1fr))";
    return typeof columns === "number" ? `repeat(${columns}, minmax(0, 1fr))` : columns;
}

export interface FormProps extends FormHTMLAttributes<HTMLFormElement>, LayoutProps {}

/**
 * Form wrapper with a built-in layout variant. Replaces ad-hoc `<form>` +
 * `<Stack>` / `<Grid>` boilerplate; pair with [[FormRow]], [[FormSection]],
 * and [[FormActions]] for richer layouts.
 *
 * @example
 * <Form layout="grid" columns={2} gap={4} onSubmit={form.handleSubmit(save)}>
 *     <Input label="Nome" {...form.register("name")} />
 *     <Input label="Email" {...form.register("email")} />
 *     <FormActions align="end">
 *         <Button type="submit">Salvar</Button>
 *     </FormActions>
 * </Form>
 */
export const Form = forwardRef<HTMLFormElement, FormProps>(function Form(
    { layout = "stack", columns, gap, className, style, children, ...props },
    ref,
) {
    const finalStyle: CSSProperties = {
        gap: resolveGap(gap, 4),
        ...(layout === "grid" ? { gridTemplateColumns: resolveColumns(columns) } : null),
        ...style,
    };
    return (
        <form
            ref={ref}
            className={cn(styles.form, styles[layout], className)}
            style={finalStyle}
            {...props}
        >
            {children}
        </form>
    );
});

export interface FormSectionProps extends Omit<HTMLAttributes<HTMLElement>, "title">, LayoutProps {
    title?: ReactNode;
    description?: ReactNode;
}

/**
 * Visually grouped subset of fields with an optional title and description.
 * Has its own `layout`/`columns`/`gap` so subsets can stack while the parent
 * grids (or vice versa).
 *
 * @example
 * <FormSection title="Endereço" description="Usado para entrega" layout="grid" columns={3}>
 *     <Input label="CEP" />
 *     <Input label="Rua" />
 *     <Input label="Número" />
 * </FormSection>
 */
export function FormSection({
    title,
    description,
    layout = "stack",
    columns,
    gap,
    className,
    style,
    children,
    ...props
}: FormSectionProps) {
    const bodyStyle: CSSProperties = {
        gap: resolveGap(gap, 4),
        ...(layout === "grid" ? { gridTemplateColumns: resolveColumns(columns) } : null),
    };
    return (
        <section className={cn(styles.section, className)} style={style} {...props}>
            {(title || description) && (
                <header className={styles.sectionHeader}>
                    {title && <h3 className={styles.sectionTitle}>{title}</h3>}
                    {description && <p className={styles.sectionDescription}>{description}</p>}
                </header>
            )}
            <div className={cn(styles.sectionBody, styles[layout])} style={bodyStyle}>
                {children}
            </div>
        </section>
    );
}

export interface FormRowProps extends HTMLAttributes<HTMLDivElement> {
    /** Gap between row items. Numbers map to a multiple of the 4px scale (default `3` → 12px). */
    gap?: number | string;
}

/**
 * Forces a horizontal row regardless of parent layout — useful for grouping
 * two short fields side-by-side inside an otherwise stacked form (e.g. CEP +
 * city, expiry month + year).
 *
 * @example
 * <Form layout="stack">
 *     <FormRow>
 *         <Input label="CEP" />
 *         <Input label="Cidade" />
 *     </FormRow>
 *     <Input label="Endereço completo" />
 * </Form>
 */
export function FormRow({ gap, className, style, children, ...props }: FormRowProps) {
    const finalStyle: CSSProperties = { gap: resolveGap(gap, 3), ...style };
    return (
        <div className={cn(styles.row, className)} style={finalStyle} {...props}>
            {children}
        </div>
    );
}

export interface FormActionsProps extends HTMLAttributes<HTMLDivElement> {
    /** Horizontal alignment of buttons. Default `end`. */
    align?: FormActionsAlign;
    /** Gap between buttons. Numbers map to a multiple of the 4px scale (default `2` → 8px). */
    gap?: number | string;
}

/**
 * Footer button row for a form. Use inside (or after) [[Form]] / [[FormSection]].
 *
 * @example
 * <FormActions align="end">
 *     <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
 *     <Button type="submit" loading={form.formState.isSubmitting}>Salvar</Button>
 * </FormActions>
 */
export function FormActions({
    align = "end",
    gap,
    className,
    style,
    children,
    ...props
}: FormActionsProps) {
    const finalStyle: CSSProperties = { gap: resolveGap(gap, 2), ...style };
    return (
        <div className={cn(styles.actions, styles[align], className)} style={finalStyle} {...props}>
            {children}
        </div>
    );
}
