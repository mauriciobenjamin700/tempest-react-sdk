import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Lightbox } from "./Lightbox";
import type { LightboxItem } from "./Lightbox";

const items: LightboxItem[] = [
    { src: "/a.jpg", alt: "Fachada", caption: "Frente da loja" },
    { src: "/b.jpg", alt: "Interior" },
    { src: "/c.jpg", alt: "Estoque", thumbnail: "/c-thumb.jpg" },
];

describe("Lightbox", () => {
    it("renders nothing while closed", () => {
        render(<Lightbox items={items} open={false} onClose={vi.fn()} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders nothing with an empty gallery", () => {
        render(<Lightbox items={[]} open onClose={vi.fn()} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders the current image as a modal dialog", () => {
        render(<Lightbox items={items} open onClose={vi.fn()} />);

        expect(screen.getByRole("dialog", { name: "Fachada" })).toHaveAttribute(
            "aria-modal",
            "true",
        );
        expect(screen.getByRole("img", { name: "Fachada" })).toHaveAttribute("src", "/a.jpg");
    });

    it("shows the caption when the item has one", () => {
        render(<Lightbox items={items} open onClose={vi.fn()} />);
        expect(screen.getByText("Frente da loja")).toBeInTheDocument();
    });

    it("shows the counter and hides it on request", () => {
        const { unmount } = render(<Lightbox items={items} open onClose={vi.fn()} />);
        expect(screen.getByText("1 / 3")).toBeInTheDocument();
        unmount();

        render(<Lightbox items={items} open showCounter={false} onClose={vi.fn()} />);
        expect(screen.queryByText("1 / 3")).not.toBeInTheDocument();
    });

    it("advances and goes back through the nav buttons", async () => {
        render(<Lightbox items={items} open onClose={vi.fn()} />);

        await userEvent.click(screen.getByRole("button", { name: "Next image" }));
        expect(screen.getByRole("img", { name: "Interior" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Previous image" }));
        expect(screen.getByRole("img", { name: "Fachada" })).toBeInTheDocument();
    });

    it("wraps around by default", async () => {
        render(<Lightbox items={items} open onClose={vi.fn()} />);

        await userEvent.click(screen.getByRole("button", { name: "Previous image" }));

        expect(screen.getByRole("img", { name: "Estoque" })).toBeInTheDocument();
    });

    it("stops at the ends when loop is off", async () => {
        render(<Lightbox items={items} open loop={false} onClose={vi.fn()} />);

        expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();

        await userEvent.click(screen.getByRole("button", { name: "Next image" }));
        await userEvent.click(screen.getByRole("button", { name: "Next image" }));

        expect(screen.getByRole("img", { name: "Estoque" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
    });

    it("closes from the close button", async () => {
        const onClose = vi.fn();
        render(<Lightbox items={items} open onClose={onClose} />);

        await userEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    describe("keyboard", () => {
        it("closes on Escape", async () => {
            const onClose = vi.fn();
            render(<Lightbox items={items} open onClose={onClose} />);

            await userEvent.keyboard("{Escape}");

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it("walks the gallery with the arrow keys", async () => {
            render(<Lightbox items={items} open onClose={vi.fn()} />);

            await userEvent.keyboard("{ArrowRight}");
            expect(screen.getByRole("img", { name: "Interior" })).toBeInTheDocument();

            await userEvent.keyboard("{ArrowLeft}");
            expect(screen.getByRole("img", { name: "Fachada" })).toBeInTheDocument();
        });

        it("jumps to the ends with Home and End", async () => {
            render(<Lightbox items={items} open onClose={vi.fn()} />);

            await userEvent.keyboard("{End}");
            expect(screen.getByRole("img", { name: "Estoque" })).toBeInTheDocument();

            await userEvent.keyboard("{Home}");
            expect(screen.getByRole("img", { name: "Fachada" })).toBeInTheDocument();
        });

        it("ignores unrelated keys", async () => {
            const onClose = vi.fn();
            render(<Lightbox items={items} open onClose={onClose} />);

            await userEvent.keyboard("k");

            expect(onClose).not.toHaveBeenCalled();
            expect(screen.getByRole("img", { name: "Fachada" })).toBeInTheDocument();
        });

        it("stops listening once closed", async () => {
            const onClose = vi.fn();
            const { rerender } = render(<Lightbox items={items} open onClose={onClose} />);

            rerender(<Lightbox items={items} open={false} onClose={onClose} />);
            await userEvent.keyboard("{Escape}");

            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe("thumbnails", () => {
        it("renders one per item, marking the current one", () => {
            render(<Lightbox items={items} open onClose={vi.fn()} />);

            const tabs = screen.getAllByRole("tab");
            expect(tabs).toHaveLength(3);
            expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        });

        it("uses the thumbnail url when provided", () => {
            render(<Lightbox items={items} open onClose={vi.fn()} />);

            const images = screen.getAllByRole("tab").map((tab) => tab.querySelector("img"));
            expect(images[2]).toHaveAttribute("src", "/c-thumb.jpg");
            expect(images[0]).toHaveAttribute("src", "/a.jpg");
        });

        it("jumps to the clicked thumbnail", async () => {
            render(<Lightbox items={items} open onClose={vi.fn()} />);

            await userEvent.click(screen.getAllByRole("tab")[2]);

            expect(screen.getByRole("img", { name: "Estoque" })).toBeInTheDocument();
        });

        it("can be hidden", () => {
            render(<Lightbox items={items} open showThumbnails={false} onClose={vi.fn()} />);
            expect(screen.queryByRole("tab")).not.toBeInTheDocument();
        });

        it("is absent for a single image, along with the nav", () => {
            render(<Lightbox items={[items[0]]} open onClose={vi.fn()} />);

            expect(screen.queryByRole("tab")).not.toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "Next image" })).not.toBeInTheDocument();
            expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
        });
    });

    describe("controlled index", () => {
        it("reports moves without changing on its own", async () => {
            const onIndexChange = vi.fn();
            render(
                <Lightbox
                    items={items}
                    open
                    index={1}
                    onIndexChange={onIndexChange}
                    onClose={vi.fn()}
                />,
            );

            expect(screen.getByRole("img", { name: "Interior" })).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Next image" }));

            expect(onIndexChange).toHaveBeenCalledWith(2);
            expect(screen.getByRole("img", { name: "Interior" })).toBeInTheDocument();
        });

        it("follows an uncontrolled index prop change", () => {
            const { rerender } = render(
                <Lightbox items={items} open index={0} onClose={vi.fn()} />,
            );

            rerender(<Lightbox items={items} open index={2} onClose={vi.fn()} />);

            expect(screen.getByRole("img", { name: "Estoque" })).toBeInTheDocument();
        });

        it("clamps an out-of-range index", () => {
            render(<Lightbox items={items} open index={99} onClose={vi.fn()} />);
            expect(screen.getByRole("img", { name: "Estoque" })).toBeInTheDocument();
        });
    });

    it("locks the page scroll while open", () => {
        const { unmount } = render(<Lightbox items={items} open onClose={vi.fn()} />);
        expect(document.body.style.overflow).toBe("hidden");
        unmount();
        expect(document.body.style.overflow).not.toBe("hidden");
    });

    it("accepts an extra className", () => {
        render(<Lightbox items={items} open className="mine" onClose={vi.fn()} />);
        expect(screen.getByRole("dialog")).toHaveClass("mine");
    });
});
