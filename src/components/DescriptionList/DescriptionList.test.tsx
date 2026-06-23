import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DescriptionList } from "./DescriptionList";

describe("DescriptionList", () => {
    it("renders a dt/dd pair per item", () => {
        const { container } = render(
            <DescriptionList
                items={[
                    { term: "Name", description: "Ada" },
                    { term: "Role", description: "Engineer" },
                ]}
            />,
        );
        expect(container.querySelectorAll("dt")).toHaveLength(2);
        expect(container.querySelectorAll("dd")).toHaveLength(2);
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Ada")).toBeInTheDocument();
        expect(screen.getByText("Role")).toBeInTheDocument();
        expect(screen.getByText("Engineer")).toBeInTheDocument();
    });

    it("renders a dl element", () => {
        const { container } = render(<DescriptionList items={[{ term: "k", description: "v" }]} />);
        expect(container.querySelector("dl")).toBeTruthy();
    });

    it("renders an empty dl when items is empty", () => {
        const { container } = render(<DescriptionList items={[]} />);
        expect(container.querySelector("dl")?.children).toHaveLength(0);
    });
});
