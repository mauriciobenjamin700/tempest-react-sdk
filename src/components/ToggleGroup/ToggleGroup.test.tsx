import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleGroup, ToggleGroupItem } from "./ToggleGroup";

describe("ToggleGroup", () => {
    it("renders a group with item buttons", () => {
        render(
            <ToggleGroup>
                <ToggleGroupItem value="a">A</ToggleGroupItem>
                <ToggleGroupItem value="b">B</ToggleGroupItem>
            </ToggleGroup>,
        );
        expect(screen.getByRole("group")).toBeInTheDocument();
        expect(screen.getAllByRole("button")).toHaveLength(2);
    });

    it("single mode switches selection", () => {
        const onValueChange = vi.fn();
        render(
            <ToggleGroup type="single" onValueChange={onValueChange}>
                <ToggleGroupItem value="a">A</ToggleGroupItem>
                <ToggleGroupItem value="b">B</ToggleGroupItem>
            </ToggleGroup>,
        );
        const [a, b] = screen.getAllByRole("button");
        fireEvent.click(a);
        expect(a).toHaveAttribute("aria-pressed", "true");
        expect(onValueChange).toHaveBeenLastCalledWith("a");

        fireEvent.click(b);
        expect(a).toHaveAttribute("aria-pressed", "false");
        expect(b).toHaveAttribute("aria-pressed", "true");
        expect(onValueChange).toHaveBeenLastCalledWith("b");
    });

    it("multiple mode adds and removes values", () => {
        const onValueChange = vi.fn();
        render(
            <ToggleGroup type="multiple" onValueChange={onValueChange}>
                <ToggleGroupItem value="a">A</ToggleGroupItem>
                <ToggleGroupItem value="b">B</ToggleGroupItem>
            </ToggleGroup>,
        );
        const [a, b] = screen.getAllByRole("button");
        fireEvent.click(a);
        expect(onValueChange).toHaveBeenLastCalledWith(["a"]);
        fireEvent.click(b);
        expect(onValueChange).toHaveBeenLastCalledWith(["a", "b"]);
        expect(a).toHaveAttribute("aria-pressed", "true");
        expect(b).toHaveAttribute("aria-pressed", "true");

        fireEvent.click(a);
        expect(onValueChange).toHaveBeenLastCalledWith(["b"]);
        expect(a).toHaveAttribute("aria-pressed", "false");
    });

    it("honors defaultValue", () => {
        render(
            <ToggleGroup type="multiple" defaultValue={["b"]}>
                <ToggleGroupItem value="a">A</ToggleGroupItem>
                <ToggleGroupItem value="b">B</ToggleGroupItem>
            </ToggleGroup>,
        );
        const [a, b] = screen.getAllByRole("button");
        expect(a).toHaveAttribute("aria-pressed", "false");
        expect(b).toHaveAttribute("aria-pressed", "true");
    });

    it("respects controlled value", () => {
        const onValueChange = vi.fn();
        render(
            <ToggleGroup type="single" value="a" onValueChange={onValueChange}>
                <ToggleGroupItem value="a">A</ToggleGroupItem>
                <ToggleGroupItem value="b">B</ToggleGroupItem>
            </ToggleGroup>,
        );
        const [a, b] = screen.getAllByRole("button");
        expect(a).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(b);
        expect(onValueChange).toHaveBeenCalledWith("b");
        // Stays controlled until the parent updates `value`.
        expect(a).toHaveAttribute("aria-pressed", "true");
    });

    it("throws when item is used outside a group", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => render(<ToggleGroupItem value="a">A</ToggleGroupItem>)).toThrow(/ToggleGroup/);
        spy.mockRestore();
    });
});
