import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Page } from "./Page";

describe("Page", () => {
    it("renders title and description", () => {
        render(
            <Page title="Pedidos" description="desc">
                content
            </Page>,
        );
        expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument();
        expect(screen.getByText("desc")).toBeInTheDocument();
    });

    it("renders header slots", () => {
        render(
            <Page eyebrow="Section" title="Hello" actions={<button>act</button>}>
                content
            </Page>,
        );
        expect(screen.getByText("Section")).toBeInTheDocument();
        expect(screen.getByText("act")).toBeInTheDocument();
    });

    it("renders toolbar and footer", () => {
        render(
            <Page title="x" toolbar={<div>TB</div>} footer={<div>FT</div>}>
                content
            </Page>,
        );
        expect(screen.getByText("TB")).toBeInTheDocument();
        expect(screen.getByText("FT")).toBeInTheDocument();
    });

    it("omits header when no header content", () => {
        const { container } = render(<Page>content</Page>);
        expect(container.querySelector("header")).toBeNull();
    });
});
