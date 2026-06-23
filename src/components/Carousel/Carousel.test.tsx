import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Carousel } from "./Carousel";

const slides = [<div key="1">Slide 1</div>, <div key="2">Slide 2</div>, <div key="3">Slide 3</div>];

function track(container: HTMLElement): HTMLElement {
    return container.querySelector("[style*='translateX']") as HTMLElement;
}

describe("Carousel", () => {
    it("renders all slides inside a carousel region", () => {
        render(<Carousel>{slides}</Carousel>);
        expect(screen.getByRole("region")).toHaveAttribute("aria-roledescription", "carousel");
        expect(screen.getByText("Slide 1")).toBeInTheDocument();
        expect(screen.getByText("Slide 3")).toBeInTheDocument();
    });

    it("next advances the index and translateX", async () => {
        const onIndexChange = vi.fn();
        const { container } = render(<Carousel onIndexChange={onIndexChange}>{slides}</Carousel>);
        expect(track(container).style.transform).toBe("translateX(-0%)");
        await userEvent.click(screen.getByLabelText("Next slide"));
        expect(onIndexChange).toHaveBeenCalledWith(1);
        expect(track(container).style.transform).toBe("translateX(-100%)");
    });

    it("prev goes back", async () => {
        const { container } = render(<Carousel defaultIndex={2}>{slides}</Carousel>);
        expect(track(container).style.transform).toBe("translateX(-200%)");
        await userEvent.click(screen.getByLabelText("Previous slide"));
        expect(track(container).style.transform).toBe("translateX(-100%)");
    });

    it("disables prev at start and next at end without loop", () => {
        render(<Carousel>{slides}</Carousel>);
        expect(screen.getByLabelText("Previous slide")).toBeDisabled();
        expect(screen.getByLabelText("Next slide")).not.toBeDisabled();
    });

    it("loops past the last slide", async () => {
        const onIndexChange = vi.fn();
        const { container } = render(
            <Carousel loop defaultIndex={2} onIndexChange={onIndexChange}>
                {slides}
            </Carousel>,
        );
        await userEvent.click(screen.getByLabelText("Next slide"));
        expect(onIndexChange).toHaveBeenCalledWith(0);
        expect(track(container).style.transform).toBe("translateX(-0%)");
    });

    it("dots jump to the chosen slide", async () => {
        const { container } = render(<Carousel>{slides}</Carousel>);
        await userEvent.click(screen.getByLabelText("Go to slide 3"));
        expect(track(container).style.transform).toBe("translateX(-200%)");
    });

    it("arrow keys navigate the focused region", async () => {
        const { container } = render(<Carousel>{slides}</Carousel>);
        screen.getByRole("region").focus();
        await userEvent.keyboard("{ArrowRight}");
        expect(track(container).style.transform).toBe("translateX(-100%)");
        await userEvent.keyboard("{ArrowLeft}");
        expect(track(container).style.transform).toBe("translateX(-0%)");
    });
});
