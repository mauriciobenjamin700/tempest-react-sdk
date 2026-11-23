import { Check, Link2, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { whatsAppShareUrl } from "@/br/whatsapp";
import { Button } from "@/components/Button";
import type { ButtonSize, ButtonVariant } from "@/components/Button";
import { SHARE_MESSAGES } from "@/i18n/messages/share";
import { useTempestText } from "@/i18n/use-tempest-text";
import { shareText } from "@/share/share-text";
import { useShare } from "@/share/use-share";
import type { ShareOutcome } from "@/share/use-share";
import { cn } from "@/utils/cn";
import styles from "./ShareActions.module.css";

/** One button of {@link ShareActions}. */
export type ShareAction = "whatsapp" | "native" | "copy";

/** Texts of {@link ShareActions}. Each default comes from `TEMPEST_MESSAGES` (`tempest.share.*`). */
export interface ShareActionsLabels {
    /** WhatsApp button. Default `"Compartilhar no WhatsApp"` / `"Share on WhatsApp"`. */
    whatsapp: string;
    /** System share sheet button. Default `"Compartilhar"` / `"Share"`. */
    native: string;
    /** Copy button before copying. Default `"Copiar link"` / `"Copy link"`. */
    copy: string;
    /** Copy button and live announcement after copying. Default `"Link copiado"`. */
    copied: string;
    /** Hint under the selected field when no copy path worked. */
    manual: string;
    /** Accessible name of the read-only link field. Default `"Link para compartilhar"`. */
    field: string;
}

/** Props of {@link ShareActions}. */
export interface ShareActionsProps {
    /** The link being shared — what "copy" copies and what the WhatsApp text ends with. */
    url: string;
    /** Title of the system share sheet. */
    title?: string;
    /** Message text. The `url` is appended to it on WhatsApp unless it already contains it. */
    text?: string;
    /** Preview image sent as a file where the device accepts files. See `useShare`. */
    imageUrl?: string;
    /** File name for the image. See `useShare`. */
    imageFileName?: string;
    /**
     * Which buttons, in order. Default `["whatsapp", "native", "copy"]`. `"native"`
     * renders only where the browser has the Web Share API.
     */
    actions?: readonly ShareAction[];
    /** Overrides for any default text. */
    labels?: Partial<ShareActionsLabels>;
    /** Button variant. Default `"outline"`. */
    variant?: ButtonVariant;
    /** Button size. Default `"md"`. */
    size?: ButtonSize;
    /** Accessible name of the group. Defaults to the `native` label. */
    "aria-label"?: string;
    /** Called with the outcome of the system share sheet. */
    onShare?: (outcome: ShareOutcome) => void;
    /** Called after "copy": `true` when the clipboard took the link, `false` when the field was shown. */
    onCopy?: (copied: boolean) => void;
    className?: string;
}

const DEFAULT_ACTIONS: readonly ShareAction[] = ["whatsapp", "native", "copy"];

const COPIED_RESET_MS = 2000;

/**
 * Ready "share" buttons: WhatsApp, the system share sheet and "copy link".
 *
 * - **WhatsApp** is a real link to `wa.me/?text=…` (via `whatsAppShareUrl`), so it
 *   needs no popup permission, works with middle-click and opens the app on a
 *   phone. WhatsApp builds the preview card from the page's Open Graph tags.
 * - **Share** opens the system sheet through `useShare`, with `imageUrl` attached
 *   where the device accepts files. It renders only where `navigator.share`
 *   exists — the choice is by capability, never by user agent, so a desktop
 *   Chrome on Windows gets it and a phone browser without the API does not. The
 *   image download starts on hover, focus or pointer down, so the click's user
 *   activation does not expire waiting for it.
 * - **Copy link** tries the Clipboard API, then `execCommand("copy")`, and when
 *   both are refused (some in-app browsers) shows the link in a read-only field,
 *   already selected, with a hint to long-press. Success is announced through a
 *   live region.
 *
 * Texts go through `I18nProvider` (`tempest.share.*` in `TEMPEST_MESSAGES`), and
 * `labels` wins over both. Colours come from the theme tokens through `Button`.
 *
 * @example
 * <ShareActions
 *     title="Carona Picos → Teresina"
 *     text="Sexta, 07:05 · 3 vagas"
 *     url="https://app.example/c/42"
 *     imageUrl="https://app.example/c/42/og.png"
 * />
 */
export function ShareActions({
    url,
    title,
    text,
    imageUrl,
    imageFileName,
    actions = DEFAULT_ACTIONS,
    labels,
    variant = "outline",
    size = "md",
    "aria-label": ariaLabel,
    onShare,
    onCopy,
    className,
}: ShareActionsProps) {
    const messages = useTempestText(SHARE_MESSAGES);
    const label: ShareActionsLabels = {
        whatsapp: labels?.whatsapp ?? messages.t("tempest.share.whatsapp"),
        native: labels?.native ?? messages.t("tempest.share.native"),
        copy: labels?.copy ?? messages.t("tempest.share.copy"),
        copied: labels?.copied ?? messages.t("tempest.share.copied"),
        manual: labels?.manual ?? messages.t("tempest.share.manual"),
        field: labels?.field ?? messages.t("tempest.share.field"),
    };
    const { canShare, share, copyLink, prefetchImage } = useShare();
    const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
    const fieldRef = useRef<HTMLInputElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    useEffect(() => {
        if (copyState !== "manual") return;
        fieldRef.current?.focus();
        fieldRef.current?.select();
    }, [copyState]);

    const warmImage = (): void => {
        if (imageUrl) prefetchImage(imageUrl);
    };

    const handleShare = async (): Promise<void> => {
        const outcome = await share({ title, text, url, imageUrl, imageFileName });
        onShare?.(outcome);
    };

    const handleCopy = async (): Promise<void> => {
        const copied = await copyLink(url);
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        if (copied) {
            setCopyState("copied");
            timerRef.current = setTimeout(() => setCopyState("idle"), COPIED_RESET_MS);
        } else {
            setCopyState("manual");
        }
        onCopy?.(copied);
    };

    const buttons = actions.map((action) => {
        if (action === "whatsapp") {
            return (
                <Button
                    key={action}
                    className={styles.action}
                    variant={variant}
                    size={size}
                    href={whatsAppShareUrl(shareText(text, url))}
                    target="_blank"
                    leftIcon={<MessageCircle size={16} aria-hidden />}
                >
                    {label.whatsapp}
                </Button>
            );
        }
        if (action === "native") {
            if (!canShare) return null;
            return (
                <Button
                    key={action}
                    className={styles.action}
                    variant={variant}
                    size={size}
                    onPointerEnter={warmImage}
                    onPointerDown={warmImage}
                    onFocus={warmImage}
                    onClick={handleShare}
                    leftIcon={<Share2 size={16} aria-hidden />}
                >
                    {label.native}
                </Button>
            );
        }
        return (
            <Button
                key={action}
                className={styles.action}
                variant={variant}
                size={size}
                onClick={handleCopy}
                leftIcon={
                    copyState === "copied" ? (
                        <Check size={16} aria-hidden />
                    ) : (
                        <Link2 size={16} aria-hidden />
                    )
                }
            >
                {copyState === "copied" ? label.copied : label.copy}
            </Button>
        );
    });

    return (
        <div
            role="group"
            aria-label={ariaLabel ?? label.native}
            className={cn(styles.actions, className)}
        >
            {buttons}
            <span role="status" className={styles.status}>
                {copyState === "copied" ? label.copied : null}
            </span>
            {copyState === "manual" ? (
                <div className={styles.manual}>
                    <input
                        ref={fieldRef}
                        className={styles.field}
                        type="text"
                        readOnly
                        aria-label={label.field}
                        value={url}
                        onFocus={(event) => event.currentTarget.select()}
                    />
                    <span className={styles.hint}>{label.manual}</span>
                </div>
            ) : null}
        </div>
    );
}
