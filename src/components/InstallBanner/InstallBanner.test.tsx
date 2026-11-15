import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallBanner } from "./InstallBanner";

function fireBeforeInstallPrompt(outcome: "accepted" | "dismissed" = "dismissed"): void {
    const event = Object.assign(new Event("beforeinstallprompt"), {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome, platform: "web" }),
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

    it("closes on accept and stays closed after the manual fallback window", async () => {
        vi.useFakeTimers();
        const onResult = vi.fn();
        render(<InstallBanner title="Instale" onResult={onResult} />);
        act(() => fireBeforeInstallPrompt("accepted"));

        fireEvent.click(screen.getByRole("button", { name: "Instalar" }));
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(onResult).toHaveBeenCalledWith("accepted");
        expect(screen.queryByText("Instale")).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(3500);
        });
        expect(screen.queryByText("Instale")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Como instalar" })).not.toBeInTheDocument();
        vi.useRealTimers();
    });

    it("hides with visible={false} without forgetting a session dismissal", () => {
        const { rerender } = render(<InstallBanner title="Instale" />);
        act(() => fireBeforeInstallPrompt());
        expect(screen.getByText("Instale")).toBeInTheDocument();

        rerender(<InstallBanner title="Instale" visible={false} />);
        expect(screen.queryByText("Instale")).not.toBeInTheDocument();

        rerender(<InstallBanner title="Instale" />);
        fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
        rerender(<InstallBanner title="Instale" visible={false} />);
        rerender(<InstallBanner title="Instale" />);
        expect(screen.queryByText("Instale")).not.toBeInTheDocument();
    });

    it("is a region landmark, not a dialog", () => {
        render(<InstallBanner title="Instale o app" />);
        act(() => fireBeforeInstallPrompt());
        expect(screen.getByRole("region", { name: "Instale o app" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it('pins itself with position="bottom" and stays in flow by default', () => {
        const { rerender } = render(<InstallBanner title="Instale" />);
        act(() => fireBeforeInstallPrompt());
        const region = screen.getByRole("region");
        const inlineClass = region.className;

        rerender(<InstallBanner title="Instale" position="bottom" />);
        expect(screen.getByRole("region").className).not.toBe(inlineClass);
        expect(screen.getByRole("region").className).toMatch(/bottom/);
    });

    it("renders the guide after the instruction when the hint opens", async () => {
        vi.resetModules();
        const { InstallBanner: FreshBanner } = await import("./InstallBanner");
        vi.useFakeTimers();
        render(<FreshBanner title="Instale" guide={<a href="/instalar">Ver guia completo</a>} />);
        act(() => {
            vi.advanceTimersByTime(3500);
        });
        expect(screen.queryByText("Ver guia completo")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));
        expect(screen.getByRole("link", { name: "Ver guia completo" })).toHaveAttribute(
            "href",
            "/instalar",
        );
        vi.useRealTimers();
    });
});
