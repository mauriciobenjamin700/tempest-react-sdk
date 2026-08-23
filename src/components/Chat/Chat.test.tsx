import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Chat } from "./Chat";
import type { ChatMessage } from "./chat-groups";

const NOON = new Date(2026, 2, 10, 12, 0, 0).getTime();
const MINUTE = 60 * 1000;

const THREAD: ChatMessage[] = [
    { id: "1", body: "Bom dia", authorId: "ana", authorName: "Ana", sentAt: NOON },
    { id: "2", body: "Tudo certo?", authorId: "ana", authorName: "Ana", sentAt: NOON + MINUTE },
    {
        id: "3",
        body: "Tudo, obrigado",
        authorId: "me",
        authorName: "Eu",
        sentAt: NOON + 2 * MINUTE,
        status: "read",
    },
];

describe("Chat", () => {
    it("renders every message, once", () => {
        render(<Chat messages={THREAD} currentUserId="me" now={NOON} />);
        expect(screen.getByText("Bom dia")).toBeInTheDocument();
        expect(screen.getByText("Tudo certo?")).toBeInTheDocument();
        expect(screen.getByText("Tudo, obrigado")).toBeInTheDocument();
    });

    it("names the author once per run, and calls the current user 'Você'", () => {
        render(<Chat messages={THREAD} currentUserId="me" now={NOON} />);
        // Ana said two things in a row: one name, not two.
        expect(screen.getAllByText("Ana")).toHaveLength(1);
        expect(screen.getByText("Você")).toBeInTheDocument();
    });

    it("falls back to the author id when there is no name", () => {
        render(
            <Chat
                messages={[{ id: "1", body: "oi", authorId: "u-42", sentAt: NOON }]}
                now={NOON}
            />,
        );
        expect(screen.getByText("u-42")).toBeInTheDocument();
    });

    it("heads the thread with a day separator", () => {
        render(<Chat messages={THREAD} now={NOON} />);
        expect(screen.getByText("Hoje")).toBeInTheDocument();
    });

    it("is a live log region a keyboard can reach and scroll", () => {
        render(<Chat messages={THREAD} now={NOON} />);
        const log = screen.getByRole("log");
        expect(log).toHaveAttribute("aria-live", "polite");
        expect(log).toHaveAttribute("tabindex", "0");
    });

    it("announces delivery state of own messages in text, not only a glyph", () => {
        render(<Chat messages={THREAD} currentUserId="me" now={NOON} />);
        expect(screen.getByText("Lida")).toBeInTheDocument();
    });

    it("does not put status on somebody else's message", () => {
        render(
            <Chat messages={[{ ...THREAD[0], status: "read" }]} currentUserId="me" now={NOON} />,
        );
        expect(screen.queryByText("Lida")).not.toBeInTheDocument();
    });

    it("offers a retry on a failed message and passes the message back", async () => {
        const onRetry = vi.fn();
        const failed: ChatMessage = { ...THREAD[2], status: "failed" };
        render(<Chat messages={[failed]} currentUserId="me" onRetry={onRetry} now={NOON} />);

        await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
        expect(onRetry).toHaveBeenCalledWith(failed);
    });

    it("shows no retry control without the callback", () => {
        render(
            <Chat messages={[{ ...THREAD[2], status: "failed" }]} currentUserId="me" now={NOON} />,
        );
        expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
    });

    it("phrases who is typing", () => {
        render(<Chat messages={THREAD} typing={["Ana", "Bruno"]} now={NOON} />);
        expect(screen.getByText("Ana e Bruno estão digitando…")).toBeInTheDocument();
    });

    it("says nothing when nobody is typing", () => {
        render(<Chat messages={THREAD} typing={[]} now={NOON} />);
        expect(screen.queryByText(/digitando/)).not.toBeInTheDocument();
    });

    it("shows an empty state instead of a bare panel", () => {
        render(<Chat messages={[]} now={NOON} />);
        expect(screen.getByText("Nenhuma mensagem ainda")).toBeInTheDocument();
    });

    it("takes a custom empty state", () => {
        render(<Chat messages={[]} emptyState={<p>Comece a conversa</p>} now={NOON} />);
        expect(screen.getByText("Comece a conversa")).toBeInTheDocument();
    });

    it("renders the composer only when it can send", () => {
        const { rerender } = render(<Chat messages={THREAD} now={NOON} />);
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        rerender(<Chat messages={THREAD} onSend={vi.fn()} now={NOON} />);
        expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("sends what was typed, trimmed", async () => {
        const onSend = vi.fn();
        render(<Chat messages={THREAD} onSend={onSend} now={NOON} />);

        await userEvent.type(screen.getByRole("textbox"), "  olá  ");
        await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
        await waitFor(() => expect(onSend).toHaveBeenCalledWith("olá"));
    });

    it("renders an avatar for the first message of a run only", () => {
        render(
            <Chat
                messages={THREAD}
                currentUserId="me"
                renderAvatar={(message) => <span data-testid="avatar">{message.authorId}</span>}
                now={NOON}
            />,
        );
        // Two runs (Ana, then me) → two avatars for three messages.
        expect(screen.getAllByTestId("avatar")).toHaveLength(2);
    });

    it("renders a header when given one", () => {
        render(<Chat messages={THREAD} header={<h2>Suporte</h2>} now={NOON} />);
        expect(screen.getByRole("heading", { name: "Suporte" })).toBeInTheDocument();
    });

    it("speaks English when asked", () => {
        render(
            <Chat messages={THREAD} currentUserId="me" locale="en" typing={["Ana"]} now={NOON} />,
        );
        expect(screen.getByText("Today")).toBeInTheDocument();
        expect(screen.getByText("You")).toBeInTheDocument();
        expect(screen.getByText("Ana is typing…")).toBeInTheDocument();
    });

    it("forwards the rest of the DOM props", () => {
        render(<Chat messages={THREAD} data-testid="thread" id="chat-1" now={NOON} />);
        expect(screen.getByTestId("thread")).toHaveAttribute("id", "chat-1");
    });
});

describe("Chat — the scroll position the reader chose", () => {
    /**
     * jsdom does no layout, so the thread would always measure as "at the bottom".
     * These stubs stand in for the geometry the component reads.
     */
    function stubScroll(distanceFromBottom: number): void {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
            configurable: true,
            get: () => 1000,
        });
        Object.defineProperty(HTMLElement.prototype, "clientHeight", {
            configurable: true,
            get: () => 400,
        });
        Object.defineProperty(HTMLElement.prototype, "scrollTop", {
            configurable: true,
            get: () => 600 - distanceFromBottom,
            set: () => undefined,
        });
    }

    afterEach(() => {
        for (const name of ["scrollHeight", "clientHeight", "scrollTop"]) {
            Reflect.deleteProperty(HTMLElement.prototype, name);
        }
    });

    it("does not yank a reader who scrolled up back to the newest message", () => {
        stubScroll(300);
        const { rerender } = render(<Chat messages={THREAD} currentUserId="me" now={NOON} />);
        const thread = screen.getByRole("log");

        fireEvent.scroll(thread);
        rerender(
            <Chat
                messages={[
                    ...THREAD,
                    {
                        id: "4",
                        body: "Chegou depois",
                        authorId: "ana",
                        authorName: "Ana",
                        sentAt: NOON + 3 * MINUTE,
                    },
                ]}
                currentUserId="me"
                now={NOON}
            />,
        );

        expect(screen.getByText("Chegou depois")).toBeInTheDocument();
    });
});
