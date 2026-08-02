import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChatTurn } from "./AIChatTurn";
import type { AIChatMessage } from "./ai-chat-turns";

const turn = (over: Partial<AIChatMessage> & { id: string }): AIChatMessage => ({
    role: "assistant",
    content: "",
    ...over,
});

describe("AIChatTurn", () => {
    beforeEach(() => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    it("renders an assistant turn as Markdown", () => {
        render(<AIChatTurn message={turn({ id: "a", content: "Use **negrito** aqui" })} />);

        expect(screen.getByText("negrito").tagName).toBe("STRONG");
    });

    it("renders a user turn as plain text, so asterisks survive", () => {
        render(
            <AIChatTurn message={turn({ id: "u", role: "user", content: "calcule 2 * 3 * 4" })} />,
        );

        expect(screen.getByText("calcule 2 * 3 * 4")).toBeInTheDocument();
        expect(document.querySelector("strong")).toBeNull();
    });

    it("names the role for a screen reader even on a user turn", () => {
        render(<AIChatTurn message={turn({ id: "u", role: "user", content: "oi" })} />);

        expect(screen.getByText("Você")).toBeInTheDocument();
    });

    it("labels an assistant turn and shows the model when given", () => {
        render(<AIChatTurn message={turn({ id: "a", content: "ok", model: "opus-5" })} />);

        expect(screen.getByText("Assistente")).toBeInTheDocument();
        expect(screen.getByText("opus-5")).toBeInTheDocument();
    });

    it("hides the model on a user turn", () => {
        render(
            <AIChatTurn
                message={turn({ id: "u", role: "user", content: "oi", model: "opus-5" })}
            />,
        );

        expect(screen.queryByText("opus-5")).not.toBeInTheDocument();
    });

    it("renders the clock when createdAt is given", () => {
        const at = new Date(2026, 2, 10, 14, 5, 0).getTime();
        render(<AIChatTurn message={turn({ id: "a", content: "ok", createdAt: at })} />);

        expect(screen.getByText(/14[:h]05/)).toBeInTheDocument();
    });

    it("marks a streaming turn busy and hides the action row", () => {
        render(<AIChatTurn message={turn({ id: "a", content: "meia", streaming: true })} />);

        expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
        expect(screen.queryByRole("group", { name: "Ações da mensagem" })).not.toBeInTheDocument();
    });

    it("shows the thinking dots while a streaming turn has no text yet", () => {
        const { container } = render(
            <AIChatTurn message={turn({ id: "a", content: "", streaming: true })} />,
        );

        expect(container.querySelectorAll("span > span")).not.toHaveLength(0);
    });

    it("renders reasoning in a collapsed block", async () => {
        render(
            <AIChatTurn
                message={turn({ id: "a", content: "resposta", reasoning: "o usuário quer X" })}
            />,
        );

        const trigger = screen.getByRole("button", { name: /Raciocínio/ });
        expect(trigger).toHaveAttribute("aria-expanded", "false");

        await userEvent.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("o usuário quer X")).toBeVisible();
    });

    it("opens reasoning on request", () => {
        render(
            <AIChatTurn
                message={turn({ id: "a", content: "r", reasoning: "trace" })}
                defaultReasoningOpen
            />,
        );

        expect(screen.getByRole("button", { name: /Raciocínio/ })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
    });

    it("opens reasoning while it is the only thing that has arrived", () => {
        render(
            <AIChatTurn
                message={turn({ id: "a", content: "", reasoning: "pensando", streaming: true })}
            />,
        );

        expect(screen.getByRole("button", { name: /Raciocínio/ })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
    });

    it("renders a file attachment as a chip with its size", () => {
        render(
            <AIChatTurn
                message={turn({
                    id: "u",
                    role: "user",
                    content: "revise",
                    attachments: [{ id: "f1", name: "contrato.pdf", size: 1536 }],
                })}
            />,
        );

        expect(screen.getByText("contrato.pdf")).toBeInTheDocument();
        expect(screen.getByText("1.5 KB")).toBeInTheDocument();
    });

    it("falls back to the mime type when there is no size", () => {
        render(
            <AIChatTurn
                message={turn({
                    id: "u",
                    role: "user",
                    content: "x",
                    attachments: [{ id: "f1", name: "a.csv", mimeType: "text/csv" }],
                })}
            />,
        );

        expect(screen.getByText("text/csv")).toBeInTheDocument();
    });

    it("renders an image attachment as a thumbnail", () => {
        render(
            <AIChatTurn
                message={turn({
                    id: "u",
                    role: "user",
                    content: "o que é isso?",
                    attachments: [{ id: "i1", name: "planta.png", url: "/planta.png" }],
                })}
            />,
        );

        expect(screen.getByRole("img", { name: "planta.png" })).toHaveAttribute(
            "src",
            "/planta.png",
        );
    });

    it("shows the error with a retry control", async () => {
        const onRetry = vi.fn();
        render(
            <AIChatTurn
                message={turn({ id: "a", content: "meia resp", error: "conexão caiu" })}
                onRetry={onRetry}
            />,
        );

        expect(screen.getByRole("alert")).toHaveTextContent("conexão caiu");
        await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("keeps the partial answer readable next to the error", () => {
        render(<AIChatTurn message={turn({ id: "a", content: "meia resp", error: "caiu" })} />);

        expect(screen.getByText("meia resp")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
    });

    it("copies the raw text, not the rendered HTML", async () => {
        render(<AIChatTurn message={turn({ id: "a", content: "Use **negrito**" })} />);

        await userEvent.click(screen.getByRole("button", { name: "Copiar" }));

        await waitFor(() =>
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Use **negrito**"),
        );
    });

    it("offers regenerate only when asked to", async () => {
        const onRegenerate = vi.fn();
        const { rerender } = render(
            <AIChatTurn message={turn({ id: "a", content: "ok" })} onRegenerate={onRegenerate} />,
        );

        expect(screen.queryByRole("button", { name: "Gerar de novo" })).not.toBeInTheDocument();

        rerender(
            <AIChatTurn
                message={turn({ id: "a", content: "ok" })}
                onRegenerate={onRegenerate}
                canRegenerate
            />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Gerar de novo" }));
        expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it("keeps a rating pressed locally and reports it once", async () => {
        const onFeedback = vi.fn();
        render(<AIChatTurn message={turn({ id: "a", content: "ok" })} onFeedback={onFeedback} />);

        const good = screen.getByRole("button", { name: "Boa resposta" });
        await userEvent.click(good);

        expect(good).toHaveAttribute("aria-pressed", "true");
        expect(onFeedback).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "up");

        await userEvent.click(good);
        expect(onFeedback).toHaveBeenCalledTimes(1);
    });

    it("switches from up to down", async () => {
        const onFeedback = vi.fn();
        render(<AIChatTurn message={turn({ id: "a", content: "ok" })} onFeedback={onFeedback} />);

        await userEvent.click(screen.getByRole("button", { name: "Boa resposta" }));
        await userEvent.click(screen.getByRole("button", { name: "Resposta ruim" }));

        expect(screen.getByRole("button", { name: "Resposta ruim" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(onFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a" }), "down");
    });

    it("lets the app own the rating", async () => {
        const onFeedback = vi.fn();
        render(
            <AIChatTurn
                message={turn({ id: "a", content: "ok" })}
                onFeedback={onFeedback}
                vote="down"
            />,
        );

        expect(screen.getByRole("button", { name: "Resposta ruim" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );

        await userEvent.click(screen.getByRole("button", { name: "Resposta ruim" }));
        expect(onFeedback).not.toHaveBeenCalled();
    });

    it("has no rating buttons without onFeedback", () => {
        render(<AIChatTurn message={turn({ id: "a", content: "ok" })} canRegenerate />);

        expect(screen.queryByRole("button", { name: "Boa resposta" })).not.toBeInTheDocument();
    });

    it("edits a user turn and submits the new prompt", async () => {
        const onEditSubmit = vi.fn();
        render(
            <AIChatTurn
                message={turn({ id: "u", role: "user", content: "pergunta antiga" })}
                onEditSubmit={onEditSubmit}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        const field = screen.getByRole("textbox");
        expect(field).toHaveValue("pergunta antiga");

        await userEvent.clear(field);
        await userEvent.type(field, "pergunta nova");
        await userEvent.click(screen.getByRole("button", { name: "Enviar edição" }));

        expect(onEditSubmit).toHaveBeenCalledWith(
            expect.objectContaining({ id: "u" }),
            "pergunta nova",
        );
        await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    });

    it("restores the original prompt on cancel", async () => {
        render(
            <AIChatTurn
                message={turn({ id: "u", role: "user", content: "original" })}
                onEditSubmit={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        await userEvent.type(screen.getByRole("textbox"), " editado");
        await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

        expect(screen.getByText("original")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        expect(screen.getByRole("textbox")).toHaveValue("original");
    });

    it("refuses to submit an empty edit", async () => {
        const onEditSubmit = vi.fn();
        render(
            <AIChatTurn
                message={turn({ id: "u", role: "user", content: "algo" })}
                onEditSubmit={onEditSubmit}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        await userEvent.clear(screen.getByRole("textbox"));

        expect(screen.getByRole("button", { name: "Enviar edição" })).toBeDisabled();
        expect(onEditSubmit).not.toHaveBeenCalled();
    });

    it("keeps the editor open and reports the error when the submit rejects", async () => {
        const onEditError = vi.fn();
        const onEditSubmit = vi.fn().mockRejectedValue(new Error("400"));
        render(
            <AIChatTurn
                message={turn({ id: "u", role: "user", content: "algo" })}
                onEditSubmit={onEditSubmit}
                onEditError={onEditError}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        await userEvent.click(screen.getByRole("button", { name: "Enviar edição" }));

        await waitFor(() => expect(onEditError).toHaveBeenCalledTimes(1));
        expect(screen.getByRole("textbox")).toHaveValue("algo");
    });

    it("swallows the rejection when there is no onEditError, keeping the editor open", async () => {
        const onEditSubmit = vi.fn().mockRejectedValue(new Error("400"));
        render(
            <AIChatTurn
                message={turn({ id: "u", role: "user", content: "algo" })}
                onEditSubmit={onEditSubmit}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        await userEvent.click(screen.getByRole("button", { name: "Enviar edição" }));

        await waitFor(() => expect(onEditSubmit).toHaveBeenCalledTimes(1));
        expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("has no edit control on an assistant turn", () => {
        render(<AIChatTurn message={turn({ id: "a", content: "ok" })} onEditSubmit={vi.fn()} />);

        expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    });

    it("renders the avatar a caller supplies", () => {
        render(
            <AIChatTurn
                message={turn({ id: "a", content: "ok" })}
                renderAvatar={() => <span data-testid="avatar" />}
            />,
        );

        expect(screen.getByTestId("avatar")).toBeInTheDocument();
    });

    it("lets a caller replace the body", () => {
        render(
            <AIChatTurn
                message={turn({ id: "a", content: "ignorado" })}
                renderContent={(message) => <div>card de {message.id}</div>}
            />,
        );

        expect(screen.getByText("card de a")).toBeInTheDocument();
        expect(screen.queryByText("ignorado")).not.toBeInTheDocument();
    });

    it("marks a system turn with its own role", () => {
        render(<AIChatTurn message={turn({ id: "s", role: "system", content: "seja breve" })} />);

        expect(screen.getByRole("article")).toHaveAttribute("data-role", "system");
        expect(screen.getByText("Sistema")).toBeInTheDocument();
    });

    it("uses the en locale labels", () => {
        render(<AIChatTurn message={turn({ id: "a", content: "ok" })} locale="en" />);

        expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    });

    it("passes showLineNumbers down to fenced code", () => {
        const { container } = render(
            <AIChatTurn
                message={turn({ id: "a", content: "```js\nconst a = 1;\n```" })}
                showLineNumbers
            />,
        );

        expect(container.querySelector("pre")).toBeInTheDocument();
    });
});
