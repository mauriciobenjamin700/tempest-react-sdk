import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./Banner";

describe("Banner", () => {
    it("renders title and description", () => {
        render(<Banner title="Heads up">desc</Banner>);
        expect(screen.getByText("Heads up")).toBeInTheDocument();
        expect(screen.getByText("desc")).toBeInTheDocument();
    });

    it("dismiss button removes the banner and fires callback", async () => {
        const onDismiss = vi.fn();
        render(
            <Banner dismissible onDismiss={onDismiss}>
                x
            </Banner>,
        );
        await userEvent.click(screen.getByLabelText("Fechar"));
        expect(onDismiss).toHaveBeenCalled();
        expect(screen.queryByText("x")).not.toBeInTheDocument();
    });

    it("applies the variant class", () => {
        const { container } = render(<Banner variant="danger">x</Banner>);
        expect((container.firstElementChild as HTMLElement).className).toMatch(/danger/);
    });
});
