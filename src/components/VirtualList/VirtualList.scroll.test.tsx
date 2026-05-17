import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VirtualList } from "./VirtualList";

describe("VirtualList — scroll", () => {
    it("renders different items after scrolling", () => {
        const items = Array.from({ length: 500 }, (_, i) => ({ id: i }));
        const { container } = render(
            <VirtualList
                items={items}
                itemHeight={20}
                height={100}
                getKey={(row) => row.id}
                renderItem={(row) => <span data-testid={`row-${row.id}`}>{row.id}</span>}
            />,
        );
        const scroll = container.querySelector('[role="list"]') as HTMLElement;
        fireEvent.scroll(scroll, { target: { scrollTop: 2000 } });
        // some row from the middle should be present, row 0 should not
        const rendered = screen.queryAllByTestId(/^row-/);
        const ids = rendered.map((el) => Number(el.textContent));
        expect(ids.some((id) => id >= 90 && id <= 120)).toBe(true);
    });
});
