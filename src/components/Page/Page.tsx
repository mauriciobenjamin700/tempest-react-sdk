import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
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
    const hasHeader = title || eyebrow || description || actions;
    return (
        <main className={cn(styles.page, padded && styles.padded, className)} {...props}>
            {hasHeader && (
                <header className={styles.header}>
                    <div className={styles.headerText}>
                        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
                        {title && <h1 className={styles.title}>{title}</h1>}
                        {description && <p className={styles.description}>{description}</p>}
                    </div>
                    {actions && <div className={styles.actions}>{actions}</div>}
                </header>
            )}
            {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
            <div className={styles.content}>{children}</div>
            {footer && <footer className={styles.footer}>{footer}</footer>}
        </main>
    );
}
