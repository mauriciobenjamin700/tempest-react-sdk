import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import { findA11yViolations, formatA11yViolations } from "../../../test/a11y";
import { ShareActions } from "./ShareActions";

const ORIGINAL_CLIPBOARD = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const ORIGINAL_EXEC_COMMAND = document.execCommand;
const URL_42 = "https://app.example/c/42";

/**
 * Install `navigator.share` / `navigator.canShare`.
 *
 * @param acceptsFiles - What `canShare` answers.
 * @param result - How `navigator.share` settles.
 * @returns The `share` stub.
 */
function stubWebShare(
    acceptsFiles: boolean,
    result: () => Promise<void> = () => Promise.resolve(),
): ReturnType<typeof vi.fn> {
    const share = vi.fn(result);
    Object.assign(navigator, { share, canShare: vi.fn(() => acceptsFiles) });
    return share;
}

/**
 * Install a clipboard whose `writeText` settles as given.
 *
 * @param writeText - The stub, or `undefined` for no Clipboard API.
 */
function stubClipboard(writeText: ReturnType<typeof vi.fn> | undefined): void {
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: writeText ? { writeText } : undefined,
    });
}

beforeEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
});

afterEach(() => {
    delete (navigator as { share?: unknown }).share;
    delete (navigator as { canShare?: unknown }).canShare;
    if (ORIGINAL_CLIPBOARD) Object.defineProperty(navigator, "clipboard", ORIGINAL_CLIPBOARD);
    else delete (navigator as unknown as Record<string, unknown>).clipboard;
    document.execCommand = ORIGINAL_EXEC_COMMAND;
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("ShareActions", () => {
    it("links WhatsApp to the chat picker with the text and the link, in a new tab", () => {
        render(<ShareActions text="Carona sexta 07:05" url={URL_42} />);
        const link = screen.getByRole("link", { name: "Compartilhar no WhatsApp" });
        expect(link).toHaveAttribute(
            "href",
            `https://wa.me/?text=${encodeURIComponent(`Carona sexta 07:05\n${URL_42}`)}`,
        );
        expect(link).toHaveAttribute("target", "_blank");
        expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("hides the share-sheet button where the browser has no Web Share API", () => {
        render(<ShareActions url={URL_42} />);
        expect(screen.queryByRole("button", { name: "Compartilhar" })).toBeNull();
        expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
    });

    it("opens the share sheet and reports the outcome where Web Share exists", async () => {
        const share = stubWebShare(false);
        const onShare = vi.fn();
        render(<ShareActions title="Carona" url={URL_42} onShare={onShare} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
        });
        expect(share).toHaveBeenCalledWith({ title: "Carona", url: URL_42 });
        expect(onShare).toHaveBeenCalledWith("shared");
    });

    it("reports a closed sheet as cancelled and shows nothing", async () => {
        stubWebShare(false, () => Promise.reject(new DOMException("closed", "AbortError")));
        const onShare = vi.fn();
        render(<ShareActions url={URL_42} onShare={onShare} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Compartilhar" }));
        });
        expect(onShare).toHaveBeenCalledWith("cancelled");
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("starts the image download on hover so the click does not wait for it", async () => {
        const fetchStub = vi.fn(
            async () =>
                new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } }),
        );
        vi.stubGlobal("fetch", fetchStub);
        const share = stubWebShare(true);
        render(<ShareActions url={URL_42} imageUrl="https://app.example/c/42/og.png" />);
        const button = screen.getByRole("button", { name: "Compartilhar" });
        fireEvent.pointerEnter(button);
        expect(fetchStub).toHaveBeenCalledTimes(1);
        await act(async () => {
            fireEvent.click(button);
        });
        expect(fetchStub).toHaveBeenCalledTimes(1);
        expect((share.mock.calls[0]?.[0] as ShareData).files?.[0]?.name).toBe("og.png");
    });

    it("copies the link, announces it and resets the label after two seconds", async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        const onCopy = vi.fn();
        render(<ShareActions url={URL_42} onCopy={onCopy} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });
        expect(writeText).toHaveBeenCalledWith(URL_42);
        expect(onCopy).toHaveBeenCalledWith(true);
        expect(screen.getByRole("button", { name: "Link copiado" })).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Link copiado");
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
    });

    it("falls back to execCommand when the Clipboard API rejects", async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
        const execCommand = vi.fn(() => true);
        document.execCommand = execCommand;
        render(<ShareActions url={URL_42} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });
        expect(execCommand).toHaveBeenCalledWith("copy");
        expect(screen.getByRole("button", { name: "Link copiado" })).toBeInTheDocument();
    });

    it("shows the link selected in a read-only field when every copy path is refused", async () => {
        stubClipboard(undefined);
        document.execCommand = vi.fn(() => false);
        const onCopy = vi.fn();
        render(<ShareActions url={URL_42} onCopy={onCopy} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });
        const field = screen.getByRole("textbox", { name: "Link para compartilhar" });
        expect(field).toHaveValue(URL_42);
        expect(field).toHaveAttribute("readonly");
        expect(field).toHaveFocus();
        expect((field as HTMLInputElement).selectionStart).toBe(0);
        expect((field as HTMLInputElement).selectionEnd).toBe(URL_42.length);
        expect(screen.getByText("Toque e segure o link para copiar.")).toBeInTheDocument();
        expect(onCopy).toHaveBeenCalledWith(false);
    });

    it("renders only the requested actions, in the requested order", () => {
        stubWebShare(false);
        render(<ShareActions url={URL_42} actions={["copy", "native"]} />);
        const names = screen.getAllByRole("button").map((element) => element.textContent);
        expect(names).toEqual(["Copiar link", "Compartilhar"]);
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("lets labels win over the built-in texts", () => {
        render(<ShareActions url={URL_42} labels={{ whatsapp: "Mandar no Zap" }} />);
        expect(screen.getByRole("link", { name: "Mandar no Zap" })).toBeInTheDocument();
    });

    it("speaks English under an English I18nProvider with no setup", () => {
        stubWebShare(false);
        render(
            <I18nProvider locale="en" messages={{ en: {} }} storageKey={null}>
                <ShareActions url={URL_42} />
            </I18nProvider>,
        );
        expect(screen.getByRole("group", { name: "Share" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Share on WhatsApp" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    });

    it("has no axe violations, including the manual-copy field", async () => {
        stubWebShare(false);
        stubClipboard(undefined);
        document.execCommand = vi.fn(() => false);
        const { container } = render(<ShareActions text="Oi" url={URL_42} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });
        const violations = await findA11yViolations(container);
        expect(violations, formatA11yViolations(violations)).toEqual([]);
    });
});
