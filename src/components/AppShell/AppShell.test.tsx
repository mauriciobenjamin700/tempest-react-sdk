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
