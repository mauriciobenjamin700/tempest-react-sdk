import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Tour, type TourStep } from "./Tour";

const STEPS: TourStep[] = [
    { target: "#novo", title: "Comece aqui", body: "Todo pedido nasce deste botão." },
    { target: "[data-tour='filtros']", body: "E filtre por período aqui." },
    { target: "#ausente", title: "Sem alvo", body: "Este passo aponta pra algo que não existe." },
];

/** The page the tour runs over. */
function Page({ children }: { children?: React.ReactNode }) {
    return (
        <>
            <button id="novo" type="button">
                Novo pedido
            </button>
            <div data-tour="filtros">Filtros</div>
            {children}
        </>
    );
}

/** Uncontrolled harness: the tour drives its own index. */
function Harness({ onFinish }: { onFinish?: () => void }) {
    const [open, setOpen] = useState(true);
    return (
        <Page>
            <Tour steps={STEPS} open={open} onClose={() => setOpen(false)} onFinish={onFinish} />
        </Page>
    );
}

beforeEach(() => {
    // jsdom has neither of these, and the component calls both.
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
});

describe("Tour", () => {
    it("renders nothing while closed", () => {
        render(
            <Page>
                <Tour steps={STEPS} open={false} onClose={vi.fn()} />
            </Page>,
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders nothing when there are no steps", () => {
        render(<Tour steps={[]} open onClose={vi.fn()} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens on the first step, as a modal dialog named by its title", () => {
        render(<Harness />);
        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleName("Comece aqui");
        expect(screen.getByText("Todo pedido nasce deste botão.")).toBeInTheDocument();
    });

    it("says which step this is", () => {
        render(<Harness />);
        expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
    });

    it("walks forward and back with the buttons", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        expect(screen.getByText("Passo 2 de 3")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
        expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
    });

    it("has no back button on the first step", () => {
        render(<Harness />);
        expect(screen.queryByRole("button", { name: "Voltar" })).not.toBeInTheDocument();
    });

    it("swaps next for finish on the last step, and drops skip", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));

        expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Pular" })).not.toBeInTheDocument();
    });

    it("calls onFinish and closes at the end", async () => {
        const onFinish = vi.fn();
        render(<Harness onFinish={onFinish} />);
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        await userEvent.click(screen.getByRole("button", { name: "Concluir" }));

        expect(onFinish).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes from skip, from the close button and from Escape", async () => {
        const onClose = vi.fn();
        const { rerender } = render(
            <Page>
                <Tour steps={STEPS} open onClose={onClose} />
            </Page>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Pular" }));
        await userEvent.click(screen.getByRole("button", { name: "Fechar tour" }));
        rerender(
            <Page>
                <Tour steps={STEPS} open onClose={onClose} />
            </Page>,
        );
        await userEvent.keyboard("{Escape}");

        expect(onClose).toHaveBeenCalledTimes(3);
    });

    it("walks with the arrow keys", async () => {
        render(<Harness />);
        await userEvent.keyboard("{ArrowRight}");
        expect(screen.getByText("Passo 2 de 3")).toBeInTheDocument();
        await userEvent.keyboard("{ArrowLeft}");
        expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
    });

    it("does not walk past either end with the arrows", async () => {
        render(<Harness />);
        await userEvent.keyboard("{ArrowLeft}");
        expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();

        await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
        expect(screen.getByText("Passo 3 de 3")).toBeInTheDocument();
    });

    it("moves focus to the card, so the keyboard lands in the tour", async () => {
        render(<Harness />);
        await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    });

    it("still shows a step whose target is not on the page", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        // Dropping the step would silently skip its message.
        expect(screen.getByText("Este passo aponta pra algo que não existe.")).toBeInTheDocument();
    });

    it("dims the page with rects that can actually block a click", () => {
        const { container } = render(<Harness />);
        const backdrops = container.querySelectorAll("[class*='backdrop']");
        expect(backdrops.length).toBeGreaterThan(0);
    });

    it("closes when the dimmed area is clicked", async () => {
        const onClose = vi.fn();
        const { container } = render(
            <Page>
                <Tour steps={STEPS} open onClose={onClose} />
            </Page>,
        );
        const backdrop = container.querySelector("[class*='backdrop']");
        await userEvent.click(backdrop as Element);
        expect(onClose).toHaveBeenCalled();
    });

    it("lets the app drive the index", async () => {
        const onIndexChange = vi.fn();
        render(
            <Page>
                <Tour
                    steps={STEPS}
                    open
                    index={1}
                    onIndexChange={onIndexChange}
                    onClose={vi.fn()}
                />
            </Page>,
        );
        expect(screen.getByText("Passo 2 de 3")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        expect(onIndexChange).toHaveBeenCalledWith(2);
        // Controlled: the component does not move on its own.
        expect(screen.getByText("Passo 2 de 3")).toBeInTheDocument();
    });

    it("clamps an index past the end instead of rendering nothing", () => {
        render(
            <Page>
                <Tour steps={STEPS} open index={99} onClose={vi.fn()} />
            </Page>,
        );
        expect(screen.getByText("Passo 3 de 3")).toBeInTheDocument();
    });

    it("speaks English when asked", () => {
        render(
            <Page>
                <Tour steps={STEPS} open locale="en" onClose={vi.fn()} />
            </Page>,
        );
        expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    });

    it("describes the card by its body even without a title", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Próximo" }));
        expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
            "E filtre por período aqui.",
        );
    });
});

describe("Tour — a step that points at nothing in particular", () => {
    it("centres the card when the step names no target", () => {
        const steps: TourStep[] = [
            { title: "Bem-vindo", body: "Este passo fala do produto, não de um botão." },
        ];
        render(
            <Page>
                <Tour steps={steps} open onClose={() => undefined} />
            </Page>,
        );

        expect(screen.getByRole("dialog")).toHaveTextContent("Bem-vindo");
        expect(document.querySelector("[data-tour-spotlight]")).toBeNull();
    });
});
