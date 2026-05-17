import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs — full", () => {
    it("uses onClick handler when no href is provided", async () => {
        const onClick = vi.fn();
        render(
            <Breadcrumbs
                items={[
                    { label: "Home", onClick },
                    { label: "Current" },
                ]}
            />,
        );
        await userEvent.click(screen.getByText("Home"));
        expect(onClick).toHaveBeenCalled();
    });

    it("supports custom separator", () => {
        render(
            <Breadcrumbs
                separator=">"
                items={[{ label: "A", href: "/" }, { label: "B" }]}
            />,
        );
        expect(screen.getByText(">")).toBeInTheDocument();
    });

    it("renders middle items as plain text when not interactive", () => {
        render(
            <Breadcrumbs
                items={[
                    { label: "Root", href: "/" },
                    { label: "Middle" },
                    { label: "Leaf" },
                ]}
            />,
        );
        expect(screen.queryByRole("link", { name: "Middle" })).toBeNull();
        expect(screen.getByText("Middle")).toBeInTheDocument();
    });
});
