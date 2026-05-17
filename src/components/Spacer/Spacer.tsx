import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";
import styles from "./Spacer.module.css";

export type SpacerAxis = "both" | "x" | "y";

export interface SpacerProps extends HTMLAttributes<HTMLDivElement> {
    /** Axis to flex along. Default `"both"` (`flex: 1`). */
    axis?: SpacerAxis;
}

/**
 * Flex spacer — pushes siblings apart inside a flex container. Equivalent
 * to `<div style={{ flex: 1 }}>` but typed and intent-revealing.
 *
 * @example
 * <Stack direction="horizontal">
 *     <Button>Cancelar</Button>
 *     <Spacer />
 *     <Button variant="primary">Salvar</Button>
 * </Stack>
 */
export function Spacer({ axis = "both", className, ...props }: SpacerProps) {
    return <div className={cn(styles.spacer, styles[axis], className)} {...props} />;
}
