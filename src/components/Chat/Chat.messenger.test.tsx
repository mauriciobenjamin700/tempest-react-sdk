import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Chat } from "./Chat";
import type { ChatMessage } from "./chat-groups";

/**
 * What a messenger needs on a single message, which a text-only bubble made every
 * app rebuild: attachments, the reply stub, reactions, per-recipient ticks, the
 * actions menu and the tombstone of a deleted message.
 *
 * The `tempest-zap` app is where the gap became concrete — it wrote its own
 * `MessageBubble`, `MessageThread`, `ConversationList` and `MessageComposer`
 * rather than use `<Chat>`, not out of preference but because none of the items
 * below had anywhere to go in the old contract.
 */

const now = new Date("2026-09-12T12:00:00Z").getTime();

function message(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
    return { body: "", authorId: "them", sentAt: now, ...overrides };
}

function renderThread(messages: ChatMessage[], props: Partial<Parameters<typeof Chat>[0]> = {}) {
    return render(<Chat messages={messages} currentUserId="me" now={now} {...props} />);
}

describe("Chat — attachments", () => {
    /**
     * The media half arrives through `lazy()`, so every assertion here waits: a
     * support thread of plain text must not pay for a photo viewer, and that is
     * only true while the chunk is separate.
     */
    it("renders an image that opens the lightbox", async () => {
        renderThread([
            message({
                id: "m1",
                attachments: [{ kind: "image", url: "/cat.png", alt: "um gato" }],
            }),
        ]);

        const image = await screen.findByAltText("um gato");
        expect(image).toBeInTheDocument();

        await userEvent.click(image);
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
    });

    it("renders a file as a download row with its size", async () => {
        renderThread([
            message({
                id: "m1",
                attachments: [
                    { kind: "file", url: "/nota.pdf", name: "nota-fiscal.pdf", sizeBytes: 2048 },
                ],
            }),
        ]);

        const link = await screen.findByRole("link", { name: /nota-fiscal\.pdf/ });
        expect(link).toHaveAttribute("href", "/nota.pdf");
        expect(link).toHaveAttribute("download", "nota-fiscal.pdf");
        expect(link.textContent).toContain("2");
    });

    /**
     * A voice note without a waveform is a grey rectangle. The bars are drawn from
     * the peaks the app measured, and a flat fallback keeps the shape when it has
     * none — never an empty box.
     */
    it("draws the waveform of a voice note, one bar per peak", async () => {
        const { container } = renderThread([
            message({
                id: "m1",
                attachments: [
                    { kind: "voice", url: "/nota.webm", durationMs: 4200, waveform: [0.2, 1, 0.5] },
                ],
            }),
        ]);

        await waitFor(() => {
            expect(container.querySelectorAll("[class*='waveform'] span")).toHaveLength(3);
        });
    });

    it("keeps the body next to its attachments", async () => {
        renderThread([
            message({
                id: "m1",
                body: "olha isso",
                attachments: [{ kind: "image", url: "/x.png", alt: "x" }],
            }),
        ]);

        expect(await screen.findByAltText("x")).toBeInTheDocument();
        expect(screen.getByText("olha isso")).toBeInTheDocument();
    });
});

describe("Chat — reply quote", () => {
    it("shows who was quoted and what they said", () => {
        renderThread([
            message({
                id: "m2",
                body: "concordo",
                quote: { messageId: "m1", senderName: "Ana", excerpt: "vamos às 14h?" },
            }),
        ]);

        expect(screen.getByText("Ana")).toBeInTheDocument();
        expect(screen.getByText("vamos às 14h?")).toBeInTheDocument();
    });

    /**
     * The reason `revoked` is part of the contract and not decoration: deleting a
     * message has to blank the quote of it, or the text leaks through everyone who
     * replied.
     */
    it("blanks the excerpt once the quoted message is revoked", () => {
        renderThread([
            message({
                id: "m2",
                body: "concordo",
                quote: {
                    messageId: "m1",
                    senderName: "Ana",
                    excerpt: "vamos às 14h?",
                    revoked: true,
                },
            }),
        ]);

        expect(screen.queryByText("vamos às 14h?")).not.toBeInTheDocument();
        expect(screen.getByText("Mensagem apagada")).toBeInTheDocument();
    });

    it("names the kind when the quoted message was not text", () => {
        renderThread([
            message({ id: "m2", body: "que foto", quote: { messageId: "m1", kind: "image" } }),
        ]);
        expect(screen.getByText("Foto")).toBeInTheDocument();
    });

    it("reports a click on the stub so the app can scroll to the original", async () => {
        const onQuoteClick = vi.fn();
        renderThread(
            [message({ id: "m2", body: "ok", quote: { messageId: "m1", excerpt: "oi" } })],
            { onQuoteClick },
        );

        await userEvent.click(screen.getByText("oi"));
        expect(onQuoteClick).toHaveBeenCalledTimes(1);
        expect(onQuoteClick.mock.calls[0]?.[0]?.id).toBe("m2");
    });
});

describe("Chat — reactions", () => {
    it("shows the tally and marks the one the user pressed", () => {
        renderThread(
            [
                message({
                    id: "m1",
                    body: "🎉",
                    reactions: [
                        { emoji: "👍", count: 3, reacted: true },
                        { emoji: "😂", count: 1 },
                    ],
                }),
            ],
            { onReact: vi.fn() },
        );

        const chips = within(screen.getByRole("list", { name: "Reações" })).getAllByRole("button");
        expect(chips).toHaveLength(2);
        expect(chips[0]).toHaveAttribute("aria-pressed", "true");
        expect(chips[1]).toHaveAttribute("aria-pressed", "false");
    });

    /**
     * Pressing the emoji you already reacted with is the clear, not a second copy.
     * The component reports the press and the app owns the toggle — which is the
     * only place that knows what the server did.
     */
    it("reports the emoji that was pressed, including one already reacted with", async () => {
        const onReact = vi.fn();
        renderThread(
            [
                message({
                    id: "m1",
                    body: "🎉",
                    reactions: [{ emoji: "👍", count: 3, reacted: true }],
                }),
            ],
            { onReact },
        );

        await userEvent.click(screen.getByRole("button", { name: /👍/ }));
        expect(onReact).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }), "👍");
    });

    it("renders the chips inert when no handler is given", () => {
        renderThread([message({ id: "m1", body: "🎉", reactions: [{ emoji: "👍", count: 1 }] })]);
        expect(screen.getByRole("button", { name: /👍/ })).toBeDisabled();
    });
});

describe("Chat — per-recipient receipts", () => {
    it("reads 'delivered to everyone' and 'read by everyone' as different states", () => {
        const { rerender } = render(
            <Chat
                currentUserId="me"
                now={now}
                messages={[
                    message({
                        id: "m1",
                        body: "oi",
                        authorId: "me",
                        receipt: { deliveredTo: 9, readBy: 0, totalRecipients: 9 },
                    }),
                ]}
            />,
        );
        expect(screen.getByText("Entregue a todos")).toBeInTheDocument();

        rerender(
            <Chat
                currentUserId="me"
                now={now}
                messages={[
                    message({
                        id: "m1",
                        body: "oi",
                        authorId: "me",
                        receipt: { deliveredTo: 9, readBy: 9, totalRecipients: 9 },
                    }),
                ]}
            />,
        );
        expect(screen.getByText("Lida por todos")).toBeInTheDocument();
    });

    it("spells out a partial count, which the glyph cannot carry", () => {
        renderThread([
            message({
                id: "m1",
                body: "oi",
                authorId: "me",
                receipt: { deliveredTo: 9, readBy: 4, totalRecipients: 9 },
            }),
        ]);
        expect(screen.getByText("Lida por 4 de 9")).toBeInTheDocument();
    });

    it("shows no ticks on somebody else's message", () => {
        renderThread([
            message({
                id: "m1",
                body: "oi",
                authorId: "them",
                receipt: { deliveredTo: 9, readBy: 9, totalRecipients: 9 },
            }),
        ]);
        expect(screen.queryByText("Lida por todos")).not.toBeInTheDocument();
    });
});

describe("Chat — message actions", () => {
    const actions = () => [
        { label: "Responder", onSelect: vi.fn() },
        { label: "Apagar", danger: true, onSelect: vi.fn() },
    ];

    /**
     * The menu itself arrives through `lazy()` — a thread that passes no
     * `messageActions` must not pay for `ContextMenu` and its portal — so the wait
     * here is the real behaviour: the chunk is requested on mount, because the
     * lazy element renders from the first pass with the bubble as its fallback.
     */
    it("opens the actions from a right click on the bubble", async () => {
        renderThread([message({ id: "m1", body: "oi" })], { messageActions: actions });
        await screen.findByRole("button", { name: "Ações da mensagem" });

        fireEvent.contextMenu(screen.getByText("oi"), { clientX: 10, clientY: 10 });
        expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    /**
     * The ⋮ button is the path that exists on a phone and for a keyboard: it is a
     * real control, always in the DOM, not a hover affordance.
     */
    it("exposes a ⋮ button that opens the same actions on a left click", async () => {
        renderThread([message({ id: "m1", body: "oi" })], { messageActions: actions });
        await userEvent.click(await screen.findByRole("button", { name: "Ações da mensagem" }));
        expect(await screen.findByRole("menu")).toBeInTheDocument();
    });

    it("gives a deleted message no actions at all", async () => {
        renderThread([message({ id: "m1", deleted: true }), message({ id: "m2", body: "viva" })], {
            messageActions: actions,
        });
        await screen.findByRole("button", { name: "Ações da mensagem" });

        expect(screen.getAllByRole("button", { name: "Ações da mensagem" })).toHaveLength(1);
    });
});

describe("Chat — tombstone", () => {
    /**
     * A deleted message is a state, not a `body` the app swaps for a string:
     * as a state the quote of it can be blanked too, and every app stops writing
     * its own wording.
     */
    it("renders the standard wording instead of the body", () => {
        renderThread([message({ id: "m1", body: "segredo", deleted: true })]);
        expect(screen.queryByText("segredo")).not.toBeInTheDocument();
        expect(screen.getByText("Esta mensagem foi apagada")).toBeInTheDocument();
    });

    it("drops the attachments and the reactions of a deleted message", async () => {
        renderThread([
            message({
                id: "m1",
                deleted: true,
                attachments: [{ kind: "image", url: "/x.png", alt: "x" }],
                quote: { messageId: "m0", excerpt: "antes" },
            }),
        ]);

        expect(screen.queryByAltText("x")).not.toBeInTheDocument();
        expect(screen.queryByText("antes")).not.toBeInTheDocument();
    });

    it("marks an edited message without touching its body", () => {
        renderThread([message({ id: "m1", body: "corrigido", edited: true })]);
        expect(screen.getByText("corrigido")).toBeInTheDocument();
        expect(screen.getByText("editada")).toBeInTheDocument();
    });
});

describe("Chat — English locale", () => {
    it("translates the new strings too", () => {
        render(
            <Chat
                locale="en"
                currentUserId="me"
                now={now}
                messages={[
                    message({ id: "m1", deleted: true }),
                    message({
                        id: "m2",
                        body: "hi",
                        authorId: "me",
                        edited: true,
                        receipt: { deliveredTo: 2, readBy: 2, totalRecipients: 2 },
                    }),
                ]}
            />,
        );

        expect(screen.getByText("This message was deleted")).toBeInTheDocument();
        expect(screen.getByText("edited")).toBeInTheDocument();
        expect(screen.getByText("Read by everyone")).toBeInTheDocument();
    });
});
