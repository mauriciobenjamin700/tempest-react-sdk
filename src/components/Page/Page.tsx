/**
 * @tempest-limits props-count — a page shell is slots: eyebrow, title, description,
 * actions, toolbar, footer and children, with padded as the one behavioural switch.
 * Slots are the component.
 */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { SectionHeader } from "../SectionHeader";
import styles from "./Page.module.css";

export interface PageProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
    /** Page title rendered as `<h1>`. */
    title?: ReactNode;
    /** Optional subtitle / breadcrumbs slot rendered above the title. */
    eyebrow?: ReactNode;
    /** Optional description rendered below the title. */
    description?: ReactNode;
    /** Right-side actions slot in the header (buttons, menus). */
    actions?: ReactNode;
    /** Sticky tab bar / filter row rendered just below the header. */
    toolbar?: ReactNode;
    /** Footer slot rendered at the bottom of the content area. */
    footer?: ReactNode;
    /** Page-level padding. Default `true`. */
    padded?: boolean;
    children?: ReactNode;
}

/**
 * Page wrapper with header + (optional) toolbar + content + footer. Pairs
 * with `Container` when you want a max-width content well.
 *
 * The header is a `SectionHeader` at `level={1}`, so the page title and the
 * `<h2>` of each section below it share one look; when every header slot is
 * empty no `<header>` is rendered.
 *
 * @example
 * <Page title="Pedidos" description="Acompanhe seus pedidos" actions={<Button>Novo</Button>}>
 *     <Table {...} />
 * </Page>
 */
export function Page({
    title,
    eyebrow,
    description,
    actions,
    toolbar,
    footer,
    padded = true,
    className,
    children,
    ...props
}: PageProps) {
    return (
        <main className={cn(styles.page, padded && styles.padded, className)} {...props}>
            <SectionHeader
                level={1}
                eyebrow={eyebrow}
                title={title}
                description={description}
                actions={actions}
            />
            {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
            <div className={styles.content}>{children}</div>
            {footer && <footer className={styles.footer}>{footer}</footer>}
        </main>
    );
}
