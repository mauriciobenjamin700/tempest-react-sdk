import { cn } from "@/utils/cn";
import { Avatar } from "../Avatar";
import type { AvatarSize } from "../Avatar";
import styles from "./AvatarGroup.module.css";

/** One participant of the group. */
export interface AvatarGroupItem {
    /** Image URL. Falls back to initials from `name`. */
    src?: string;
    /** Full name — drives the initials and the accessible label. */
    name: string;
}

export interface AvatarGroupProps {
    items: AvatarGroupItem[];
    /** How many avatars to show before collapsing into `+N`. Default `4`. */
    max?: number;
    size?: AvatarSize;
    /** Accessible name of the group, e.g. `"Participantes"`. */
    label?: string;
    /**
     * Called when the `+N` chip is activated — a natural hook for "see all
     * participants". Without it the chip is plain text and not focusable.
     */
    onOverflowClick?: () => void;
    className?: string;
}

/**
 * Overlapping row of avatars with a `+N` overflow chip — participants of a
 * meeting, assignees of a task, members of a team.
 *
 * The whole row is one `role="group"` with a single accessible name, and each
 * avatar's name is exposed as its label. That is deliberate: announcing seven
 * separate images with no relation between them is noise, and the overflow chip
 * carries the remaining count so the total is never hidden from a screen reader.
 *
 * @example
 * ```tsx
 * <AvatarGroup
 *   label="Participantes"
 *   max={3}
 *   items={[
 *     { name: "Ada Lovelace", src: ada },
 *     { name: "Grace Hopper" },
 *     { name: "Alan Turing" },
 *     { name: "Edsger Dijkstra" },
 *   ]}
 *   onOverflowClick={() => setDrawerOpen(true)}
 * />
 * ```
 */
export function AvatarGroup({
    items,
    max = 4,
    size = "md",
    label,
    onOverflowClick,
    className,
}: AvatarGroupProps) {
    const limit = Math.max(0, max);
    const visible = items.slice(0, limit);
    const overflow = items.length - visible.length;

    return (
        <div role="group" aria-label={label} className={cn(styles.group, styles[size], className)}>
            {visible.map((item, index) => (
                <span key={`${item.name}-${index}`} className={styles.slot}>
                    <Avatar src={item.src} name={item.name} alt={item.name} size={size} />
                </span>
            ))}

            {overflow > 0 ? (
                <span className={styles.slot}>
                    {onOverflowClick ? (
                        <button
                            type="button"
                            className={cn(styles.overflow, styles.overflowButton)}
                            aria-label={`${overflow} more`}
                            onClick={onOverflowClick}
                        >
                            +{overflow}
                        </button>
                    ) : (
                        <span className={styles.overflow} aria-label={`${overflow} more`}>
                            +{overflow}
                        </span>
                    )}
                </span>
            ) : null}
        </div>
    );
}
