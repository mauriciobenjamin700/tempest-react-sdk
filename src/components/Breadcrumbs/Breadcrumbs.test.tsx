import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs", () => {
    it("renders items and marks the last as current", () => {
        render(
            <Breadcrumbs
                items={[
                    { label: "Home", href: "/" },
                    { label: "Settings" },
                ]}
            />,
        );
        expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
        expect(screen.getByText("Settings")).toHaveAttribute("aria-current", "page");
    });
});
