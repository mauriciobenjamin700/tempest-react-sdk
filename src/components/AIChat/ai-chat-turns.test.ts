import { describe, expect, it } from "vitest";

import {
    aiChatStrings,
    isGenerating,
    lastAssistantId,
    roleLabel,
    tailSignature,
    turnTime,
    visibleTurns,
    type AIChatMessage,
} from "./ai-chat-turns";

const turn = (over: Partial<AIChatMessage> & { id: string }): AIChatMessage => ({
    role: "assistant",
    content: "",
    ...over,
});

describe("visibleTurns", () => {
    it("drops system turns by default", () => {
        const turns = visibleTurns({
            messages: [
                turn({ id: "s", role: "system", content: "Você é útil" }),
                turn({ id: "u", role: "user", content: "oi" }),
            ],
        });
        expect(turns.map((message) => message.id)).toEqual(["u"]);
    });

    it("keeps system turns when asked", () => {
        const turns = visibleTurns({
            messages: [turn({ id: "s", role: "system" }), turn({ id: "u", role: "user" })],
            showSystem: true,
        });
        expect(turns.map((message) => message.id)).toEqual(["s", "u"]);
    });

    it("never reorders", () => {
        const turns = visibleTurns({
            messages: [turn({ id: "b" }), turn({ id: "a" }), turn({ id: "c" })],
        });
        expect(turns.map((message) => message.id)).toEqual(["b", "a", "c"]);
    });
});

describe("isGenerating", () => {
    it("is false on an empty thread", () => {
        expect(isGenerating([])).toBe(false);
    });

    it("is true while any turn streams", () => {
        expect(isGenerating([turn({ id: "a" }), turn({ id: "b", streaming: true })])).toBe(true);
    });

    it("is false once nothing streams", () => {
        expect(isGenerating([turn({ id: "a", streaming: false }), turn({ id: "b" })])).toBe(false);
    });
});

describe("lastAssistantId", () => {
    it("returns null with no assistant turn", () => {
        expect(lastAssistantId([turn({ id: "u", role: "user" })])).toBeNull();
    });

    it("returns the newest assistant turn, not the newest turn", () => {
        const messages = [
            turn({ id: "a1" }),
            turn({ id: "u1", role: "user" }),
            turn({ id: "a2" }),
            turn({ id: "u2", role: "user" }),
        ];
        expect(lastAssistantId(messages)).toBe("a2");
    });
});

describe("tailSignature", () => {
    it("has a stable value for an empty thread", () => {
        expect(tailSignature([])).toBe("0");
    });

    it("changes when the tail text grows, even with the same array identity", () => {
        const tail = turn({ id: "a", content: "Oi" });
        const messages = [tail];
        const before = tailSignature(messages);
        tail.content = "Oi, tudo";
        expect(tailSignature(messages)).not.toBe(before);
    });

    it("changes when reasoning grows while the answer is still empty", () => {
        const tail = turn({ id: "a", reasoning: "pens" });
        const before = tailSignature([tail]);
        tail.reasoning = "pensando mais";
        expect(tailSignature([tail])).not.toBe(before);
    });

    it("changes when the stream ends", () => {
        const streaming = tailSignature([turn({ id: "a", content: "ok", streaming: true })]);
        const settled = tailSignature([turn({ id: "a", content: "ok" })]);
        expect(streaming).not.toBe(settled);
    });

    it("changes when a turn is appended", () => {
        const one = tailSignature([turn({ id: "a", content: "x" })]);
        const two = tailSignature([turn({ id: "a", content: "x" }), turn({ id: "b" })]);
        expect(one).not.toBe(two);
    });

    it("is equal for two structurally identical threads", () => {
        expect(tailSignature([turn({ id: "a", content: "x" })])).toBe(
            tailSignature([turn({ id: "a", content: "x" })]),
        );
    });
});

describe("aiChatStrings", () => {
    it("defaults to pt-BR", () => {
        expect(aiChatStrings("pt-BR").stop).toBe("Parar");
    });

    it("has an en variant for every key", () => {
        const pt = aiChatStrings("pt-BR");
        const en = aiChatStrings("en");
        expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
        expect(en.stop).toBe("Stop");
    });
});

describe("roleLabel", () => {
    const strings = aiChatStrings("en");

    it("labels each role", () => {
        expect(roleLabel("user", strings)).toBe("You");
        expect(roleLabel("assistant", strings)).toBe("Assistant");
        expect(roleLabel("system", strings)).toBe("System");
    });
});

describe("turnTime", () => {
    const noon = new Date(2026, 2, 10, 14, 5, 0).getTime();

    it("formats the wall clock, not a relative phrase", () => {
        expect(turnTime(noon)).toMatch(/14[:h]05/);
    });

    it("formats in en-US when asked", () => {
        expect(turnTime(noon, "en")).toMatch(/2:05/);
    });
});
