import type { ReactNode } from "react";

import type { InstallMethod } from "@/hooks/use-install-prompt";
import { InstallCopyLink } from "./InstallCopyLink";

/** What an install affordance needs to render the instruction for a method. */
export interface InstallHintInput {
    /** The strategy `useInstallPrompt` resolved. */
    method: InstallMethod;
    /** An `intent://` URL that re-opens the page in Chrome on Android, if any. */
    openInChromeIntent: string | null;
}

/** Renders the instruction shown when the browser has no install prompt. */
export type RenderInstallHint = (input: InstallHintInput) => ReactNode;

/**
 * The default instruction for a browser that cannot be prompted.
 *
 * Written out rather than left to the app because every app wrote the same two
 * sentences, and getting them wrong is invisible: an iOS user who is told to
 * look for an "Install" menu never finds one, because Safari puts it behind the
 * Share sheet.
 *
 * On an Android fork the copy also offers the `intent://` link the SDK already
 * builds — reopening the page in Chrome is the only path that reaches a real
 * install on a browser whose menu has no install entry at all.
 *
 * Inside an app's embedded browser (`"open-in-browser"`) nothing installs, so the
 * copy leads out of it: on Android straight through that same `intent://` link,
 * on iOS through the app's `⋯` menu — the entry is "Abrir no Safari" or "Abrir no
 * navegador" depending on the app — plus {@link InstallCopyLink}, which works in
 * every app whatever its menu calls the entry.
 *
 * @param input - The resolved method and the optional Chrome intent.
 * @returns The instruction, or `null` when the method needs none.
 */
export function defaultInstallHint({ method, openInChromeIntent }: InstallHintInput): ReactNode {
    if (method === "ios") {
        return (
            <>
                Toque em <strong>Compartilhar</strong> e escolha{" "}
                <strong>Adicionar à Tela de Início</strong>.
            </>
        );
    }
    if (method === "open-in-browser") {
        return (
            <>
                O navegador deste app não instala aplicativos.{" "}
                {openInChromeIntent ? (
                    <>
                        <a href={openInChromeIntent}>Abra no Chrome</a> para instalar.
                    </>
                ) : (
                    <>
                        Toque em <strong>⋯</strong> e escolha <strong>Abrir no Safari</strong> (ou{" "}
                        <strong>Abrir no navegador</strong>). Se não achar, copie o link e cole no
                        Safari.
                    </>
                )}
                <InstallCopyLink />
            </>
        );
    }
    if (method === "manual") {
        return (
            <>
                Abra o menu do navegador (<strong>⋮</strong>) e escolha{" "}
                <strong>Instalar app</strong>.
                {openInChromeIntent ? (
                    <>
                        {" "}
                        Se não houver essa opção, <a href={openInChromeIntent}>abra no Chrome</a>.
                    </>
                ) : null}
            </>
        );
    }
    return null;
}
