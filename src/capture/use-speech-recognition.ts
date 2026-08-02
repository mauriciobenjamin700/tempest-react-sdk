import { useCallback, useEffect, useRef, useState } from "react";

import { useStableCallback } from "@/hooks/use-stable-callback";

/** One reading of what was heard. */
export interface SpeechAlternativeLike {
    transcript: string;
    confidence?: number;
}

/** One recognised phrase, settled (`isFinal`) or still being revised. */
export interface SpeechResultLike {
    isFinal: boolean;
    length: number;
    [index: number]: SpeechAlternativeLike | undefined;
}

/** The growing list of phrases in a session. */
export interface SpeechResultListLike {
    length: number;
    [index: number]: SpeechResultLike | undefined;
}

/** The `result` event, reduced to what this hook reads. */
export interface SpeechRecognitionEventLike {
    /** Index of the first result that changed — everything before it is settled. */
    resultIndex: number;
    results: SpeechResultListLike;
}

/** The `error` event, reduced to what this hook reads. */
export interface SpeechRecognitionErrorEventLike {
    error: string;
    message?: string;
}

/**
 * The slice of the Web Speech `SpeechRecognition` object this SDK uses.
 *
 * Declared here rather than imported: TypeScript's DOM lib ships the *event* types but
 * not the constructor, because the API is still prefixed in Chromium and absent in
 * Firefox. Exported so a test — or a consumer wrapping a different engine — can hand in
 * something else.
 */
export interface SpeechRecognitionLike {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
}

/** Classified reason recognition stopped or never started. */
export type SpeechErrorKind =
    | "unsupported"
    | "not-allowed"
    | "no-speech"
    | "audio-capture"
    | "network"
    | "aborted"
    | "language-not-supported"
    | "unknown";

/** A classified speech error with a human-readable, English message. */
export interface SpeechError {
    kind: SpeechErrorKind;
    message: string;
}

/** Options for {@link useSpeechRecognition}. */
export interface UseSpeechRecognitionOptions {
    /** BCP-47 tag. Default `"pt-BR"`. */
    lang?: string;
    /**
     * Keep listening after the first phrase settles. Default `false`.
     *
     * Even with this on, the engine ends the session by itself after a stretch of
     * silence — that is a server-side timeout, not a bug — so watch `listening` rather
     * than assuming the microphone stays open.
     */
    continuous?: boolean;
    /** Publish the running guess as it changes. Default `true`. */
    interimResults?: boolean;
    /** How many readings per phrase to ask for. Default 1. */
    maxAlternatives?: number;
    /** Every update, settled or not. */
    onResult?: (result: { transcript: string; isFinal: boolean }) => void;
    /** Only the settled text of a phrase. The one to wire dictation to. */
    onFinal?: (transcript: string) => void;
    /** Classified failure. `no-speech` and `aborted` arrive here too — they are routine. */
    onError?: (error: SpeechError) => void;
    /** The session ended, for any reason. */
    onEnd?: () => void;
    /** Build the recogniser yourself — another engine, or a stub in a test. */
    factory?: () => SpeechRecognitionLike;
}

/** Value returned by {@link useSpeechRecognition}. */
export interface UseSpeechRecognitionResult {
    /** `false` in Firefox and in every browser that is not Chromium-based. */
    supported: boolean;
    /** Whether a session is open right now. */
    listening: boolean;
    /** Everything settled so far in this session. Cleared by `reset()`. */
    transcript: string;
    /** The running guess. Replaced on every event, empty once the phrase settles. */
    interim: string;
    /** Classified error, or `null`. */
    error: SpeechError | null;
    /** Open a session. No-op while already listening. */
    start: () => void;
    /** Close the session, keeping what was recognised. */
    stop: () => void;
    /** Close the session and throw the pending phrase away. */
    abort: () => void;
    /** Clear `transcript`, `interim` and `error`. Does not stop a session. */
    reset: () => void;
}

/** English messages for the `error` codes the spec defines. */
const MESSAGES: Record<SpeechErrorKind, string> = {
    unsupported: "Speech recognition is not supported in this browser.",
    "not-allowed": "Microphone permission denied. Enable access in your browser settings.",
    "no-speech": "No speech was detected.",
    "audio-capture": "No microphone available on this device.",
    network: "The recognition service could not be reached.",
    aborted: "Recognition was cancelled.",
    "language-not-supported": "The recognition service does not support this language.",
    unknown: "Unexpected error during speech recognition.",
};

/**
 * Map a spec `error` code to a kind an app can branch on.
 *
 * `service-not-allowed` collapses into `not-allowed` because the fix is the same from
 * the user's side, and `bad-grammar` into `unknown` because this hook never sets a
 * grammar, so seeing it means something outside our control went wrong.
 *
 * @param code - The `error` property of the event.
 * @returns The classified kind.
 */
function classifySpeechError(code: string): SpeechErrorKind {
    switch (code) {
        case "not-allowed":
        case "service-not-allowed":
            return "not-allowed";
        case "no-speech":
            return "no-speech";
        case "audio-capture":
            return "audio-capture";
        case "network":
            return "network";
        case "aborted":
            return "aborted";
        case "language-not-supported":
            return "language-not-supported";
        default:
            return "unknown";
    }
}

/** The constructor, prefixed or not, or `null` where the API does not exist. */
function speechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
    const scope = globalThis as {
        SpeechRecognition?: unknown;
        webkitSpeechRecognition?: unknown;
    };
    const candidate = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    return typeof candidate === "function" ? (candidate as new () => SpeechRecognitionLike) : null;
}

/** Whether this browser exposes the Web Speech recognition API at all. */
export function isSpeechRecognitionSupported(): boolean {
    return speechRecognitionConstructor() !== null;
}

/**
 * Dictate into your app with the Web Speech API — no dependency, no API key.
 *
 * ## Recognition is not local
 *
 * **Chromium streams the captured audio to a Google server to transcribe it.** Nothing
 * about the API says so, there is no setting that changes it, and it happens on every
 * `start()`. Anything the user says while a session is open leaves the device. Do not
 * put this on a field that takes clinical notes, credentials, or a client's financial
 * detail without telling them first — and if the data cannot leave your infrastructure,
 * this API is the wrong tool and a self-hosted model is the right one.
 *
 * ## What the states mean
 *
 * `transcript` accumulates the phrases the engine has **settled** on; `interim` is the
 * guess it is still revising and is replaced wholesale on every event, so rendering
 * `transcript + interim` gives the live caption effect and rendering `transcript` alone
 * gives the committed text. `no-speech` and `aborted` come through `onError` but are
 * routine — a user who pressed the button and said nothing is not a failure to report.
 *
 * There is deliberately **no auto-restart** when the engine ends a session on silence.
 * A restart loop is how an app ends up holding the microphone indefinitely — and, in
 * Chromium, streaming audio to a third party indefinitely. Show that listening stopped
 * and let the user press again.
 *
 * @param options - See {@link UseSpeechRecognitionOptions}.
 * @returns Session state, the transcript and the controls.
 *
 * @example
 * const speech = useSpeechRecognition({ onFinal: (text) => setPrompt(text) });
 * <button onClick={speech.listening ? speech.stop : speech.start}>
 *     {speech.listening ? "Parar" : "Ditar"}
 * </button>
 * <p>{speech.transcript}{speech.interim}</p>
 */
export function useSpeechRecognition(
    options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
    const {
        lang = "pt-BR",
        continuous = false,
        interimResults = true,
        maxAlternatives = 1,
        onResult,
        onFinal,
        onError,
        onEnd,
        factory,
    } = options;

    const [supported] = useState(() => factory !== undefined || isSpeechRecognitionSupported());
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [interim, setInterim] = useState("");
    const [error, setError] = useState<SpeechError | null>(null);

    const sessionRef = useRef<SpeechRecognitionLike | null>(null);

    const emitResult = useStableCallback((result: { transcript: string; isFinal: boolean }) =>
        onResult?.(result),
    );
    const emitFinal = useStableCallback((text: string) => onFinal?.(text));
    const emitEnd = useStableCallback(() => onEnd?.());
    const emitError = useStableCallback((failure: SpeechError) => {
        setError(failure);
        onError?.(failure);
    });

    const teardown = useCallback((): void => {
        const session = sessionRef.current;
        if (!session) return;
        session.onresult = null;
        session.onerror = null;
        session.onend = null;
        session.onstart = null;
        sessionRef.current = null;
    }, []);

    const start = useCallback((): void => {
        if (sessionRef.current) return;
        const build =
            factory ??
            (() => {
                const constructor = speechRecognitionConstructor();
                return constructor ? new constructor() : null;
            });
        const session = build();
        if (!session) {
            emitError({ kind: "unsupported", message: MESSAGES.unsupported });
            return;
        }

        session.lang = lang;
        session.continuous = continuous;
        session.interimResults = interimResults;
        session.maxAlternatives = maxAlternatives;

        /**
         * Fold one event into the two published strings.
         *
         * Only the results from `resultIndex` on are new; re-reading the whole list
         * would append phrases that are already in `transcript`. Settled text is
         * accumulated, unsettled text replaces the previous guess entirely — the engine
         * revises a phrase in place, so appending it would stutter the caption.
         */
        session.onresult = (event: SpeechRecognitionEventLike): void => {
            let settled = "";
            let pending = "";
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                const result = event.results[index];
                if (!result) continue;
                const text = result[0]?.transcript ?? "";
                if (result.isFinal) settled += text;
                else pending += text;
            }
            setInterim(pending);
            if (settled !== "") {
                setTranscript((previous) => previous + settled);
                emitFinal(settled);
            }
            emitResult({ transcript: settled !== "" ? settled : pending, isFinal: settled !== "" });
        };

        session.onerror = (event: SpeechRecognitionErrorEventLike): void => {
            const kind = classifySpeechError(event.error);
            emitError({ kind, message: event.message || MESSAGES[kind] });
        };

        session.onend = (): void => {
            setListening(false);
            setInterim("");
            teardown();
            emitEnd();
        };

        session.onstart = (): void => setListening(true);

        setError(null);
        try {
            session.start();
        } catch (failure) {
            // Chromium throws `InvalidStateError` when a session is already running in
            // another component. Reporting it beats leaving a dead handle behind.
            emitError({
                kind: "unknown",
                message: failure instanceof Error ? failure.message : MESSAGES.unknown,
            });
            return;
        }
        sessionRef.current = session;
        setListening(true);
    }, [
        lang,
        continuous,
        interimResults,
        maxAlternatives,
        factory,
        emitResult,
        emitFinal,
        emitEnd,
        emitError,
        teardown,
    ]);

    const stop = useCallback((): void => {
        sessionRef.current?.stop();
    }, []);

    const abort = useCallback((): void => {
        sessionRef.current?.abort();
    }, []);

    const reset = useCallback((): void => {
        setTranscript("");
        setInterim("");
        setError(null);
    }, []);

    /**
     * Never leave a session open past unmount.
     *
     * `abort()` and not `stop()`: a component that is gone has nowhere to put a final
     * result, and `stop()` would keep the microphone — and the upstream connection —
     * alive while the engine finishes deciding what the last word was.
     */
    useEffect(
        () => () => {
            sessionRef.current?.abort();
            teardown();
        },
        [teardown],
    );

    return {
        supported,
        listening,
        transcript,
        interim,
        error,
        start,
        stop,
        abort,
        reset,
    };
}
