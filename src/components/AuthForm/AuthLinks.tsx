import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/utils/cn";
import { vettedHref } from "@/utils/safe-url";
import styles from "./AuthForm.module.css";

/**
 * A router link styled as the auth screens' inline action.
 *
 * Router `Link`, not `<a>`: the screens it connects are routes of the same app,
 * and a full reload between login and sign-up throws away the query cache and
 * any form state the user typed.
 *
 * `to` is vetted with `safeLinkUrl`'s allowlist before it reaches the `Link`, and a
 * destination it rejects renders nothing. The router's `Link` writes the string to
 * the anchor's `href`: React 19 replaces a `javascript:` href with a throwing stub,
 * but React 18 — inside the peer range — writes it verbatim, so an app that fills
 * `links` from a tenant's config or a query string would ship a clickable script
 * link. A dropped link is the same outcome as an unset route.
 *
 * @param props - Destination, content and an extra class.
 * @returns The link, or `null` when the destination is not a safe URL.
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
    const href = vettedHref(to);
    if (href === undefined) return null;
    return (
        <Link to={href} className={cn(styles.link, className)}>
            {children}
        </Link>
    );
}

/**
 * The "Não tem uma conta? Cadastre-se" line under a form.
 *
 * @param props - The leading sentence, the link text and its destination.
 * @returns The paragraph, or `null` when there is no destination or it is not
 *   a safe URL (see {@link AuthLink}).
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
    const href = vettedHref(to);
    if (href === undefined) return null;
    return (
        <p className={styles.prompt}>
            {prompt} <AuthLink to={href}>{label}</AuthLink>
        </p>
    );
}
