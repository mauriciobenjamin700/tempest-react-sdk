import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatComposer, type ChatComposerHandle } from "./ChatComposer";

describe("ChatComposer", () => {
    it("sends on Enter", async () => {
        const onSend = vi.fn();
        render(<ChatComposer onSend={onSend} />);
        await userEvent.type(screen.getByRole("textbox"), "oi{Enter}");
        await waitFor(() => expect(onSend).toHaveBeenCalledWith("oi"));
    });

    it("keeps Shift+Enter for a newline", async () => {
        const onSend = vi.fn();
        render(<ChatComposer onSend={onSend} />);
        const field = screen.getByRole("textbox");
        await userEvent.type(field, "linha 1{Shift>}{Enter}{/Shift}linha 2");
        expect(onSend).not.toHaveBeenCalled();
        expect(field).toHaveValue("linha 1\nlinha 2");
    });

    it("clears the field after a successful send", async () => {
        render(<ChatComposer onSend={vi.fn()} />);
        const field = screen.getByRole("textbox");
        await userEvent.type(field, "oi{Enter}");
        await waitFor(() => expect(field).toHaveValue(""));
    });

    it("keeps the draft when sending fails, and reports the error", async () => {
        const onSend = vi.fn(() => Promise.reject(new Error("offline")));
        const onError = vi.fn();
        render(<ChatComposer onSend={onSend} onError={onError} />);
        const field = screen.getByRole("textbox");

        await userEvent.type(field, "importante");
        await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

        await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error("offline")));
        expect(field).toHaveValue("importante");
    });

    it("does not leave an unhandled rejection when nobody passes onError", async () => {
        const onSend = vi.fn(() => Promise.reject(new Error("offline")));
        render(<ChatComposer onSend={onSend} />);
        await userEvent.type(screen.getByRole("textbox"), "oi{Enter}");
        // Re-throwing out of a DOM handler would surface as an unhandled rejection;
        // the visible signal is the draft still being there.
        await waitFor(() => expect(onSend).toHaveBeenCalled());
        expect(screen.getByRole("textbox")).toHaveValue("oi");
    });

    it("does not send blank text", async () => {
        const onSend = vi.fn();
        render(<ChatComposer onSend={onSend} />);
        await userEvent.type(screen.getByRole("textbox"), "   {Enter}");
        expect(onSend).not.toHaveBeenCalled();
    });

    it("disables the send button until there is something to send", async () => {
        render(<ChatComposer onSend={vi.fn()} />);
        const send = screen.getByRole("button", { name: "Enviar" });
        expect(send).toBeDisabled();
        await userEvent.type(screen.getByRole("textbox"), "a");
        expect(send).toBeEnabled();
    });

    it("does not send while an IME is composing", async () => {
        const onSend = vi.fn();
        render(<ChatComposer onSend={onSend} />);
        const field = screen.getByRole("textbox");
        await userEvent.type(field, "にほ");

        // While composing Japanese or Korean, `Enter` confirms the candidate word.
        // Sending there posts half a word and eats the confirmation.
        fireEvent.keyDown(field, { key: "Enter", isComposing: true });
        expect(onSend).not.toHaveBeenCalled();

        fireEvent.keyDown(field, { key: "Enter" });
        await waitFor(() => expect(onSend).toHaveBeenCalledWith("にほ"));
    });

    it("respects `disabled`", async () => {
        const onSend = vi.fn();
        render(<ChatComposer onSend={onSend} disabled />);
        expect(screen.getByRole("textbox")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    });

    it("takes a custom placeholder, send label and actions", () => {
        render(
            <ChatComposer
                onSend={vi.fn()}
                placeholder="Comente"
                sendLabel="Publicar"
                actions={<button type="button">Anexar</button>}
            />,
        );
        expect(screen.getByPlaceholderText("Comente")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Anexar" })).toBeInTheDocument();
    });

    it("uses the English strings when asked", () => {
        render(<ChatComposer onSend={vi.fn()} locale="en" />);
        expect(screen.getByPlaceholderText("Write a message")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    });

    it("exposes focus and setValue through the ref", async () => {
        const ref = createRef<ChatComposerHandle>();
        render(<ChatComposer ref={ref} onSend={vi.fn()} />);

        ref.current?.focus();
        expect(screen.getByRole("textbox")).toHaveFocus();

        ref.current?.setValue("de volta ao rascunho");
        await waitFor(() =>
            expect(screen.getByRole("textbox")).toHaveValue("de volta ao rascunho"),
        );
    });

    it("still reports keystrokes to a caller that wants them", async () => {
        const onChange = vi.fn();
        const onKeyDown = vi.fn();
        render(<ChatComposer onSend={vi.fn()} onChange={onChange} onKeyDown={onKeyDown} />);
        await userEvent.type(screen.getByRole("textbox"), "ab");
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onKeyDown).toHaveBeenCalledTimes(2);
    });

    it("lets a caller stop the Enter-to-send shortcut", async () => {
        const onSend = vi.fn();
        render(
            <ChatComposer
                onSend={onSend}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                }}
            />,
        );
        await userEvent.type(screen.getByRole("textbox"), "oi{Enter}");
        expect(onSend).not.toHaveBeenCalled();
    });
});
