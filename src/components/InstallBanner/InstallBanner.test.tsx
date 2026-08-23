import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallBanner } from "./InstallBanner";

function fireBeforeInstallPrompt(): void {
    const event = Object.assign(new Event("beforeinstallprompt"), {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: "dismissed" as const, platform: "web" }),
        platforms: [],
        preventDefault: () => undefined,
    });
    window.dispatchEvent(event as unknown as Event);
}

afterEach(() => {
    window.localStorage.clear();
});

describe("InstallBanner", () => {
    it("stays hidden until an install prompt is available", () => {
        const { container } = render(<InstallBanner title="Instale" />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows title + description once installable", () => {
        render(<InstallBanner title="Instale o app" description="Offline e atalho." />);
        act(() => fireBeforeInstallPrompt());
        expect(screen.getByText("Instale o app")).toBeInTheDocument();
        expect(screen.getByText("Offline e atalho.")).toBeInTheDocument();
    });

    it("dismiss hides the banner and persists when storageKey is set", () => {
        render(<InstallBanner title="Instale" storageKey="t:install" />);
        act(() => fireBeforeInstallPrompt());
        fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
        expect(screen.queryByText("Instale")).not.toBeInTheDocument();
        expect(window.localStorage.getItem("t:install")).toBe("1");
    });

    it("reports the user's answer to the install prompt", async () => {
        const onResult = vi.fn();
        render(<InstallBanner title="Instale" onResult={onResult} />);
        act(() => fireBeforeInstallPrompt());

        fireEvent.click(screen.getByRole("button", { name: "Instalar" }));

        await waitFor(() => expect(onResult).toHaveBeenCalledWith("dismissed"));
    });

    it("shows the banner when storage cannot be read at all", () => {
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage bloqueado");
        });

        render(<InstallBanner title="Instale" storageKey="t:install" />);
        act(() => fireBeforeInstallPrompt());

        expect(screen.getByText("Instale")).toBeInTheDocument();
        getItem.mockRestore();
    });
});
