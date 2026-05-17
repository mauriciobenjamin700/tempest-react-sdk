import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import styles from "./Tabs.module.css";

export interface TabItem {
    id: string;
    label: ReactNode;
    content: ReactNode;
    disabled?: boolean;
}

export interface TabsProps {
    items: TabItem[];
    /** Initial active tab id. Defaults to the first non-disabled item. */
    defaultId?: string;
    /** Controlled active id. When provided, ignore internal state. */
    activeId?: string;
    onChange?: (id: string) => void;
    variant?: "underline" | "pill";
    className?: string;
}

/**
 * Accessible tabs with an underline (default) or pill variant. Controlled via
 * `activeId` + `onChange` or uncontrolled via `defaultId`.
 */
export function Tabs({
    items,
    defaultId,
    activeId,
    onChange,
    variant = "underline",
    className,
}: TabsProps) {
    const firstEnabled = items.find((item) => !item.disabled);
    const [internal, setInternal] = useState<string | undefined>(defaultId ?? firstEnabled?.id);

    const isControlled = activeId !== undefined;
    const current = isControlled ? activeId : internal;
    const active = items.find((item) => item.id === current) ?? firstEnabled;

    function activate(id: string): void {
        if (!isControlled) setInternal(id);
        onChange?.(id);
    }

    return (
        <div className={className}>
            <div
                role="tablist"
                className={cn(styles.tablist, variant === "pill" && styles.pill)}
            >
                {items.map((item) => {
                    const isActive = item.id === active?.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`panel-${item.id}`}
                            id={`tab-${item.id}`}
                            disabled={item.disabled}
                            className={cn(styles.tab, isActive && styles.active)}
                            onClick={() => activate(item.id)}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
            {active && (
                <div
                    role="tabpanel"
                    id={`panel-${active.id}`}
                    aria-labelledby={`tab-${active.id}`}
                    className={styles.panel}
                >
                    {active.content}
                </div>
            )}
        </div>
    );
}
