import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VirtualList } from "./VirtualList";

describe("VirtualList — overscan + custom key", () => {
    it("falls back to index when getKey is absent", () => {
        const items = Array.from({ length: 10 }, (_, i) => ({ value: `v${i}` }));
        render(
            <VirtualList
                items={items}
                itemHeight={20}
                height={200}
                renderItem={(row) => <span>{row.value}</span>}
            />,
        );
        expect(screen.getByText("v0")).toBeInTheDocument();
    });

    it("accepts string height", () => {
        const items = Array.from({ length: 4 }, (_, i) => ({ id: i }));
        const { container } = render(
            <VirtualList
                items={items}
                itemHeight={20}
                height="120px"
                getKey={(row) => row.id}
                renderItem={(row) => <span>{row.id}</span>}
            />,
        );
        const scroll = container.querySelector('[role="list"]') as HTMLElement;
        expect(scroll.style.height).toBe("120px");
    });
});
