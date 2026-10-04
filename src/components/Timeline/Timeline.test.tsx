import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";

const items = [
    { id: "1", title: "Created", meta: "10:24" },
    { id: "2", title: "Approved", description: "by admin", marker: "success" as const },
    { id: "3", title: "Shipped", meta: "11:00", marker: "warning" as const },
];

describe("Timeline", () => {
    it("renders all items", () => {
        render(<Timeline items={items} />);
        expect(screen.getByText("Created")).toBeInTheDocument();
        expect(screen.getByText("Approved")).toBeInTheDocument();
        expect(screen.getByText("Shipped")).toBeInTheDocument();
    });

    it("renders description and meta when provided", () => {
        render(<Timeline items={items} />);
        expect(screen.getByText("by admin")).toBeInTheDocument();
        expect(screen.getByText("10:24")).toBeInTheDocument();
    });

    it("renders as an <ol>", () => {
        const { container } = render(<Timeline items={items} />);
        expect(container.querySelector("ol")).not.toBeNull();
        expect(container.querySelectorAll("li")).toHaveLength(3);
    });

    it("draws a connector line between entries, none after the last", () => {
        const { container } = render(<Timeline items={items} />);
        expect(container.querySelectorAll(".line")).toHaveLength(2);
    });

    it("omits connector lines when connector=false", () => {
        const { container } = render(<Timeline items={items} connector={false} />);
        expect(container.querySelectorAll(".line")).toHaveLength(0);
    });

    it.each([
        ["primary", "markerPrimary"],
        ["success", "markerSuccess"],
        ["warning", "markerWarning"],
        ["danger", "markerDanger"],
        ["neutral", "markerNeutral"],
    ] as const)("paints marker=%s with the published %s class", (marker, className) => {
        const { container } = render(<Timeline items={[{ id: "1", title: "x", marker }]} />);
        expect(container.querySelector(".marker")).toHaveClass("marker", className);
    });

    it("paints the primary marker when no marker is given", () => {
        const { container } = render(<Timeline items={[{ id: "1", title: "x" }]} />);
        expect(container.querySelector(".marker")).toHaveClass("markerPrimary");
    });
});
