import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/utils/cn";
import styles from "./AuthForm.module.css";

/**
 * A router link styled as the auth screens' inline action.
 *
 * Router `Link`, not `<a>`: the screens it connects are routes of the same app,
 * and a full reload between login and sign-up throws away the query cache and
 * any form state the user typed.
 *
 * @param props - Destination, content and an extra class.
 * @returns The link.
 */
export function AuthLink({
    to,
    children,
    className,
}: {
    to: string;
    children: ReactNode;
    className?: string;
}): ReactNode {
    return (
        <Link to={to} className={cn(styles.link, className)}>
            {children}
        </Link>
    );
}

/**
 * The "Não tem uma conta? Cadastre-se" line under a form.
 *
 * @param props - The leading sentence, the link text and its destination.
 * @returns The paragraph, or `null` when there is no destination.
 */
export function AuthPrompt({
    prompt,
    label,
    to,
}: {
    prompt: ReactNode;
    label: ReactNode;
    to: string | undefined;
}): ReactNode {
    if (to === undefined) return null;
    return (
        <p className={styles.prompt}>
            {prompt} <AuthLink to={to}>{label}</AuthLink>
        </p>
    );
}
