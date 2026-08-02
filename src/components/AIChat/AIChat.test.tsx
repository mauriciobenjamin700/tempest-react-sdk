import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChat } from "./AIChat";
import type { AIChatMessage } from "./ai-chat-turns";

const THREAD: AIChatMessage[] = [
    { id: "s", role: "system", content: "Você responde em português." },
    { id: "u1", role: "user", content: "Quantos pedidos atrasaram?" },
    { id: "a1", role: "assistant", content: "**12 pedidos** atrasaram esta semana." },
];

/**
 * Give the scroll container real geometry.
 *
 * jsdom does not lay out, so `scrollHeight` and `clientHeight` are both 0 and the
 * "is the reader at the bottom" check would always answer yes — which is exactly the
 * branch the jump-to-latest button depends on.
 */
function fakeScroll(node: HTMLElement, { scrollHeight = 1000, scrollTop = 0 } = {}): void {
    Object.defineProperty(node, "scrollHeight", { configurable: true, value: scrollHeight });
    Object.defineProperty(node, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(node, "scrollTop", {
        configurable: true,
        writable: true,
        value: scrollTop,
    });
}

describe("AIChat", () => {
    beforeEach(() => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    it("renders the transcript and hides the system turn", () => {
        render(<AIChat messages={THREAD} />);

        expect(screen.getByText("Quantos pedidos atrasaram?")).toBeInTheDocument();
        expect(screen.getByText("12 pedidos").tagName).toBe("STRONG");
        expect(screen.queryByText("Você responde em português.")).not.toBeInTheDocument();
    });

    it("shows the system turn when asked", () => {
        render(<AIChat messages={THREAD} showSystem />);

        expect(screen.getByText("Você responde em português.")).toBeInTheDocument();
    });

    it("names the transcript as a log, reachable by keyboard", () => {
        render(<AIChat messages={THREAD} />);

        const log = screen.getByRole("log", { name: "Conversa" });
        expect(log).toHaveAttribute("tabindex", "0");
    });

    it("keeps the transcript out of a live region, and announces the two edges instead", async () => {
        const { rerender } = render(<AIChat messages={THREAD} pending />);

        const log = screen.getByRole("log");
        expect(log).not.toHaveAttribute("aria-live");
        expect(screen.getByRole("status")).toHaveTextContent("Gerando resposta");

        rerender(<AIChat messages={THREAD} />);
        await waitFor(() =>
            expect(screen.getByRole("status")).toHaveTextContent("Resposta concluída"),
        );
    });

    it("says nothing before the first generation", () => {
        render(<AIChat messages={THREAD} />);
        expect(screen.getByRole("status")).toHaveTextContent("");
    });

    it("shows the thinking indicator while the request is out with nothing back", () => {
        render(<AIChat messages={THREAD} pending />);

        expect(screen.getByText("Pensando…")).toBeInTheDocument();
    });

    it("drops the thinking indicator once tokens are arriving", () => {
        render(
            <AIChat
                messages={[{ id: "a", role: "assistant", content: "meia", streaming: true }]}
                pending
            />,
        );

        expect(screen.queryByText("Pensando…")).not.toBeInTheDocument();
    });

    it("renders the composer only when there is somewhere to send", () => {
        const { rerender } = render(<AIChat messages={THREAD} />);
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

        rerender(<AIChat messages={THREAD} onSend={vi.fn()} />);
        expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("sends a prompt through the composer", async () => {
        const onSend = vi.fn();
        render(<AIChat messages={THREAD} onSend={onSend} />);

        await userEvent.type(screen.getByRole("textbox"), "e amanhã?{Enter}");

        expect(onSend).toHaveBeenCalledWith("e amanhã?");
    });

    it("turns the composer into stop while a turn streams", async () => {
        const onStop = vi.fn();
        render(
            <AIChat
                messages={[{ id: "a", role: "assistant", content: "meia", streaming: true }]}
                onSend={vi.fn()}
                onStop={onStop}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: /Parar/ }));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("turns the composer into stop while pending, before any token", async () => {
        const onStop = vi.fn();
        render(<AIChat messages={THREAD} pending onSend={vi.fn()} onStop={onStop} />);

        await userEvent.click(screen.getByRole("button", { name: /Parar/ }));
        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("offers regenerate on the newest assistant turn only", async () => {
        const onRegenerate = vi.fn();
        render(
            <AIChat
                messages={[
                    { id: "a1", role: "assistant", content: "primeira" },
                    { id: "u1", role: "user", content: "e agora?" },
                    { id: "a2", role: "assistant", content: "segunda" },
                ]}
                onRegenerate={onRegenerate}
            />,
        );

        const buttons = screen.getAllByRole("button", { name: "Gerar de novo" });
        expect(buttons).toHaveLength(1);

        await userEvent.click(buttons[0]);
        expect(onRegenerate).toHaveBeenCalledWith(expect.objectContaining({ id: "a2" }));
    });

    it("withholds regenerate while the newest answer is still streaming", () => {
        render(
            <AIChat
                messages={[{ id: "a", role: "assistant", content: "meia", streaming: true }]}
                onRegenerate={vi.fn()}
            />,
        );

        expect(screen.queryByRole("button", { name: "Gerar de novo" })).not.toBeInTheDocument();
    });

    it("wires feedback, edit and retry down to the turns", async () => {
        const onFeedback = vi.fn();
        const onEditSubmit = vi.fn();
        const onRetry = vi.fn();
        render(
            <AIChat
                messages={[
                    { id: "u1", role: "user", content: "pergunta" },
                    { id: "a1", role: "assistant", content: "resposta", error: "cortou" },
                ]}
                onFeedback={onFeedback}
                onEditSubmit={onEditSubmit}
                onRetry={onRetry}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Boa resposta" }));
        expect(onFeedback).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), "up");

        await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
        expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        expect(screen.getByRole("textbox")).toHaveValue("pergunta");
    });

    it("shows ratings the app owns", () => {
        render(
            <AIChat
                messages={[{ id: "a1", role: "assistant", content: "ok" }]}
                onFeedback={vi.fn()}
                votes={{ a1: "down" }}
            />,
        );

        expect(screen.getByRole("button", { name: "Resposta ruim" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("offers suggestions on an empty transcript and sends the one clicked", async () => {
        const onSend = vi.fn();
        render(
            <AIChat
                messages={[]}
                onSend={onSend}
                suggestions={["Resuma o relatório", "Quais pedidos atrasaram?"]}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Resuma o relatório" }));

        expect(onSend).toHaveBeenCalledWith("Resuma o relatório");
    });

    it("drops the suggestions once the conversation starts", () => {
        render(<AIChat messages={THREAD} onSend={vi.fn()} suggestions={["Resuma"]} />);

        expect(screen.queryByRole("button", { name: "Resuma" })).not.toBeInTheDocument();
    });

    it("does not offer suggestions with nowhere to send them", () => {
        render(<AIChat messages={[]} suggestions={["Resuma"]} />);

        expect(screen.queryByRole("button", { name: "Resuma" })).not.toBeInTheDocument();
        expect(screen.getByText("Comece a conversa")).toBeInTheDocument();
    });

    it("takes a caller-supplied empty state", () => {
        render(<AIChat messages={[]} emptyState={<p>Sem histórico</p>} />);

        expect(screen.getByText("Sem histórico")).toBeInTheDocument();
    });

    it("renders the header, composer actions and composer footer", () => {
        render(
            <AIChat
                messages={THREAD}
                onSend={vi.fn()}
                header={<strong>Assistente de operações</strong>}
                composerActions={<button type="button">Anexar</button>}
                composerFooter={<small>Pode errar</small>}
            />,
        );

        expect(screen.getByText("Assistente de operações")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Anexar" })).toBeInTheDocument();
        expect(screen.getByText("Pode errar")).toBeInTheDocument();
    });

    it("disables the composer when asked", () => {
        render(<AIChat messages={THREAD} onSend={vi.fn()} composerDisabled />);

        expect(screen.getByRole("textbox")).toBeDisabled();
    });

    it("reports a rejected send", async () => {
        const onSendError = vi.fn();
        render(
            <AIChat
                messages={THREAD}
                onSend={vi.fn().mockRejectedValue(new Error("429"))}
                onSendError={onSendError}
            />,
        );

        await userEvent.type(screen.getByRole("textbox"), "oi{Enter}");

        await waitFor(() => expect(onSendError).toHaveBeenCalledTimes(1));
    });

    it("reports a rejected edit through the same handler", async () => {
        const onSendError = vi.fn();
        render(
            <AIChat
                messages={[{ id: "u1", role: "user", content: "pergunta" }]}
                onEditSubmit={vi.fn().mockRejectedValue(new Error("400"))}
                onSendError={onSendError}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        await userEvent.click(screen.getByRole("button", { name: "Enviar edição" }));

        await waitFor(() => expect(onSendError).toHaveBeenCalledTimes(1));
    });

    it("uses the en locale labels", () => {
        render(<AIChat messages={[]} locale="en" />);

        expect(screen.getByRole("log", { name: "Conversation" })).toBeInTheDocument();
        expect(screen.getByText("Start the conversation")).toBeInTheDocument();
    });

    it("forwards renderAvatar and renderContent to the turns", () => {
        render(
            <AIChat
                messages={[{ id: "a1", role: "assistant", content: "x" }]}
                renderAvatar={() => <span data-testid="avatar" />}
                renderContent={(message) => <div>custom {message.id}</div>}
            />,
        );

        expect(screen.getByTestId("avatar")).toBeInTheDocument();
        expect(screen.getByText("custom a1")).toBeInTheDocument();
    });

    it("opens every reasoning block when asked", () => {
        render(
            <AIChat
                messages={[{ id: "a1", role: "assistant", content: "r", reasoning: "trace" }]}
                defaultReasoningOpen
            />,
        );

        expect(screen.getByRole("button", { name: /Raciocínio/ })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
    });

    it("follows the newest text while the reader is at the bottom", () => {
        const { rerender } = render(
            <AIChat messages={[{ id: "a", role: "assistant", content: "Um", streaming: true }]} />,
        );
        const log = screen.getByRole("log");
        fakeScroll(log, { scrollHeight: 1000, scrollTop: 700 });

        rerender(
            <AIChat
                messages={[{ id: "a", role: "assistant", content: "Um dois", streaming: true }]}
            />,
        );

        expect(log.scrollTop).toBe(1000);
    });

    it("stays put while the reader is reading further up, and offers a way back", async () => {
        const { rerender } = render(
            <AIChat messages={[{ id: "a", role: "assistant", content: "Um", streaming: true }]} />,
        );
        const log = screen.getByRole("log");
        fakeScroll(log, { scrollHeight: 1000, scrollTop: 100 });
        fireEvent.scroll(log);

        rerender(
            <AIChat
                messages={[{ id: "a", role: "assistant", content: "Um dois", streaming: true }]}
            />,
        );

        expect(log.scrollTop).toBe(100);

        const jump = screen.getByRole("button", { name: "Ir para a última mensagem" });
        await userEvent.click(jump);

        expect(log.scrollTop).toBe(1000);
        expect(
            screen.queryByRole("button", { name: "Ir para a última mensagem" }),
        ).not.toBeInTheDocument();
    });

    it("has no way-back button on an empty transcript", () => {
        render(<AIChat messages={[]} />);

        expect(
            screen.queryByRole("button", { name: "Ir para a última mensagem" }),
        ).not.toBeInTheDocument();
    });
});
