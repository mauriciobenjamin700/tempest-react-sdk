import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import styles from "./InstallButton.module.css";

/** Copy shown by {@link InstallCopyLink}. */
export interface InstallCopyLinkLabels {
    /** Button label before copying. Default `"Copiar link"`. */
    copy: string;
    /** Button label after a successful copy. Default `"Link copiado"`. */
    copied: string;
    /**
     * Shown next to the selected address when no copy path worked. Default
     * `"Toque e segure o link para copiar."`.
     */
    manual: string;
    /** Accessible name of the read-only address field. Default `"Link da página"`. */
    field: string;
}

const DEFAULT_LABELS: InstallCopyLinkLabels = {
    copy: "Copiar link",
    copied: "Link copiado",
    manual: "Toque e segure o link para copiar.",
    field: "Link da página",
};

const COPIED_RESET_MS = 2000;

/** Props of {@link InstallCopyLink}. */
export interface InstallCopyLinkProps {
    /** Address to copy. Defaults to `window.location.href` at click time. */
    url?: string;
    /** Overrides for any of the PT-BR default labels. */
    labels?: Partial<InstallCopyLinkLabels>;
}

/**
 * Writes `text` to the clipboard through the first path the runtime allows.
 *
 * `navigator.clipboard.writeText` comes first, but an embedded browser is where
 * it most often fails: absent outside a secure context, and rejected by web
 * views that never grant the permission. The legacy `execCommand("copy")` on a
 * selected, off-screen `<textarea>` still works in many of those, so it is the
 * second try rather than a branch only for missing APIs.
 *
 * @tempest-limits empty-catch — a rejected or throwing copy path is the signal to
 * try the next one, and the caller turns the final `false` into the visible
 * selection fallback.
 *
 * @param text - The text to copy.
 * @returns Whether either path reported success.
 */
async function writeToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        /* empty */
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    try {
        textarea.select();
        return typeof document.execCommand === "function" && document.execCommand("copy");
    } catch {
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}

/**
 * "Copy link" button for leaving an app's embedded browser.
 *
 * Inside Instagram, WhatsApp or Facebook the page cannot be installed, and the
 * menu entry that reopens it in Safari is named differently by every app. Copying
 * the address and pasting it in the browser is the path that works in all of
 * them. When neither the Clipboard API nor `execCommand("copy")` succeeds — both
 * are blocked in some web views — the address appears in a read-only field,
 * already selected, so the system's own long-press copy finishes the job.
 *
 * Rendered by {@link defaultInstallHint} for the `"open-in-browser"` method.
 * Use it directly when you replace the hint with `renderHint`, passing `labels`
 * to translate it.
 *
 * @example
 * <InstallCopyLink labels={{ copy: "Copy link", copied: "Link copied" }} />
 */
export function InstallCopyLink({ url, labels }: InstallCopyLinkProps) {
    const text: InstallCopyLinkLabels = { ...DEFAULT_LABELS, ...labels };
    const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
    const [manualUrl, setManualUrl] = useState<string>("");
    const fieldRef = useRef<HTMLInputElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, []);

    useEffect(() => {
        if (state !== "manual") return;
        fieldRef.current?.focus();
        fieldRef.current?.select();
    }, [state]);

    const handleClick = async (): Promise<void> => {
        const target = url ?? window.location.href;
        if (await writeToClipboard(target)) {
            setState("copied");
            if (timerRef.current !== null) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setState("idle"), COPIED_RESET_MS);
            return;
        }
        setManualUrl(target);
        setState("manual");
    };

    return (
        <span className={styles.copyLink}>
            <Button variant="outline" size="xs" onClick={handleClick}>
                {state === "copied" ? text.copied : text.copy}
            </Button>
            <span role="status" className={styles.copyStatus}>
                {state === "copied" ? text.copied : null}
            </span>
            {state === "manual" ? (
                <>
                    <input
                        ref={fieldRef}
                        className={styles.copyField}
                        type="text"
                        readOnly
                        aria-label={text.field}
                        value={manualUrl}
                        onFocus={(event) => event.currentTarget.select()}
                    />
                    <span className={styles.copyManual}>{text.manual}</span>
                </>
            ) : null}
        </span>
    );
}
