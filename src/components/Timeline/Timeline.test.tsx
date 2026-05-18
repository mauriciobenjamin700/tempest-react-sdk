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

    it("omits connector lines when connector=false", () => {
        const { container } = render(<Timeline items={items} connector={false} />);
        expect((container.firstElementChild as HTMLElement).className).not.toMatch(/connector/);
    });
});
