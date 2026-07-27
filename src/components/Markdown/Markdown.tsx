import { Fragment, useMemo, useRef, type HTMLAttributes, type ReactNode } from "react";

import { useScrollOverflow } from "@/hooks/use-scroll-overflow";
import { cn } from "@/utils/cn";

import { CodeBlock } from "../CodeBlock";
import {
    parseMarkdown,
    type MarkdownAlign,
    type MarkdownBlock,
    type MarkdownInline,
} from "./markdown-parse";
import styles from "./Markdown.module.css";

/** DOM attributes this component redefines. */
type OverriddenDomProps = "children";

export interface MarkdownProps extends Omit<HTMLAttributes<HTMLDivElement>, OverriddenDomProps> {
    /** The Markdown source. */
    source: string;
    /**
     * Heading level the document's `#` maps to. Default 2.
     *
     * A comment body rendered inside a page whose `<h1>` is the page title must not
     * emit a second `<h1>`; shifting the whole scale keeps the outline valid.
     */
    headingOffset?: number;
    /** Render fenced code with `CodeBlock` (copy button, line numbers). Default `true`. */
    highlightCode?: boolean;
    /** Show line numbers in fenced code. Default `false`. */
    showLineNumbers?: boolean;
    /** Extra props for every link — `target="_blank"`, an analytics handler. */
    linkProps?: HTMLAttributes<HTMLAnchorElement> & { target?: string; rel?: string };
}

/** Render inline nodes. */
function renderInline(nodes: readonly MarkdownInline[]): ReactNode {
    return nodes.map((node, index) => {
        const key = index;
        switch (node.type) {
            case "text":
                return <Fragment key={key}>{node.value}</Fragment>;
            case "strong":
                return <strong key={key}>{renderInline(node.children)}</strong>;
            case "em":
                return <em key={key}>{renderInline(node.children)}</em>;
            case "del":
                return <del key={key}>{renderInline(node.children)}</del>;
            case "code":
                return (
                    <code key={key} className={styles.inlineCode}>
                        {node.value}
                    </code>
                );
            case "image":
                return <img key={key} className={styles.image} src={node.src} alt={node.alt} />;
            case "break":
                return <br key={key} />;
            default:
                return null;
        }
    });
}

/** CSS `text-align` for a table column. */
function alignOf(align: MarkdownAlign): { textAlign: "left" | "center" | "right" } | undefined {
    return align ? { textAlign: align } : undefined;
}

/**
 * Rendered Markdown, from a node tree — never from an HTML string.
 *
 * `dangerouslySetInnerHTML` appears nowhere in this component. That is what makes
 * rendering somebody else's Markdown safe by construction rather than by a promise
 * about escaping: a `<script>` in a comment is four characters of text, because text
 * is all a React child can be.
 *
 * Link and image URLs go through a scheme **allowlist** (`http`, `https`, `mailto`,
 * `tel`, `sms`, plus relative), so `[click](javascript:alert(1))` renders as plain
 * text. A blocklist would have to enumerate every spelling of `javascript:` and
 * would miss one.
 *
 * @example
 * <Markdown source={comentario.corpo} linkProps={{ target: "_blank", rel: "noreferrer" }} />
 */
export function Markdown({
    source,
    headingOffset = 2,
    highlightCode = true,
    showLineNumbers = false,
    linkProps,
    className,
    ...rest
}: MarkdownProps) {
    const blocks = useMemo(() => parseMarkdown(source), [source]);

    return (
        <div className={cn(styles.root, className)} {...rest}>
            {blocks.map((block, index) => (
                <Block
                    key={index}
                    block={block}
                    headingOffset={headingOffset}
                    highlightCode={highlightCode}
                    showLineNumbers={showLineNumbers}
                    linkProps={linkProps}
                />
            ))}
        </div>
    );
}

interface BlockProps {
    block: MarkdownBlock;
    headingOffset: number;
    highlightCode: boolean;
    showLineNumbers: boolean;
    linkProps?: MarkdownProps["linkProps"];
}

/** One block, and its children. */
function Block({ block, headingOffset, highlightCode, showLineNumbers, linkProps }: BlockProps) {
    const children = (nodes: readonly MarkdownBlock[]): ReactNode =>
        nodes.map((child, index) => (
            <Block
                key={index}
                block={child}
                headingOffset={headingOffset}
                highlightCode={highlightCode}
                showLineNumbers={showLineNumbers}
                linkProps={linkProps}
            />
        ));

    const inline = (nodes: readonly MarkdownInline[]): ReactNode =>
        nodes.map((node, index) =>
            node.type === "link" ? (
                <a key={index} className={styles.link} href={node.href} {...linkProps}>
                    {renderInline(node.children)}
                </a>
            ) : (
                <Fragment key={index}>{renderInline([node])}</Fragment>
            ),
        );

    switch (block.type) {
        case "heading": {
            const level = Math.min(6, Math.max(1, block.level + headingOffset - 1));
            const Tag = `h${level}` as "h1";
            return (
                <Tag className={styles[`h${level}` as keyof typeof styles]}>
                    {inline(block.children)}
                </Tag>
            );
        }
        case "paragraph":
            return <p>{inline(block.children)}</p>;
        case "code":
            return highlightCode ? (
                <CodeBlock
                    code={block.value}
                    language={block.language ?? undefined}
                    showLineNumbers={showLineNumbers}
                />
            ) : (
                <pre>
                    <code>{block.value}</code>
                </pre>
            );
        case "quote":
            return <blockquote className={styles.quote}>{children(block.children)}</blockquote>;
        case "rule":
            return <hr className={styles.rule} />;
        case "list":
            return block.ordered ? (
                <ol className={styles.list} start={block.start === 1 ? undefined : block.start}>
                    {block.items.map((item, index) => (
                        <li key={index} className={styles.item}>
                            {children(item)}
                        </li>
                    ))}
                </ol>
            ) : (
                <ul className={styles.list}>
                    {block.items.map((item, index) => (
                        <li key={index} className={styles.item}>
                            {children(item)}
                        </li>
                    ))}
                </ul>
            );
        case "table":
            return <Table block={block} inline={inline} />;
        default:
            return null;
    }
}

/**
 * A table, in its own scroll box.
 *
 * The box only becomes a tab stop while it actually overflows: a scroll container
 * with nothing focusable inside cannot be reached by keyboard, and adding the stop
 * unconditionally would pollute the tab order with one entry per table on the page.
 */
function Table({
    block,
    inline,
}: {
    block: Extract<MarkdownBlock, { type: "table" }>;
    inline: (nodes: readonly MarkdownInline[]) => ReactNode;
}) {
    const scroll = useRef<HTMLDivElement | null>(null);
    const overflowing = useScrollOverflow(scroll, "horizontal");

    return (
        <div
            ref={scroll}
            className={styles.tableScroll}
            tabIndex={overflowing ? 0 : undefined}
            role={overflowing ? "region" : undefined}
            aria-label={overflowing ? "Tabela rolável" : undefined}
        >
            <table className={styles.table}>
                <thead>
                    <tr>
                        {block.head.map((cell, index) => (
                            <th key={index} style={alignOf(block.align[index] ?? null)}>
                                {inline(cell)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {block.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                                <td key={cellIndex} style={alignOf(block.align[cellIndex] ?? null)}>
                                    {inline(cell)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
