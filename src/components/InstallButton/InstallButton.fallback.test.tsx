import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InstallBanner } from "@/components/InstallBanner";
import { InstallButton } from "./InstallButton";

/**
 * The platforms where the two components used to render nothing.
 *
 * Both were built on `useBeforeInstallPrompt`, so they returned `null` in every
 * browser that never fires the event — iOS Safari, and the Android Chromium
 * forks (Mi Browser, UC, Opera Mini, Huawei) that strip the API. That is
 * precisely where a user cannot find the install entry without being told where
 * it is, so every app kept a local copy of these components to add the two
 * paths back.
 */

const ORIGINAL_UA = navigator.userAgent;

function setUserAgent(ua: string, maxTouchPoints = 0): void {
    Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
    Object.defineProperty(navigator, "maxTouchPoints", {
        value: maxTouchPoints,
        configurable: true,
    });
}

afterEach(() => {
    setUserAgent(ORIGINAL_UA);
    window.localStorage.clear();
});

describe("InstallButton — browsers with no install prompt", () => {
    it("renders on iOS instead of disappearing, and reveals the Share instruction", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
        render(<InstallButton />);

        const button = screen.getByRole("button", { name: "Como instalar" });
        expect(button).toHaveAttribute("aria-expanded", "false");

        expect(button).not.toHaveAttribute("aria-controls");

        fireEvent.click(button);

        expect(button).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
        expect(
            document.getElementById(button.getAttribute("aria-controls") ?? ""),
        ).toHaveTextContent(/Adicionar à Tela de Início/);
    });

    it("renders on an Android fork and offers the Chrome intent", () => {
        setUserAgent("Mozilla/5.0 (Linux; Android 13; MiuiBrowser/1.0)");
        render(<InstallButton />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText(/Instalar app/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "abra no Chrome" })).toHaveAttribute(
            "href",
            expect.stringContaining("intent://"),
        );
    });

    it("takes the copy the app wants instead", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
        render(<InstallButton renderHint={({ method }) => <span>método: {method}</span>} />);

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText("método: ios")).toBeInTheDocument();
    });

    it("still renders nothing once the app is installed", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
        const matchMedia = window.matchMedia;
        window.matchMedia = ((query: string) =>
            ({
                matches: query.includes("standalone"),
                media: query,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }) as unknown as MediaQueryList) as typeof window.matchMedia;

        const { container } = render(<InstallButton />);

        expect(container).toBeEmptyDOMElement();
        window.matchMedia = matchMedia;
    });
});

describe("InstallBanner — browsers with no install prompt", () => {
    it("shows the iOS instruction in place of the install button", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
        render(<InstallBanner title="Instale o app" />);

        expect(screen.getByText("Instale o app")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));

        expect(screen.getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
    });

    it("keeps a permanent dismissal permanent when no cooldown is configured", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
        const { unmount } = render(<InstallBanner title="Instale" storageKey="t:install" />);

        fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
        expect(window.localStorage.getItem("t:install")).toBe("1");
        unmount();

        render(<InstallBanner title="Instale" storageKey="t:install" />);
        expect(screen.queryByText("Instale")).not.toBeInTheDocument();
    });

    it("stores a timestamp with a cooldown, and comes back once it passes", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
        const { unmount } = render(
            <InstallBanner title="Instale" storageKey="t:install" declineCooldownMs={60_000} />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
        const stored = window.localStorage.getItem("t:install");
        expect(Number(stored)).toBeGreaterThan(0);
        unmount();

        window.localStorage.setItem("t:install", String(Date.now() - 120_000));
        render(<InstallBanner title="Instale" storageKey="t:install" declineCooldownMs={60_000} />);
        expect(screen.getByText("Instale")).toBeInTheDocument();
    });

    /**
     * A `"1"` was written under the old contract, where dismissal was forever.
     * Turning a cooldown on must not revive a banner the user switched off.
     */
    it("honours a legacy permanent dismissal even with a cooldown configured", () => {
        setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari");
        window.localStorage.setItem("t:install", "1");

        render(<InstallBanner title="Instale" storageKey="t:install" declineCooldownMs={60_000} />);

        expect(screen.queryByText("Instale")).not.toBeInTheDocument();
    });
});
