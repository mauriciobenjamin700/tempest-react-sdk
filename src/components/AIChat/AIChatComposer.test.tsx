import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AIChatComposer, type AIChatComposerHandle } from "./AIChatComposer";

describe("AIChatComposer", () => {
    it("sends the trimmed prompt on Enter and clears the field", async () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} />);
        const field = screen.getByRole("textbox");

        await userEvent.type(field, "  quantos pedidos atrasaram?  {Enter}");

        expect(onSend).toHaveBeenCalledWith("quantos pedidos atrasaram?");
        await waitFor(() => expect(field).toHaveValue(""));
    });

    it("keeps Shift+Enter for a newline", async () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} />);
        const field = screen.getByRole("textbox");

        await userEvent.type(field, "linha um{Shift>}{Enter}{/Shift}linha dois");

        expect(onSend).not.toHaveBeenCalled();
        expect(field).toHaveValue("linha um\nlinha dois");
    });

    it("does not send while an IME is composing", () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} />);
        const field = screen.getByRole("textbox");

        fireEvent.change(field, { target: { value: "にほん" } });
        fireEvent.keyDown(field, { key: "Enter", isComposing: true });

        expect(onSend).not.toHaveBeenCalled();
    });

    it("does not send when the legacy keyCode marks composition", () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} />);
        const field = screen.getByRole("textbox");

        fireEvent.change(field, { target: { value: "한국" } });
        fireEvent.keyDown(field, { key: "Enter", keyCode: 229 });

        expect(onSend).not.toHaveBeenCalled();
    });

    it("ignores an empty or whitespace-only prompt", async () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} />);

        await userEvent.type(screen.getByRole("textbox"), "   {Enter}");

        expect(onSend).not.toHaveBeenCalled();
    });

    it("lets a caller-supplied onKeyDown pre-empt the send", async () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} onKeyDown={(event) => event.preventDefault()} />);

        await userEvent.type(screen.getByRole("textbox"), "oi{Enter}");

        expect(onSend).not.toHaveBeenCalled();
    });

    it("keeps the draft and reports the error when onSend rejects", async () => {
        const onError = vi.fn();
        const onSend = vi.fn().mockRejectedValue(new Error("429"));
        render(<AIChatComposer onSend={onSend} onError={onError} />);
        const field = screen.getByRole("textbox");

        await userEvent.type(field, "oi{Enter}");

        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
        expect(field).toHaveValue("oi");
    });

    it("swallows the rejection when there is no onError, keeping the draft", async () => {
        const onSend = vi.fn().mockRejectedValue(new Error("429"));
        render(<AIChatComposer onSend={onSend} />);
        const field = screen.getByRole("textbox");

        await userEvent.type(field, "oi{Enter}");

        await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
        expect(field).toHaveValue("oi");
    });

    it("shows stop instead of send while generating", async () => {
        const onStop = vi.fn();
        render(<AIChatComposer onSend={vi.fn()} onStop={onStop} generating />);

        expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /Parar/ }));

        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("aborts on Escape while generating", () => {
        const onStop = vi.fn();
        render(<AIChatComposer onSend={vi.fn()} onStop={onStop} generating />);

        fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

        expect(onStop).toHaveBeenCalledTimes(1);
    });

    it("ignores Escape when there is nothing to abort", () => {
        const onStop = vi.fn();
        render(<AIChatComposer onSend={vi.fn()} onStop={onStop} />);

        fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

        expect(onStop).not.toHaveBeenCalled();
    });

    it("keeps the send button while generating without onStop, and refuses to send", async () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} generating />);

        const send = screen.getByRole("button", { name: "Enviar" });
        expect(send).toBeDisabled();

        await userEvent.type(screen.getByRole("textbox"), "oi{Enter}");
        expect(onSend).not.toHaveBeenCalled();
    });

    it("disables send until there is something to send", async () => {
        render(<AIChatComposer onSend={vi.fn()} />);
        const send = screen.getByRole("button", { name: "Enviar" });

        expect(send).toBeDisabled();
        await userEvent.type(screen.getByRole("textbox"), "oi");
        expect(send).toBeEnabled();
    });

    it("sends by submitting the form, not only by keyboard", async () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} />);

        await userEvent.type(screen.getByRole("textbox"), "oi");
        await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

        expect(onSend).toHaveBeenCalledWith("oi");
    });

    it("honours disabled", async () => {
        const onSend = vi.fn();
        render(<AIChatComposer onSend={onSend} disabled />);

        const field = screen.getByRole("textbox");
        expect(field).toBeDisabled();
        fireEvent.keyDown(field, { key: "Enter" });
        expect(onSend).not.toHaveBeenCalled();
    });

    it("renders actions and a footer", () => {
        render(
            <AIChatComposer
                onSend={vi.fn()}
                actions={<button type="button">Anexar</button>}
                footer={<span>Opus 5 · pode errar</span>}
            />,
        );

        expect(screen.getByRole("button", { name: "Anexar" })).toBeInTheDocument();
        expect(screen.getByText("Opus 5 · pode errar")).toBeInTheDocument();
    });

    it("uses the en locale labels", () => {
        render(<AIChatComposer onSend={vi.fn()} locale="en" />);
        expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Ask anything…")).toBeInTheDocument();
    });

    it("lets a caller override the placeholder", () => {
        render(<AIChatComposer onSend={vi.fn()} placeholder="Pergunte ao assistente" />);
        expect(screen.getByPlaceholderText("Pergunte ao assistente")).toBeInTheDocument();
    });

    it("forwards onChange to the caller", async () => {
        const onChange = vi.fn();
        render(<AIChatComposer onSend={vi.fn()} onChange={onChange} />);

        await userEvent.type(screen.getByRole("textbox"), "ab");

        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("exposes focus and setValue through the ref", () => {
        const ref = createRef<AIChatComposerHandle>();
        render(<AIChatComposer ref={ref} onSend={vi.fn()} />);

        act(() => ref.current?.setValue("prompt reposto"));

        const field = screen.getByRole("textbox");
        expect(field).toHaveValue("prompt reposto");
        expect(field).toHaveFocus();

        ref.current?.focus();
        expect(field).toHaveFocus();
    });

    it("reads the draft back, so a dictated phrase can be appended to it", async () => {
        const ref = createRef<AIChatComposerHandle>();
        render(<AIChatComposer ref={ref} onSend={vi.fn()} />);

        await userEvent.type(screen.getByRole("textbox"), "resumir o");
        expect(ref.current?.getValue()).toBe("resumir o");

        // The field is uncontrolled; without `getValue` an append would have to shadow
        // the whole draft in app state and hope the two never drift.
        act(() => ref.current?.setValue(`${ref.current.getValue()} relatório`));
        expect(screen.getByRole("textbox")).toHaveValue("resumir o relatório");
    });

    it("grows the field with its content, capped by maxRows", async () => {
        render(<AIChatComposer onSend={vi.fn()} maxRows={2} />);
        const field = screen.getByRole("textbox") as HTMLTextAreaElement;

        Object.defineProperty(field, "scrollHeight", { configurable: true, value: 200 });
        await userEvent.type(field, "linha");

        expect(field.style.height).toBe("40px");
        expect(field.style.overflowY).toBe("auto");
    });
});
