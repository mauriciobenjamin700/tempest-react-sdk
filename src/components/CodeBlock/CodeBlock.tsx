/**
 * @tempest-limits props-count — code and language drive the scanner; filename,
 * showLineNumbers, highlightLines, maxHeight and wrap are the presentation a docs
 * page picks per block, and copyable plus label are the affordance and its
 * accessible name. All independent, all used in the SDK's own docs gallery.
 */
import { Fragment, useMemo } from "react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/utils/cn";

import { CopyButton } from "../CopyButton";
import { resolveLanguage, tokenizeLines } from "./tokenize";
import styles from "./CodeBlock.module.css";

export interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** The source to display. Leading and trailing blank lines are trimmed. */
    code: string;
    /** Grammar name or alias (`ts`, `bash`, `json`…). Unknown values render plain. */
    language?: string;
    /** Shown in the header, usually a file path. */
    filename?: ReactNode;
    /** Number the lines. Default `false`. */
    showLineNumbers?: boolean;
    /** 1-based line numbers to mark as the point of the snippet. */
    highlightLines?: readonly number[];
    /** Offer a copy button. Default `true`. */
    copyable?: boolean;
    /** Cap the height in px or any CSS length; the body scrolls past it. */
    maxHeight?: number | string;
    /** Wrap long lines instead of scrolling sideways. Default `false`. */
    wrap?: boolean;
    /**
     * Accessible name for the code region. Defaults to naming the language, and
     * to the filename when there is one.
     */
    label?: string;
}

/**
 * A read-only code sample: syntax colours, optional line numbers, copy button.
 *
 * The `<pre>` is always focusable. A code block is scrollable and holds nothing
 * focusable inside, so without a tab stop a keyboard user can see there is more
 * code past the edge and has no way to reach it. It is the one scroll container
 * where the stop is unconditional rather than measured — a code sample is
 * expected to be reachable, read and selected on its own.
 *
 * Colours come from an approximate scanner, not a parser — see {@link tokenize}.
 *
 * @example
 * <CodeBlock code={snippet} language="ts" filename="src/main.ts" showLineNumbers />
 * <CodeBlock code={log} language="bash" maxHeight={280} />
 */
export function CodeBlock({
    code,
    language,
    filename,
    showLineNumbers = false,
    highlightLines,
    copyable = true,
    maxHeight,
    wrap = false,
    label,
    className,
    ...rest
}: CodeBlockProps) {
    const trimmed = useMemo(() => code.replace(/^\n+/, "").replace(/\s+$/, ""), [code]);
    const lines = useMemo(() => tokenizeLines(trimmed, language), [trimmed, language]);
    const resolved = resolveLanguage(language);
    const marked = useMemo(() => new Set(highlightLines ?? []), [highlightLines]);

    const name =
        label ??
        (filename && typeof filename === "string"
            ? `Código: ${filename}`
            : `Bloco de código${resolved === "plain" ? "" : ` em ${resolved}`}`);

    const hasHeader = Boolean(filename) || copyable;

    return (
        <div className={cn(styles.wrapper, className)} {...rest}>
            {hasHeader && (
                <div className={styles.header}>
                    <span className={styles.filename}>
                        {filename ?? (resolved === "plain" ? "" : resolved)}
                    </span>
                    {copyable && <CopyButton value={trimmed} className={styles.copy} />}
                </div>
            )}

            <pre
                className={cn(styles.pre, wrap && styles.wrap)}
                style={{ maxHeight }}
                tabIndex={0}
                role="group"
                aria-label={name}
            >
                <code className={styles.code} data-language={resolved}>
                    {lines.map((tokens, index) => (
                        <Fragment key={index}>
                            <span
                                className={cn(styles.line, marked.has(index + 1) && styles.marked)}
                            >
                                {showLineNumbers && (
                                    /*
                                     * The number is decoration: it must not land in the
                                     * clipboard when the reader selects the snippet, and a
                                     * screen reader announcing "one const two import" adds
                                     * nothing. `user-select: none` in CSS plus this.
                                     */
                                    <span className={styles.lineNumber} aria-hidden="true">
                                        {index + 1}
                                    </span>
                                )}
                                <span className={styles.lineContent}>
                                    {tokens.map((token, tokenIndex) => (
                                        <span
                                            key={tokenIndex}
                                            className={styles[token.kind]}
                                            data-token={token.kind}
                                        >
                                            {token.value}
                                        </span>
                                    ))}
                                </span>
                            </span>
                            {/*
                             * A real newline character, and outside the line box.
                             * It has to be real so that selecting the snippet by
                             * hand and copying yields the source instead of one
                             * run-together line. It has to be outside because the
                             * line is an inline-block: a newline within one is
                             * consumed inside that box, and every line ends up
                             * side by side on a single row. The last one is
                             * dropped so the block does not end in blank space.
                             */}
                            {index < lines.length - 1 ? "\n" : null}
                        </Fragment>
                    ))}
                </code>
            </pre>
        </div>
    );
}
