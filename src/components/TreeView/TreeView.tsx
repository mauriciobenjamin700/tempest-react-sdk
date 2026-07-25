import { ChevronRight } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./TreeView.module.css";

/** One node of the tree. Children make it a branch; no children makes it a leaf. */
export interface TreeNode {
    /** Stable identifier, unique across the whole tree. */
    id: string;
    /** Rendered label. */
    label: ReactNode;
    /** Child nodes. An empty array still renders as a branch (an empty folder). */
    children?: TreeNode[];
    /** Icon rendered before the label. */
    icon?: ReactNode;
    /** Blocks selection and expansion, and skips the node in keyboard navigation. */
    disabled?: boolean;
}

export interface TreeViewProps {
    /** Root nodes. */
    nodes: TreeNode[];
    /** Controlled expanded ids. */
    expandedIds?: string[];
    /** Uncontrolled initial expanded ids. */
    defaultExpandedIds?: string[];
    onExpandedChange?: (expandedIds: string[]) => void;
    /** Controlled selected id. `null` means nothing selected. */
    selectedId?: string | null;
    /** Uncontrolled initial selection. */
    defaultSelectedId?: string | null;
    onSelect?: (node: TreeNode) => void;
    /**
     * Selecting a branch also toggles it. Default `true` — matches how a file
     * explorer behaves; set `false` when a branch is itself a meaningful choice
     * (a category that owns items, for instance).
     */
    toggleOnSelect?: boolean;
    /** Accessible name for the tree. */
    label?: string;
    className?: string;
}

interface FlatNode {
    node: TreeNode;
    depth: number;
    parentId: string | null;
    hasChildren: boolean;
    expanded: boolean;
}

/**
 * Walk the tree into the list of *currently visible* rows.
 *
 * Keyboard navigation works on this flattened view, which is what makes
 * ArrowDown from the last child of a collapsed-sibling branch land on the right
 * row: rows that are not rendered simply are not in the list.
 */
function flatten(
    nodes: TreeNode[],
    expandedIds: Set<string>,
    depth = 0,
    parentId: string | null = null,
    out: FlatNode[] = [],
): FlatNode[] {
    for (const node of nodes) {
        const hasChildren = Array.isArray(node.children);
        const expanded = hasChildren && expandedIds.has(node.id);
        out.push({ node, depth, parentId, hasChildren, expanded });
        if (expanded && node.children) {
            flatten(node.children, expandedIds, depth + 1, node.id, out);
        }
    }
    return out;
}

/**
 * Accessible tree for hierarchical data — categories, permissions, folders, an
 * org chart.
 *
 * Implements the `tree` role with **roving tabindex**: exactly one row is
 * tabbable, and the arrow keys move focus within the widget. That is what keeps a
 * 500-node tree from adding 500 stops to the page's tab order.
 *
 * Keyboard map: `↓`/`↑` move, `→` expands (or descends), `←` collapses (or goes to
 * the parent), `Home`/`End` jump to the first/last visible row, `Enter`/`Space`
 * select.
 *
 * The chevron is decoration (`aria-hidden`), not a button: the row itself carries
 * `aria-expanded`, so a second focusable control there would only add noise for a
 * screen reader while duplicating an action the keyboard map already has. It still
 * accepts a click, with the event stopped so it toggles without also selecting.
 *
 * @example
 * ```tsx
 * const nodes: TreeNode[] = [
 *   {
 *     id: "vendas",
 *     label: "Vendas",
 *     children: [
 *       { id: "vendas.ler", label: "Ler" },
 *       { id: "vendas.editar", label: "Editar" },
 *     ],
 *   },
 *   { id: "config", label: "Configurações", children: [] },
 * ];
 *
 * <TreeView nodes={nodes} defaultExpandedIds={["vendas"]} onSelect={(node) => console.log(node.id)} />
 * ```
 */
export function TreeView({
    nodes,
    expandedIds,
    defaultExpandedIds = [],
    onExpandedChange,
    selectedId,
    defaultSelectedId = null,
    onSelect,
    toggleOnSelect = true,
    label,
    className,
}: TreeViewProps) {
    const expandedControlled = expandedIds !== undefined;
    const [internalExpanded, setInternalExpanded] = useState<string[]>(defaultExpandedIds);
    const expanded = expandedControlled ? expandedIds : internalExpanded;

    const selectionControlled = selectedId !== undefined;
    const [internalSelected, setInternalSelected] = useState<string | null>(defaultSelectedId);
    const selected = selectionControlled ? selectedId : internalSelected;

    const expandedSet = useMemo(() => new Set(expanded), [expanded]);
    const rows = useMemo(() => flatten(nodes, expandedSet), [nodes, expandedSet]);

    const [focusedId, setFocusedId] = useState<string | null>(null);
    const containerRef = useRef<HTMLUListElement>(null);

    const activeId =
        focusedId ?? selected ?? rows.find((row) => !row.node.disabled)?.node.id ?? null;

    const setExpanded = useCallback(
        (next: string[]): void => {
            if (!expandedControlled) setInternalExpanded(next);
            onExpandedChange?.(next);
        },
        [expandedControlled, onExpandedChange],
    );

    const toggle = useCallback(
        (id: string): void => {
            setExpanded(
                expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id],
            );
        },
        [expanded, setExpanded],
    );

    const select = useCallback(
        (row: FlatNode): void => {
            if (row.node.disabled) return;
            if (!selectionControlled) setInternalSelected(row.node.id);
            setFocusedId(row.node.id);
            onSelect?.(row.node);
            if (row.hasChildren && toggleOnSelect) toggle(row.node.id);
        },
        [onSelect, selectionControlled, toggle, toggleOnSelect],
    );

    /** Move DOM focus to a row by id, so the roving tabindex actually roves. */
    const focusRow = useCallback((id: string): void => {
        setFocusedId(id);
        const element = containerRef.current?.querySelector<HTMLElement>(`[data-tree-id="${id}"]`);
        element?.focus();
    }, []);

    const moveFocus = useCallback(
        (from: number, delta: number): void => {
            for (let index = from + delta; index >= 0 && index < rows.length; index += delta) {
                if (!rows[index].node.disabled) {
                    focusRow(rows[index].node.id);
                    return;
                }
            }
        },
        [rows, focusRow],
    );

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>, row: FlatNode, index: number): void => {
            switch (event.key) {
                case "ArrowDown":
                    event.preventDefault();
                    moveFocus(index, 1);
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    moveFocus(index, -1);
                    break;
                case "ArrowRight":
                    event.preventDefault();
                    if (row.hasChildren && !row.expanded) toggle(row.node.id);
                    else if (row.expanded) moveFocus(index, 1);
                    break;
                case "ArrowLeft":
                    event.preventDefault();
                    if (row.expanded) {
                        toggle(row.node.id);
                    } else if (row.parentId) {
                        focusRow(row.parentId);
                    }
                    break;
                case "Home":
                    event.preventDefault();
                    moveFocus(-1, 1);
                    break;
                case "End":
                    event.preventDefault();
                    moveFocus(rows.length, -1);
                    break;
                case "Enter":
                case " ":
                    event.preventDefault();
                    select(row);
                    break;
                default:
                    break;
            }
        },
        [moveFocus, rows.length, select, toggle, focusRow],
    );

    return (
        <ul
            ref={containerRef}
            role="tree"
            aria-label={label}
            className={cn(styles.tree, className)}
        >
            {rows.map((row, index) => {
                const isSelected = selected === row.node.id;
                return (
                    <li
                        key={row.node.id}
                        role="treeitem"
                        aria-expanded={row.hasChildren ? row.expanded : undefined}
                        aria-selected={isSelected}
                        aria-level={row.depth + 1}
                        aria-disabled={row.node.disabled || undefined}
                        className={styles.item}
                    >
                        <div
                            data-tree-id={row.node.id}
                            className={cn(
                                styles.row,
                                isSelected && styles.selected,
                                row.node.disabled && styles.disabled,
                            )}
                            style={{
                                paddingInlineStart: `calc(${row.depth} * var(--tempest-space-5))`,
                            }}
                            tabIndex={activeId === row.node.id && !row.node.disabled ? 0 : -1}
                            onClick={() => select(row)}
                            onFocus={() => setFocusedId(row.node.id)}
                            onKeyDown={(event) => handleKeyDown(event, row, index)}
                        >
                            {row.hasChildren ? (
                                <span
                                    className={cn(
                                        styles.chevron,
                                        row.expanded && styles.chevronOpen,
                                    )}
                                    aria-hidden="true"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (!row.node.disabled) toggle(row.node.id);
                                    }}
                                >
                                    <ChevronRight size={14} />
                                </span>
                            ) : (
                                <span className={styles.chevronPlaceholder} aria-hidden="true" />
                            )}
                            {row.node.icon ? (
                                <span className={styles.icon} aria-hidden="true">
                                    {row.node.icon}
                                </span>
                            ) : null}
                            <span className={styles.label}>{row.node.label}</span>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
