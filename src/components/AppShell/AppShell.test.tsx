import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
    it("renders navbar, content and footer", () => {
        render(
            <AppShell navbar={<div>NAV</div>} footer={<div>FT</div>}>
                <div>BODY</div>
            </AppShell>,
        );
        expect(screen.getByText("NAV")).toBeInTheDocument();
        expect(screen.getByText("BODY")).toBeInTheDocument();
        expect(screen.getByText("FT")).toBeInTheDocument();
    });

    it("renders main as a <main> landmark", () => {
        const { container } = render(<AppShell>x</AppShell>);
        expect(container.querySelector("main")).not.toBeNull();
    });

    it("renders without errors when only children are passed", () => {
        render(<AppShell>only content</AppShell>);
        expect(screen.getByText("only content")).toBeInTheDocument();
    });
});

describe("AppShell — sidebar vs bottom nav by breakpoint", () => {
    /**
     * `useBreakpoint` reads `window.innerWidth`; jsdom lets us set it, so each
     * case resizes instead of mocking the hook.
     *
     * @param width - Viewport width to report.
     */
    function setViewport(width: number): void {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
        window.dispatchEvent(new Event("resize"));
    }

    it("shows the sidebar and hides the bottom nav on a wide viewport", () => {
        setViewport(1280);
        render(
            <AppShell sidebar={<nav>lateral</nav>} bottomNav={<nav>inferior</nav>}>
                conteúdo
            </AppShell>,
        );
        expect(screen.getByText("lateral")).toBeInTheDocument();
        expect(screen.queryByText("inferior")).not.toBeInTheDocument();
    });

    it("swaps to the bottom nav on a narrow viewport", () => {
        setViewport(380);
        render(
            <AppShell sidebar={<nav>lateral</nav>} bottomNav={<nav>inferior</nav>}>
                conteúdo
            </AppShell>,
        );
        expect(screen.queryByText("lateral")).not.toBeInTheDocument();
        expect(screen.getByText("inferior")).toBeInTheDocument();
    });

    it("honours a custom sidebarBreakpoint", () => {
        setViewport(800);
        render(
            <AppShell
                sidebar={<nav>lateral</nav>}
                bottomNav={<nav>inferior</nav>}
                sidebarBreakpoint="xl"
            >
                conteúdo
            </AppShell>,
        );
        expect(screen.queryByText("lateral")).not.toBeInTheDocument();
        expect(screen.getByText("inferior")).toBeInTheDocument();
    });
});
