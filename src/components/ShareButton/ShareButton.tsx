import { MessageCircle, Share2 } from "lucide-react";

import { whatsAppShareUrl } from "@/br/whatsapp";
import { Button } from "@/components/Button";
import type { ButtonSize, ButtonVariant } from "@/components/Button";
import { SHARE_MESSAGES } from "@/i18n/messages/share";
import { useTempestText } from "@/i18n/use-tempest-text";
import { shareText } from "@/share/share-text";
import { useShare } from "@/share/use-share";
import type { ShareOutcome } from "@/share/use-share";

/** Texts of {@link ShareButton}. Defaults come from `TEMPEST_MESSAGES` (`tempest.share.*`). */
export interface ShareButtonLabels {
    /** Label where the system share sheet opens. Default `"Compartilhar"` / `"Share"`. */
    native: string;
    /** Label where it falls back to `wa.me`. Default `"Compartilhar no WhatsApp"`. */
    whatsapp: string;
}

/** Props of {@link ShareButton}. */
export interface ShareButtonProps {
    /** The link being shared. */
    url: string;
    /** Title of the system share sheet. */
    title?: string;
    /** Message text. On WhatsApp, `url` is appended unless the text already contains it. */
    text?: string;
    /** Preview image sent as a file where the device accepts files. See `useShare`. */
    imageUrl?: string;
    /** File name for the image. See `useShare`. */
    imageFileName?: string;
    /** Overrides for the default texts. */
    labels?: Partial<ShareButtonLabels>;
    /** Button variant. Default `"outline"`. */
    variant?: ButtonVariant;
    /** Button size. Default `"md"`. */
    size?: ButtonSize;
    /** Icon only — the label becomes the accessible name. For list cards. */
    iconOnly?: boolean;
    fullWidth?: boolean;
    /** Called with the outcome of the system share sheet (never on the `wa.me` path). */
    onShare?: (outcome: ShareOutcome) => void;
    className?: string;
}

/**
 * One "share" button that takes the path the browser supports.
 *
 * Where `navigator.share` exists it opens the system share sheet through
 * `useShare` — with `imageUrl` attached where the device accepts files, and the
 * image download started on hover, focus or pointer down. Where it does not, the
 * same button is a link to `wa.me/?text=…` and says so ("Compartilhar no
 * WhatsApp"): a label that promises the system sheet and opens WhatsApp Web
 * would be a lie on desktop Firefox.
 *
 * The choice is by **capability**, not user agent: a phone is not the
 * criterion, the API is. Desktop Chrome on Windows and macOS has the sheet;
 * Firefox desktop and Chrome on Linux do not. Use {@link ShareActions} when the
 * screen has room for WhatsApp, the sheet and "copy link" side by side.
 *
 * @example
 * <ShareButton
 *     iconOnly
 *     title="Carona Picos → Teresina"
 *     url="https://app.example/s/42"
 *     imageUrl="https://app.example/s/42/og.png"
 * />
 */
export function ShareButton({
    url,
    title,
    text,
    imageUrl,
    imageFileName,
    labels,
    variant = "outline",
    size = "md",
    iconOnly = false,
    fullWidth,
    onShare,
    className,
}: ShareButtonProps) {
    const messages = useTempestText(SHARE_MESSAGES);
    const { canShare, share, prefetchImage } = useShare();

    if (!canShare) {
        const label = labels?.whatsapp ?? messages.t("tempest.share.whatsapp");
        const icon = <MessageCircle size={16} aria-hidden />;
        return (
            <Button
                className={className}
                variant={variant}
                size={size}
                fullWidth={fullWidth}
                iconOnly={iconOnly}
                aria-label={iconOnly ? label : undefined}
                href={whatsAppShareUrl(shareText(text, url))}
                target="_blank"
                leftIcon={iconOnly ? undefined : icon}
            >
                {iconOnly ? icon : label}
            </Button>
        );
    }

    const label = labels?.native ?? messages.t("tempest.share.native");
    const icon = <Share2 size={16} aria-hidden />;
    const warmImage = (): void => {
        if (imageUrl) prefetchImage(imageUrl);
    };
    const handleClick = async (): Promise<void> => {
        const outcome = await share({ title, text, url, imageUrl, imageFileName });
        onShare?.(outcome);
    };

    return (
        <Button
            className={className}
            variant={variant}
            size={size}
            fullWidth={fullWidth}
            iconOnly={iconOnly}
            aria-label={iconOnly ? label : undefined}
            onPointerEnter={warmImage}
            onPointerDown={warmImage}
            onFocus={warmImage}
            onClick={handleClick}
            leftIcon={iconOnly ? undefined : icon}
        >
            {iconOnly ? icon : label}
        </Button>
    );
}
