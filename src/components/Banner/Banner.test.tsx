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

describe("Banner — icon and action slots", () => {
    it("renders both slots when given", () => {
        render(
            <Banner
                icon={<span data-testid="banner-icon">*</span>}
                action={<button type="button">Agir</button>}
            >
                aviso
            </Banner>,
        );
        expect(screen.getByTestId("banner-icon")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Agir" })).toBeInTheDocument();
    });
});
