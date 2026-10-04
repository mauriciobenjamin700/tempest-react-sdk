/**
 * @tempest-limits props-count — a heading block is slots (eyebrow, title, description,
 * actions) plus the three switches that decide its semantics: level, align and the
 * heading id. Splitting them would leave the id away from the heading it names.
 */
import { createContext, useContext, useId, useLayoutEffect, useMemo, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./SectionHeader.module.css";

export type SectionHeaderLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type SectionHeaderAlign = "start" | "center";

/**
 * Lets the nearest `<Section>` learn the id of the heading that names it.
 *
 * `register` returns the matching unregister so a heading that unmounts (or
 * changes id) releases the section instead of leaving `aria-labelledby` pointing
 * at an element that no longer exists.
 */
interface SectionContextValue {
    register: (headingId: string) => () => void;
}

const SectionContext = createContext<SectionContextValue | null>(null);

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title" | "id"> {
    /** Heading text, rendered as `<h{level}>`. */
    title?: ReactNode;
    /** Short label above the title (category, breadcrumbs). */
    eyebrow?: ReactNode;
    /** Supporting text rendered below the title. */
    description?: ReactNode;
    /** Trailing slot for buttons or menus. */
    actions?: ReactNode;
    /** Heading level — semantics only, the look does not change with it. Default `2`. */
    level?: SectionHeaderLevel;
    /** Horizontal alignment of the text block. Default `"start"`. */
    align?: SectionHeaderAlign;
    /** Id of the heading element. Generated with `useId` when absent. */
    id?: string;
}

/**
 * Header of a page or of one section of it: eyebrow, title, description and
 * actions, with the same look `Page` uses for its own header.
 *
 * The heading level is a prop because one page needs one `<h1>` and many
 * `<h2>` that look alike; the visual stays the same at every level so the
 * outline is picked by meaning, not by size. Inside a `<Section>` the heading
 * id is registered with it, which is what gives the `region` landmark its
 * accessible name.
 *
 * @example
 * <Section>
 *     <SectionHeader eyebrow="Soluções" title="O que podemos desenvolver" align="center" />
 *     <p>Conteúdo da seção.</p>
 * </Section>
 */
export function SectionHeader({
    title,
    eyebrow,
    description,
    actions,
    level = 2,
    align = "start",
    id,
    className,
    ...props
}: SectionHeaderProps) {
    const autoId = useId();
    const headingId = id ?? autoId;
    const section = useContext(SectionContext);
    const register = section?.register;
    const hasTitle = Boolean(title);
    useLayoutEffect(() => {
        if (!register || !hasTitle) return undefined;
        return register(headingId);
    }, [register, hasTitle, headingId]);
    if (!title && !eyebrow && !description && !actions) return null;
    const Heading = `h${level}` as const;
    return (
        <header
            className={cn(styles.header, align === "center" && styles.center, className)}
            {...props}
        >
            <div className={styles.headerText}>
                {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
                {title && (
                    <Heading id={headingId} className={styles.title}>
                        {title}
                    </Heading>
                )}
                {description && <p className={styles.description}>{description}</p>}
            </div>
            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
}

/** Surface tone a {@link Section} can take. */
export type SectionTone = "inverse";

export interface SectionProps extends HTMLAttributes<HTMLElement> {
    /**
     * `"inverse"` paints the section in the brand color and inverts every color
     * token inside it, by writing `data-tempest-tone="inverse"`. The tokens are
     * opt-in, because most apps never paint a section in the brand: they come
     * from `tempest-react-sdk/styles/inverse.css` for the SDK's own blue, or from
     * `createTheme({ primary, inverse: createInverseSurface })` for yours, each
     * measured against the fill (text and muted text at 4.5:1 or more, the focus
     * ring at 3:1 or more). With neither loaded the attribute matches nothing and
     * the section keeps the page's tokens — legible, not inverted. The prop
     * exists so the tone is typed: a typo in a hand-written attribute fails
     * silently, a typo here fails the build.
     */
    tone?: SectionTone;
}

/**
 * `<section>` that takes its accessible name from the `SectionHeader` inside it.
 *
 * A `<section>` is exposed as a `region` landmark only when it has an
 * accessible name; without one it is an anonymous group and screen-reader
 * landmark navigation skips it. Wiring `aria-labelledby` to the heading id is
 * the same mechanical step on every page, so the section does it: every
 * `SectionHeader` with a `title` below it registers its id through context (so
 * wrappers in between do not break the link) and the first one mounted names
 * the section; when it unmounts, the next one takes over. An explicit
 * `aria-labelledby` or `aria-label` wins over the registered one, and with no
 * heading the attribute is left off rather than pointing at nothing.
 *
 * @example
 * <Section>
 *     <SectionHeader title="Planos" />
 *     <PlanGrid />
 * </Section>
 *
 * @example
 * <Section tone="inverse">
 *     <SectionHeader title="Comece agora" />
 *     <Button>Criar conta</Button>
 * </Section>
 */
export function Section({ children, tone, ...props }: SectionProps) {
    const [headingIds, setHeadingIds] = useState<string[]>([]);
    const context = useMemo<SectionContextValue>(
        () => ({
            register: (id: string) => {
                setHeadingIds((current) => [...current, id]);
                return () => setHeadingIds((current) => current.filter((entry) => entry !== id));
            },
        }),
        [],
    );
    const named = props["aria-labelledby"] !== undefined || props["aria-label"] !== undefined;
    return (
        <SectionContext.Provider value={context}>
            <section
                aria-labelledby={named ? undefined : headingIds[0]}
                data-tempest-tone={tone}
                {...props}
            >
                {children}
            </section>
        </SectionContext.Provider>
    );
}
