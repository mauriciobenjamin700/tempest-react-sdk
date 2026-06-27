import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataList } from "./DataList";

describe("DataList", () => {
    it("renders one li per item", () => {
        const items = ["a", "b", "c"];
        const { container } = render(
            <DataList items={items} renderItem={(item) => <span>{item}</span>} />,
        );
        const lis = container.querySelectorAll("li");
        expect(lis).toHaveLength(3);
        expect(screen.getByText("a")).toBeInTheDocument();
        expect(screen.getByText("c")).toBeInTheDocument();
    });

    it("uses keyExtractor when provided", () => {
        const items = [{ id: 10, label: "x" }];
        const { container } = render(
            <DataList
                items={items}
                keyExtractor={(item) => item.id}
                renderItem={(item) => <span>{item.label}</span>}
            />,
        );
        expect(container.querySelectorAll("li")).toHaveLength(1);
    });

    it("renders the empty node when there are no items", () => {
        render(
            <DataList
                items={[]}
                renderItem={(item: string) => <span>{item}</span>}
                empty={<p>Nothing here</p>}
            />,
        );
        expect(screen.getByText("Nothing here")).toBeInTheDocument();
    });

    it("renders nothing when empty and no empty node given", () => {
        const { container } = render(
            <DataList items={[]} renderItem={(item: string) => <span>{item}</span>} />,
        );
        expect(container.querySelector("ul")).toBeNull();
    });
});
