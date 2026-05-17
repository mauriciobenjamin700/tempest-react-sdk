import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VirtualList } from "./VirtualList";

describe("VirtualList", () => {
    it("renders only a window of items", () => {
        const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
        render(
            <VirtualList
                items={items}
                itemHeight={20}
                height={100}
                getKey={(row) => row.id}
                renderItem={(row) => <span data-testid={`row-${row.id}`}>{row.id}</span>}
            />,
        );
        // viewport=100/20=5 + overscan ~ < 20 visible
        const rendered = screen.queryAllByTestId(/^row-/);
        expect(rendered.length).toBeLessThan(items.length);
    });
});
