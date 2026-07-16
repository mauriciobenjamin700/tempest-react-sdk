import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineIndicator } from "./OfflineIndicator";

function setOnline(value: boolean): void {
    Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

afterEach(() => {
    setOnline(true);
    vi.useRealTimers();
});

describe("OfflineIndicator", () => {
    it("renders nothing while online", () => {
        setOnline(true);
        const { container } = render(<OfflineIndicator />);
        expect(container).toBeEmptyDOMElement();
    });

    it("shows the offline message when offline", () => {
        setOnline(false);
        render(<OfflineIndicator offlineLabel="Sem conexão" />);
        expect(screen.getByText("Sem conexão")).toBeInTheDocument();
    });

    it("flashes the online message when connectivity returns", () => {
        vi.useFakeTimers();
        setOnline(false);
        render(<OfflineIndicator onlineLabel="De volta" offlineLabel="Fora" />);
        act(() => {
            setOnline(true);
            window.dispatchEvent(new Event("online"));
        });
        expect(screen.getByText("De volta")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(3100);
        });
        expect(screen.queryByText("De volta")).not.toBeInTheDocument();
    });

    it("renders custom children over the default body", () => {
        setOnline(false);
        render(
            <OfflineIndicator>
                <span>custom</span>
            </OfflineIndicator>,
        );
        expect(screen.getByText("custom")).toBeInTheDocument();
    });
});
