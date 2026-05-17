import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Accordion } from "./Accordion";

const items = [
    { id: "a", title: "A", children: <p>panel-a</p> },
    { id: "b", title: "B", children: <p>panel-b</p> },
];

describe("Accordion", () => {
    it("renders triggers", () => {
        render(<Accordion items={items} />);
        expect(screen.getByText("A")).toBeInTheDocument();
        expect(screen.getByText("B")).toBeInTheDocument();
    });

    it("opens panel on click (single mode)", async () => {
        render(<Accordion items={items} />);
        await userEvent.click(screen.getByRole("button", { name: /^A/ }));
        expect(screen.getByText("panel-a")).toBeInTheDocument();
        expect(screen.queryByText("panel-b")).not.toBeInTheDocument();
    });

    it("only one panel open in single mode", async () => {
        render(<Accordion items={items} />);
        await userEvent.click(screen.getByRole("button", { name: /^A/ }));
        await userEvent.click(screen.getByRole("button", { name: /^B/ }));
        expect(screen.queryByText("panel-a")).not.toBeInTheDocument();
        expect(screen.getByText("panel-b")).toBeInTheDocument();
    });

    it("multiple mode allows multiple panels", async () => {
        render(<Accordion items={items} multiple />);
        await userEvent.click(screen.getByRole("button", { name: /^A/ }));
        await userEvent.click(screen.getByRole("button", { name: /^B/ }));
        expect(screen.getByText("panel-a")).toBeInTheDocument();
        expect(screen.getByText("panel-b")).toBeInTheDocument();
    });

    it("controlled via value + onChange", async () => {
        const onChange = vi.fn();
        const { rerender } = render(<Accordion items={items} value={["a"]} onChange={onChange} />);
        expect(screen.getByText("panel-a")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /^A/ }));
        expect(onChange).toHaveBeenCalledWith([]);
        rerender(<Accordion items={items} value={[]} onChange={onChange} />);
        expect(screen.queryByText("panel-a")).not.toBeInTheDocument();
    });

    it("disabled item does not toggle", async () => {
        render(<Accordion items={[{ id: "x", title: "X", children: <p>p</p>, disabled: true }]} />);
        const btn = screen.getByRole("button", { name: /^X/ });
        expect(btn).toBeDisabled();
    });
});
