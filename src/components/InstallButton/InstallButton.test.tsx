import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstallButton } from "./InstallButton";

function fireBeforeInstallPrompt(): void {
    const event = Object.assign(new Event("beforeinstallprompt"), {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
        platforms: [],
        preventDefault: () => undefined,
    });
    window.dispatchEvent(event as unknown as Event);
}

describe("InstallButton", () => {
    it("renders nothing until the browser offers an install prompt", () => {
        const { container } = render(<InstallButton />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders the button after beforeinstallprompt fires", () => {
        render(<InstallButton label="Instalar app" />);
        act(() => fireBeforeInstallPrompt());
        expect(screen.getByRole("button", { name: "Instalar app" })).toBeInTheDocument();
    });
});
