import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    FakeSpeechRecognition,
    installSpeechRecognition,
    removeSpeechRecognition,
} from "../../test/audio-mocks";
import {
    isSpeechRecognitionSupported,
    useSpeechRecognition,
    type UseSpeechRecognitionOptions,
} from "./use-speech-recognition";

function Probe(options: UseSpeechRecognitionOptions) {
    const speech = useSpeechRecognition(options);
    return (
        <div>
            <span data-testid="supported">{String(speech.supported)}</span>
            <span data-testid="listening">{String(speech.listening)}</span>
            <span data-testid="transcript">{speech.transcript}</span>
            <span data-testid="interim">{speech.interim}</span>
            <span data-testid="kind">{speech.error?.kind ?? ""}</span>
            <span data-testid="message">{speech.error?.message ?? ""}</span>
            <button type="button" onClick={speech.start}>
                start
            </button>
            <button type="button" onClick={speech.stop}>
                stop
            </button>
            <button type="button" onClick={speech.abort}>
                abort
            </button>
            <button type="button" onClick={speech.reset}>
                reset
            </button>
        </div>
    );
}

const click = (name: string): void => {
    act(() => screen.getByRole("button", { name }).click());
};

/** The session the hook opened. */
function session(): FakeSpeechRecognition {
    const instance = FakeSpeechRecognition.instances.at(-1);
    if (!instance) throw new Error("no SpeechRecognition was constructed");
    return instance;
}

describe("useSpeechRecognition", () => {
    const restores: Array<() => void> = [];

    afterEach(() => {
        while (restores.length) restores.pop()?.();
    });

    it("is unsupported in an engine without the API", () => {
        restores.push(removeSpeechRecognition());
        render(<Probe />);
        expect(screen.getByTestId("supported")).toHaveTextContent("false");
        expect(isSpeechRecognitionSupported()).toBe(false);
    });

    it("finds the prefixed constructor Chromium actually ships", () => {
        restores.push(installSpeechRecognition({ prefixed: true }));
        render(<Probe />);
        expect(screen.getByTestId("supported")).toHaveTextContent("true");
        expect(isSpeechRecognitionSupported()).toBe(true);
    });

    it("reports unsupported instead of doing nothing when start is pressed", () => {
        restores.push(removeSpeechRecognition());
        const onError = vi.fn();
        render(<Probe onError={onError} />);

        click("start");

        expect(screen.getByTestId("kind")).toHaveTextContent("unsupported");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("listening")).toHaveTextContent("false");
    });

    it("defaults to pt-BR and a single phrase", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");

        expect(session().lang).toBe("pt-BR");
        expect(session().continuous).toBe(false);
        expect(session().interimResults).toBe(true);
        expect(session().maxAlternatives).toBe(1);
        expect(screen.getByTestId("listening")).toHaveTextContent("true");
    });

    it("passes the session options through", () => {
        restores.push(installSpeechRecognition());
        render(<Probe lang="en-US" continuous interimResults={false} maxAlternatives={3} />);
        click("start");

        expect(session().lang).toBe("en-US");
        expect(session().continuous).toBe(true);
        expect(session().interimResults).toBe(false);
        expect(session().maxAlternatives).toBe(3);
    });

    it("publishes the running guess separately from the settled text", () => {
        restores.push(installSpeechRecognition());
        const onResult = vi.fn();
        const onFinal = vi.fn();
        render(<Probe onResult={onResult} onFinal={onFinal} />);
        click("start");

        act(() => session().emitResult([{ transcript: "abrir ped", isFinal: false }]));
        expect(screen.getByTestId("interim")).toHaveTextContent("abrir ped");
        expect(screen.getByTestId("transcript")).toHaveTextContent("");
        expect(onFinal).not.toHaveBeenCalled();

        act(() => session().emitResult([{ transcript: "abrir pedido 42", isFinal: true }]));
        // The engine revises a phrase in place, so the guess is replaced, not appended.
        expect(screen.getByTestId("interim")).toHaveTextContent("");
        expect(screen.getByTestId("transcript")).toHaveTextContent("abrir pedido 42");
        expect(onFinal).toHaveBeenCalledWith("abrir pedido 42");
        expect(onResult).toHaveBeenCalledTimes(2);
    });

    it("accumulates settled phrases from resultIndex on", () => {
        restores.push(installSpeechRecognition());
        render(<Probe continuous />);
        click("start");

        act(() => session().emitResult([{ transcript: "um ", isFinal: true }]));
        // Re-reading the whole list would append the first phrase twice.
        act(() =>
            session().emitResult(
                [
                    { transcript: "um ", isFinal: true },
                    { transcript: "dois", isFinal: true },
                ],
                1,
            ),
        );
        expect(screen.getByTestId("transcript")).toHaveTextContent("um dois");
    });

    it("ignores a hole in the result list", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");

        act(() => {
            session().onresult?.({ resultIndex: 0, results: { length: 2, 0: undefined } });
        });
        expect(screen.getByTestId("transcript")).toHaveTextContent("");
    });

    it("survives a result with no alternative at all", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");

        act(() => {
            session().onresult?.({
                resultIndex: 0,
                results: { length: 1, 0: { isFinal: true, length: 0 } },
            });
        });
        expect(screen.getByTestId("transcript")).toHaveTextContent("");
    });

    it("classifies the errors that matter", () => {
        restores.push(installSpeechRecognition());
        const cases: Array<[string, string]> = [
            ["not-allowed", "not-allowed"],
            ["service-not-allowed", "not-allowed"],
            ["no-speech", "no-speech"],
            ["audio-capture", "audio-capture"],
            ["network", "network"],
            ["aborted", "aborted"],
            ["language-not-supported", "language-not-supported"],
            ["bad-grammar", "unknown"],
        ];

        for (const [code, kind] of cases) {
            const view = render(<Probe />);
            click("start");
            act(() => session().emitError(code));
            expect(screen.getByTestId("kind")).toHaveTextContent(kind);
            view.unmount();
        }
    });

    it("prefers the engine's own message when it sends one", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");

        act(() => session().emitError("network", "DNS is on fire"));
        expect(screen.getByTestId("message")).toHaveTextContent("DNS is on fire");
    });

    it("falls back to a readable message when the engine sends none", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");

        act(() => session().emitError("no-speech"));
        expect(screen.getByTestId("message")).toHaveTextContent("No speech was detected.");
    });

    it("stops listening when the session ends on its own", () => {
        restores.push(installSpeechRecognition());
        const onEnd = vi.fn();
        render(<Probe continuous onEnd={onEnd} />);
        click("start");

        act(() => session().emitResult([{ transcript: "meio", isFinal: false }]));
        // The engine closes the session after a stretch of silence; there is no
        // auto-restart, because a restart loop holds the microphone forever.
        act(() => session().emitEnd());

        expect(screen.getByTestId("listening")).toHaveTextContent("false");
        expect(screen.getByTestId("interim")).toHaveTextContent("");
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(FakeSpeechRecognition.instances).toHaveLength(1);
    });

    it("keeps the transcript on stop and throws the phrase away on abort", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");
        act(() => session().emitResult([{ transcript: "guardado", isFinal: true }]));

        click("stop");
        expect(session().stopped).toBe(1);
        expect(screen.getByTestId("transcript")).toHaveTextContent("guardado");

        click("start");
        act(() => session().emitResult([{ transcript: "pendente", isFinal: false }]));
        click("abort");
        expect(session().aborted).toBe(1);
        expect(screen.getByTestId("interim")).toHaveTextContent("");
    });

    it("does nothing when stopped or aborted without a session", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("stop");
        click("abort");
        expect(FakeSpeechRecognition.instances).toHaveLength(0);
    });

    it("ignores a second start while a session is open", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");
        click("start");
        expect(FakeSpeechRecognition.instances).toHaveLength(1);
    });

    it("reports a start that the engine refused, with the engine's reason", () => {
        restores.push(installSpeechRecognition());
        FakeSpeechRecognition.startThrows = new Error("already started");
        render(<Probe />);

        click("start");

        expect(screen.getByTestId("kind")).toHaveTextContent("unknown");
        expect(screen.getByTestId("message")).toHaveTextContent("already started");
        // The refused handle must not be kept, or the next start would be a no-op.
        click("start");
        expect(FakeSpeechRecognition.instances).toHaveLength(2);
    });

    it("falls back to a written message when the refusal carries none", () => {
        restores.push(installSpeechRecognition());
        FakeSpeechRecognition.startThrows = "nope";
        render(<Probe />);

        click("start");

        expect(screen.getByTestId("message")).toHaveTextContent(
            "Unexpected error during speech recognition.",
        );
    });

    it("clears the transcript on reset without closing the session", () => {
        restores.push(installSpeechRecognition());
        render(<Probe />);
        click("start");
        act(() => session().emitResult([{ transcript: "algo", isFinal: true }]));
        act(() => session().emitError("no-speech"));

        click("reset");

        expect(screen.getByTestId("transcript")).toHaveTextContent("");
        expect(screen.getByTestId("kind")).toHaveTextContent("");
        expect(session().stopped).toBe(0);
    });

    it("accepts an injected engine, so another provider can be driven", () => {
        restores.push(removeSpeechRecognition());
        const engine = new FakeSpeechRecognition();
        render(<Probe factory={() => engine} />);

        expect(screen.getByTestId("supported")).toHaveTextContent("true");
        click("start");
        act(() => engine.emitResult([{ transcript: "injetado", isFinal: true }]));

        expect(screen.getByTestId("transcript")).toHaveTextContent("injetado");
    });

    it("aborts at unmount instead of leaving the microphone open", () => {
        restores.push(installSpeechRecognition());
        const view = render(<Probe />);
        click("start");
        const opened = session();

        view.unmount();

        // `stop()` would keep the connection alive while the engine finishes deciding.
        expect(opened.aborted).toBe(1);
        expect(opened.stopped).toBe(0);
    });
});
