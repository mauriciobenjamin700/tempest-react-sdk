import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
    DEFAULT_PUSH_TO_TALK_KEY,
    PUSH_TO_TALK_KEYS,
    pushToTalkKeyLabel,
    usePushToTalk,
    type UsePushToTalkOptions,
} from "./use-push-to-talk";

/** Mount the hook, with a text field and a plain div to aim events at. */
function mount(options: UsePushToTalkOptions) {
    function Harness(): React.ReactElement {
        usePushToTalk(options);
        return (
            <>
                <input aria-label="mensagem" />
                <div data-testid="page" />
            </>
        );
    }
    return render(<Harness />);
}

/** Fire a key event at a target, the way the browser would. */
function key(
    type: "keydown" | "keyup",
    init: KeyboardEventInit & { target?: Element } = {},
): boolean {
    const { target, ...rest } = init;
    const event = new KeyboardEvent(type, {
        code: DEFAULT_PUSH_TO_TALK_KEY,
        bubbles: true,
        cancelable: true,
        ...rest,
    });
    act(() => {
        (target ?? window).dispatchEvent(event);
    });
    return event.defaultPrevented;
}

describe("usePushToTalk", () => {
    it("fires down once and up once for a press", () => {
        const onDown = vi.fn();
        const onUp = vi.fn();
        mount({ onDown, onUp });

        key("keydown");
        key("keyup");

        expect(onDown).toHaveBeenCalledTimes(1);
        expect(onUp).toHaveBeenCalledTimes(1);
    });

    it("ignores auto-repeat, so a held key does not fire at the keyboard's rate", () => {
        const onDown = vi.fn();
        mount({ onDown, onUp: vi.fn() });

        key("keydown");
        key("keydown", { repeat: true });
        key("keydown", { repeat: true });

        expect(onDown).toHaveBeenCalledTimes(1);
    });

    it("releases on blur, because alt-tab never delivers the keyup", () => {
        const onUp = vi.fn();
        mount({ onDown: vi.fn(), onUp });

        key("keydown");
        act(() => {
            window.dispatchEvent(new Event("blur"));
        });

        expect(onUp).toHaveBeenCalledTimes(1);
    });

    it("does not fire a second time when the keyup arrives after a blur", () => {
        const onUp = vi.fn();
        mount({ onDown: vi.fn(), onUp });

        key("keydown");
        act(() => {
            window.dispatchEvent(new Event("blur"));
        });
        key("keyup");

        expect(onUp).toHaveBeenCalledTimes(1);
    });

    it("leaves a text field alone, so the space reaches the message", () => {
        const onDown = vi.fn();
        const { getByLabelText } = mount({ onDown, onUp: vi.fn() });
        const input = getByLabelText("mensagem");

        const prevented = key("keydown", { target: input });

        expect(onDown).not.toHaveBeenCalled();
        expect(prevented).toBe(false);
    });

    /**
     * jsdom parses `contenteditable` but never derives `isContentEditable` from
     * it — the property is hard-wired to `false`, so setting the attribute here
     * would assert nothing. Defining the property is what puts the element in
     * the state the hook actually reads.
     */
    it("leaves a contenteditable alone too", () => {
        const onDown = vi.fn();
        const { getByTestId } = mount({ onDown, onUp: vi.fn() });
        const page = getByTestId("page");
        Object.defineProperty(page, "isContentEditable", { value: true });

        key("keydown", { target: page });

        expect(onDown).not.toHaveBeenCalled();
    });

    it("swallows the keystroke it acts on, so Space does not scroll the page", () => {
        mount({ onDown: vi.fn(), onUp: vi.fn() });

        expect(key("keydown")).toBe(true);
        expect(key("keyup")).toBe(true);
    });

    it("watches only the bound key", () => {
        const onDown = vi.fn();
        mount({ code: "ControlLeft", onDown, onUp: vi.fn() });

        key("keydown", { code: "Space" });
        expect(onDown).not.toHaveBeenCalled();

        key("keydown", { code: "ControlLeft" });
        expect(onDown).toHaveBeenCalledTimes(1);
    });

    it("releases when the component holding it goes away mid-press", () => {
        const onUp = vi.fn();
        const { unmount } = mount({ onDown: vi.fn(), onUp });

        key("keydown");
        unmount();

        expect(onUp).toHaveBeenCalledTimes(1);
    });

    it("does nothing while disabled, and releases when it is turned off", () => {
        const onDown = vi.fn();
        const onUp = vi.fn();

        function Harness({ enabled }: { enabled: boolean }): React.ReactElement {
            usePushToTalk({ onDown, onUp, enabled });
            return <div />;
        }
        const { rerender } = render(<Harness enabled={false} />);

        key("keydown");
        expect(onDown).not.toHaveBeenCalled();

        rerender(<Harness enabled />);
        key("keydown");
        expect(onDown).toHaveBeenCalledTimes(1);

        rerender(<Harness enabled={false} />);
        expect(onUp).toHaveBeenCalledTimes(1);
    });

    it("keeps its listeners across a render that passes new inline callbacks", () => {
        const onDown = vi.fn();

        function Harness(): React.ReactElement {
            usePushToTalk({ onDown: () => onDown(), onUp: () => undefined });
            return <div />;
        }
        const { rerender } = render(<Harness />);

        key("keydown");
        rerender(<Harness />);
        key("keyup");
        key("keydown");

        expect(onDown).toHaveBeenCalledTimes(2);
    });
});

describe("pushToTalkKeyLabel", () => {
    it("names the keys a settings screen offers", () => {
        expect(pushToTalkKeyLabel("Space")).toBe("Espaço");
        expect(pushToTalkKeyLabel("ControlLeft")).toBe("Ctrl esquerdo");
    });

    it("falls back to the code, because showing F13 beats showing nothing", () => {
        expect(pushToTalkKeyLabel("F13")).toBe("F13");
    });

    it("labels every key it offers", () => {
        for (const entry of PUSH_TO_TALK_KEYS) {
            expect(pushToTalkKeyLabel(entry.code)).toBe(entry.label);
        }
    });
});
