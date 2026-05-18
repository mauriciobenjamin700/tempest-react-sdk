import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
    it("renders children", () => {
        render(<Tag>São Paulo</Tag>);
        expect(screen.getByText("São Paulo")).toBeInTheDocument();
    });

    it("does not render remove button without onRemove", () => {
        render(<Tag>x</Tag>);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("renders remove button and fires onRemove on click", async () => {
        const onRemove = vi.fn();
        render(<Tag onRemove={onRemove}>x</Tag>);
        await userEvent.click(screen.getByLabelText("Remover"));
        expect(onRemove).toHaveBeenCalled();
    });

    it("applies variant and size classes", () => {
        const { container } = render(
            <Tag variant="primary" size="lg">
                x
            </Tag>,
        );
        const el = container.firstElementChild as HTMLElement;
        expect(el.className).toMatch(/primary/);
        expect(el.className).toMatch(/lg/);
    });
});
