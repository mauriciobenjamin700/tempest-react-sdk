import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
    it("renders text", () => {
        render(<Badge>Active</Badge>);
        expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("applies variant class", () => {
        const { container } = render(<Badge variant="danger">x</Badge>);
        const span = container.querySelector("span");
        expect(span?.className).toContain("danger");
    });
});
