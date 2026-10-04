/**
 * @tempest-limits props-count — a heading block is slots (eyebrow, title, description,
 * actions) plus the three switches that decide its semantics: level, align and the
 * heading id. Splitting them would leave the id away from the heading it names.
 */
import {
    createContext,
    useContext,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./SectionHeader.module.css";

export type SectionHeaderLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type SectionHeaderAlign = "start" | "center";

/**
 * Links the nearest `<Section>` to the heading that names it.
 *
 * Two channels, because they answer at different times:
 *
 * - `sectionId` + `claim` work during render, so the link exists in the very
 *   first HTML (`renderToString`, hydration) where no effect runs. The section
 *   owns `sectionId` (from `useId`, identical on server and client) and writes
 *   it to `aria-labelledby` before any child renders; the first titled
 *   `SectionHeader` to call `claim` in render order becomes its owner and, when
 *   it has no explicit `id`, puts `sectionId` on its heading. `claim` is keyed by
 *   the caller's own `useId`, so asking twice (Strict Mode, a re-render) gives
 *   the same answer and never hands the id to a second heading.
 * - `register` works after mount and is the source of truth from then on: it
 *   returns the matching unregister so a heading that unmounts (or changes id)
 *   releases the section instead of leaving `aria-labelledby` pointing at an
 *   element that no longer exists, and the next registered heading takes over.
 */
interface SectionContextValue {
    sectionId: string;
    claim: (headerKey: string) => boolean;
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
 * outline is picked by meaning, not by size. Inside a `<Section>` the first
 * titled header takes the section's own id for its heading (unless `id` is
 * given) and registers it, which is what gives the `region` landmark its
 * accessible name — in the server HTML too.
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
    const section = useContext(SectionContext);
    const hasTitle = Boolean(title);
    const ownsSection = section !== null && hasTitle && section.claim(autoId);
    const headingId = id ?? (ownsSection ? section.sectionId : autoId);
    const register = section?.register;
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
export type SectionTone = "inverse" | "default";

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
     *
     * `"default"` hands a region inside an inverse section back to the page's
     * tokens — light or dark, whichever the page is on — by writing
     * `data-tempest-tone="default"`: a white form or price card in a navy hero.
     * The rules ship with the inverse tokens, so it costs nothing until those are
     * loaded, and outside an inverse section the tokens it restores are the ones
     * already there.
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
 * `SectionHeader` with a `title` below it reaches the section through context
 * (so wrappers in between do not break the link) and the first one names it;
 * when it unmounts, the next one takes over. An explicit `aria-labelledby` or
 * `aria-label` wins over the automatic one, and once mounted with no titled
 * heading the attribute is left off rather than pointing at nothing.
 *
 * The section owns the id (`useId`), so the link is already in the first
 * render — `renderToString` and the HTML a server sends — where no effect runs.
 * The parent's attributes are written before any child renders, so the section
 * cannot know what is below it: it always writes its own id, and the first
 * titled `SectionHeader` in render order puts that id on its heading. Two
 * cases cannot be known on the server, and both are settled on hydration
 * without a mismatch warning: with no titled heading the server attribute is
 * dropped (until then it resolves to nothing, which Chromium 153 exposes as
 * the same anonymous group as no attribute at all), and when that first header
 * has an explicit `id` the attribute moves to it. A consumer that needs the
 * explicit id in the server HTML passes `aria-labelledby` itself.
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
    const sectionId = useId();
    const ownerRef = useRef<string | null>(null);
    const [headingIds, setHeadingIds] = useState<string[] | null>(null);
    const context = useMemo<SectionContextValue>(
        () => ({
            sectionId,
            claim: (headerKey: string) => {
                ownerRef.current ??= headerKey;
                return ownerRef.current === headerKey;
            },
            register: (id: string) => {
                setHeadingIds((current) => [...(current ?? []), id]);
                return () =>
                    setHeadingIds((current) => (current ?? []).filter((entry) => entry !== id));
            },
        }),
        [sectionId],
    );
    useLayoutEffect(() => {
        setHeadingIds((current) => current ?? []);
    }, []);
    const named = props["aria-labelledby"] !== undefined || props["aria-label"] !== undefined;
    const labelledBy = headingIds === null ? sectionId : headingIds[0];
    return (
        <SectionContext.Provider value={context}>
            <section
                aria-labelledby={named ? undefined : labelledBy}
                data-tempest-tone={tone}
                {...props}
            >
                {children}
            </section>
        </SectionContext.Provider>
    );
}
