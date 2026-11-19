import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InstallBanner } from "@/components/InstallBanner";
import { InstallButton } from "./InstallButton";
import { InstallCopyLink } from "./InstallCopyLink";

/**
 * UAs copied verbatim from `ua-parser-js` browser fixtures at commit `8b7f928`
 * (`whatsapp.json`, `instagram.json`); the full table, with every app and its
 * source, lives in `src/hooks/in-app-browser.test.tsx`.
 */
const WHATSAPP_IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1 [WAiOS/2.26.31]";
const WHATSAPP_ANDROID =
    "Mozilla/5.0 (Linux; Android 16; 2311DRK48G Build/BP2A.250605.031.A3; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.83 Mobile Safari/537.36 WA4A/2.26.30.97";
const INSTAGRAM_IOS =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 142.0.0.22.109 (iPhone12,5; iOS 14_1; en_US; en-US; scale=3.00; 1242x2688; 214888322) NW/1";

const ORIGINAL_UA = navigator.userAgent;
const ORIGINAL_CLIPBOARD = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const ORIGINAL_EXEC_COMMAND = document.execCommand;

function setUserAgent(ua: string): void {
    Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
    Object.defineProperty(navigator, "clipboard", {
        value: writeText ? { writeText } : undefined,
        configurable: true,
    });
}

afterEach(() => {
    setUserAgent(ORIGINAL_UA);
    if (ORIGINAL_CLIPBOARD) Object.defineProperty(navigator, "clipboard", ORIGINAL_CLIPBOARD);
    else delete (navigator as unknown as Record<string, unknown>).clipboard;
    document.execCommand = ORIGINAL_EXEC_COMMAND;
    vi.useRealTimers();
    window.localStorage.clear();
});

describe("InstallButton — inside an app's embedded browser", () => {
    it("tells an iPhone user in WhatsApp to open Safari, not to look for Share → Add to Home Screen", () => {
        setUserAgent(WHATSAPP_IOS);
        render(<InstallButton />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText("Abrir no Safari")).toBeInTheDocument();
        expect(screen.queryByText(/Adicionar à Tela de Início/)).toBeNull();
        expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("hands an Android user in WhatsApp the Chrome intent straight away", () => {
        setUserAgent(WHATSAPP_ANDROID);
        render(<InstallButton />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByRole("link", { name: "Abra no Chrome" })).toHaveAttribute(
            "href",
            expect.stringContaining("intent://"),
        );
        expect(screen.queryByText("Abrir no Safari")).toBeNull();
    });

    it("gives InstallBanner the same instruction without any change in the app", () => {
        setUserAgent(INSTAGRAM_IOS);
        render(<InstallBanner />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText("Abrir no Safari")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
    });

    it("passes the new method to a custom renderHint", () => {
        setUserAgent(INSTAGRAM_IOS);
        render(<InstallButton renderHint={({ method }) => <span>método: {method}</span>} />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText("método: open-in-browser")).toBeInTheDocument();
    });
});

describe("InstallCopyLink", () => {
    it("copies the page address through the Clipboard API", async () => {
        vi.useFakeTimers();
        const writeText = vi.fn(async () => undefined);
        setClipboard(writeText);
        render(<InstallCopyLink />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });

        expect(writeText).toHaveBeenCalledWith(window.location.href);
        expect(screen.getByRole("button", { name: "Link copiado" })).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Link copiado");

        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByRole("button", { name: "Copiar link" })).toBeInTheDocument();
    });

    it("falls back to execCommand when the web view rejects the Clipboard API", async () => {
        setClipboard(vi.fn(async () => Promise.reject(new Error("NotAllowedError"))));
        const execCommand = vi.fn(() => true);
        document.execCommand = execCommand;
        render(<InstallCopyLink url="https://app.example/convite" />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });

        expect(execCommand).toHaveBeenCalledWith("copy");
        expect(screen.getByRole("button", { name: "Link copiado" })).toBeInTheDocument();
        expect(document.querySelector("textarea")).toBeNull();
    });

    it("shows the address selected when no copy path works", async () => {
        setClipboard(undefined);
        document.execCommand = vi.fn(() => false);
        render(<InstallCopyLink url="https://app.example/convite" />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });

        const field = screen.getByRole("textbox", { name: "Link da página" }) as HTMLInputElement;
        expect(field).toHaveValue("https://app.example/convite");
        expect(field).toHaveAttribute("readonly");
        expect(field).toHaveFocus();
        expect(field.selectionStart).toBe(0);
        expect(field.selectionEnd).toBe("https://app.example/convite".length);
        expect(screen.getByText("Toque e segure o link para copiar.")).toBeInTheDocument();
    });

    it("treats a throwing execCommand as a failed copy", async () => {
        setClipboard(undefined);
        document.execCommand = vi.fn(() => {
            throw new Error("unsupported");
        });
        render(<InstallCopyLink url="https://app.example/x" />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });

        expect(screen.getByRole("textbox")).toHaveValue("https://app.example/x");
    });

    it("takes translated labels", async () => {
        setClipboard(undefined);
        document.execCommand = vi.fn(() => false);
        render(
            <InstallCopyLink
                url="https://app.example/x"
                labels={{ copy: "Copy link", manual: "Long-press to copy.", field: "Page link" }}
            />,
        );

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
        });

        expect(screen.getByRole("textbox", { name: "Page link" })).toBeInTheDocument();
        expect(screen.getByText("Long-press to copy.")).toBeInTheDocument();
    });

    it("clears its reset timer on unmount", async () => {
        vi.useFakeTimers();
        setClipboard(vi.fn(async () => undefined));
        const { unmount } = render(<InstallCopyLink />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
        });
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Link copiado" }));
        });
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("renderHint written before open-in-browser existed", () => {
    const legacyRenderHint = ({ method }: { method: string }) =>
        method === "ios" ? <span>passos do iOS</span> : null;

    it("falls back to the default hint in InstallButton instead of revealing nothing", () => {
        setUserAgent(INSTAGRAM_IOS);
        render(<InstallButton renderHint={legacyRenderHint} />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText("Abrir no Safari")).toBeInTheDocument();
    });

    it("falls back to the default hint in InstallBanner too", () => {
        setUserAgent(INSTAGRAM_IOS);
        render(<InstallBanner renderHint={legacyRenderHint} />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText("Abrir no Safari")).toBeInTheDocument();
    });
});
